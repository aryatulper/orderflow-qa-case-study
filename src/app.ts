import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import { Pool, PoolClient } from 'pg';
import { inTransaction, pool } from './db';
import { cancellationAllowed, DomainError, paymentAllowed, positiveInt, refundStatus, OrderStatus } from './domain';

type User = { id: number; email: string; display_name: string; role: 'customer' | 'admin' };
type OrderRow = { id: number; user_id: number; status: OrderStatus; total_cents: number; created_at: Date };
type ItemInput = { productId: number; quantity: number };

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

function getUser(res: Response): User {
  return res.locals.user as User;
}

// The database stores a token hash, never the bearer token sent by the browser.
async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(req.header('authorization') || '');
  if (!match) throw new DomainError(401, 'UNAUTHORIZED', 'A valid bearer token is required');
  const tokenHash = createHash('sha256').update(match[1]!).digest('hex');
  const result = await pool.query<User>(
    `SELECT u.id, u.email, u.display_name, u.role FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.created_at > now() - interval '24 hours'`,
    [tokenHash]
  );
  if (!result.rows[0]) throw new DomainError(401, 'UNAUTHORIZED', 'Session expired or invalid');
  res.locals.user = result.rows[0];
  next();
}

function requireAdmin(res: Response): void {
  if (getUser(res).role !== 'admin') throw new DomainError(403, 'FORBIDDEN', 'Admin role is required');
}

// Lock the order before changing payment or refund state so concurrent requests serialize.
async function lockedOrder(client: PoolClient, id: number): Promise<OrderRow> {
  const result = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
  if (!result.rows[0]) throw new DomainError(404, 'NOT_FOUND', 'Order not found');
  return result.rows[0];
}

function requireOwner(order: OrderRow, user: User): void {
  // Do not disclose whether another customer's order exists.
  if (order.user_id !== user.id && user.role !== 'admin') {
    throw new DomainError(404, 'NOT_FOUND', 'Order not found');
  }
}

// List, detail and mutation responses all use this same order-and-ledger shape.
async function orderView(client: PoolClient | Pool, id: number, user: User) {
  const orderResult = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [id]);
  const order = orderResult.rows[0];
  if (!order) throw new DomainError(404, 'NOT_FOUND', 'Order not found');
  requireOwner(order, user);
  const [items, payments, refunds] = await Promise.all([
    client.query(`SELECT oi.product_id AS "productId", p.name, oi.quantity, oi.unit_price_cents AS "unitPriceCents"
                  FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1 ORDER BY oi.product_id`, [id]),
    client.query(`SELECT id, amount_cents AS "amountCents", idempotency_key AS "idempotencyKey", created_at AS "createdAt"
                  FROM payments WHERE order_id = $1 ORDER BY id`, [id]),
    client.query(`SELECT id, amount_cents AS "amountCents", reason, created_at AS "createdAt"
                  FROM refunds WHERE order_id = $1 ORDER BY id`, [id])
  ]);
  return {
    id: order.id,
    userId: order.user_id,
    status: order.status,
    totalCents: order.total_cents,
    createdAt: order.created_at,
    items: items.rows,
    payments: payments.rows,
    refunds: refunds.rows
  };
}

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});

app.post('/api/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) throw new DomainError(400, 'INVALID_INPUT', 'Email and password are required');
  const result = await pool.query<User & { password_salt: string; password_hash: string }>(
    'SELECT * FROM users WHERE email = $1', [email]
  );
  const user = result.rows[0];
  if (!user) throw new DomainError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  const candidate = scryptSync(password, user.password_salt, 64);
  const expected = Buffer.from(user.password_hash, 'hex');
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    throw new DomainError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  const token = randomBytes(32).toString('hex');
  await pool.query('INSERT INTO sessions (token_hash, user_id) VALUES ($1, $2)', [createHash('sha256').update(token).digest('hex'), user.id]);
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } });
});

app.get('/api/products', async (_req, res) => {
  const result = await pool.query('SELECT id, name, price_cents AS "priceCents", stock FROM products ORDER BY id');
  res.json({ products: result.rows });
});

app.get('/api/orders', requireAuth, async (_req, res) => {
  const user = getUser(res);
  const result = user.role === 'admin'
    ? await pool.query('SELECT id FROM orders ORDER BY id DESC LIMIT 50')
    : await pool.query('SELECT id FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [user.id]);
  const orders = [];
  for (const row of result.rows) orders.push(await orderView(pool, row.id, user));
  res.json({ orders });
});

app.post('/api/orders', requireAuth, async (req, res) => {
  const user = getUser(res);
  if (user.role !== 'customer') throw new DomainError(403, 'FORBIDDEN', 'Only customers can create orders');
  if (!Array.isArray(req.body?.items) || req.body.items.length === 0 || req.body.items.length > 10) {
    throw new DomainError(400, 'INVALID_INPUT', 'items must contain 1 to 10 products');
  }
  const items: ItemInput[] = req.body.items.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new DomainError(400, 'INVALID_INPUT', 'Invalid item');
    const value = item as Record<string, unknown>;
    return { productId: positiveInt(value.productId, 'productId'), quantity: positiveInt(value.quantity, 'quantity') };
  });
  const ids = items.map(item => item.productId);
  if (new Set(ids).size !== ids.length) throw new DomainError(400, 'INVALID_INPUT', 'Duplicate products are not allowed');
  const order = await inTransaction(async client => {
    const pricedItems = [];
    let totalCents = 0;
    // Sorted product locks prevent overselling and avoid deadlocks between overlapping carts.
    for (const item of [...items].sort((a, b) => a.productId - b.productId)) {
      const productResult = await client.query<{ id: number; price_cents: number; stock: number }>(
        'SELECT id, price_cents, stock FROM products WHERE id = $1 FOR UPDATE', [item.productId]
      );
      const product = productResult.rows[0];
      if (!product) throw new DomainError(404, 'PRODUCT_NOT_FOUND', `Product ${item.productId} not found`);
      if (product.stock < item.quantity) throw new DomainError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for product ${item.productId}`);
      totalCents += product.price_cents * item.quantity;
      if (!Number.isSafeInteger(totalCents) || totalCents > 2_000_000_000) throw new DomainError(400, 'INVALID_INPUT', 'Order total is too large');
      pricedItems.push({ ...item, unitPriceCents: product.price_cents });
    }
    const result = await client.query<{ id: number }>(
      `INSERT INTO orders (user_id, status, total_cents) VALUES ($1, 'PENDING_PAYMENT', $2) RETURNING id`,
      [user.id, totalCents]
    );
    const orderId = result.rows[0]!.id;
    // Snapshot unit prices: later catalog changes must not rewrite an existing order.
    for (const item of pricedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)`,
        [orderId, item.productId, item.quantity, item.unitPriceCents]
      );
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, item.productId]);
    }
    return orderView(client, orderId, user);
  });
  res.status(201).json({ order });
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const id = positiveInt(Number(req.params.id), 'id');
  res.json({ order: await orderView(pool, id, getUser(res)) });
});

app.post('/api/orders/:id/payments', requireAuth, async (req, res) => {
  const id = positiveInt(Number(req.params.id), 'id');
  const key = req.header('Idempotency-Key') || '';
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
    throw new DomainError(400, 'INVALID_INPUT', 'Idempotency-Key must be 8-100 letters, digits, underscores or hyphens');
  }
  const user = getUser(res);
  const result = await inTransaction(async client => {
    const order = await lockedOrder(client, id);
    requireOwner(order, user);
    if (order.user_id !== user.id) throw new DomainError(403, 'FORBIDDEN', 'Only the customer can pay this order');
    // A retry with the same key returns the first result instead of a second payment.
    const existing = await client.query('SELECT id FROM payments WHERE order_id = $1 AND idempotency_key = $2', [id, key]);
    if (existing.rows[0]) return { replayed: true, order: await orderView(client, id, user) };
    if (!paymentAllowed(order.status)) throw new DomainError(409, 'INVALID_STATE', 'Order is not awaiting payment');
    await client.query('INSERT INTO payments (order_id, idempotency_key, amount_cents) VALUES ($1, $2, $3)', [id, key, order.total_cents]);
    await client.query(`UPDATE orders SET status = 'PAID' WHERE id = $1`, [id]);
    return { replayed: false, order: await orderView(client, id, user) };
  });
  res.status(result.replayed ? 200 : 201).json(result);
});

app.post('/api/orders/:id/cancel', requireAuth, async (req, res) => {
  const id = positiveInt(Number(req.params.id), 'id');
  const user = getUser(res);
  const order = await inTransaction(async client => {
    const current = await lockedOrder(client, id);
    requireOwner(current, user);
    if (current.user_id !== user.id) throw new DomainError(403, 'FORBIDDEN', 'Only the customer can cancel this order');
    if (!cancellationAllowed(current.status)) throw new DomainError(409, 'INVALID_STATE', 'Order cannot be cancelled in this state');
    // Paid cancellation records a full refund; both paths restore reserved stock once.
    if (current.status === 'PAID') {
      await client.query(`INSERT INTO refunds (order_id, amount_cents, reason) VALUES ($1, $2, 'CANCELLATION')`, [id, current.total_cents]);
    }
    await client.query(`UPDATE products p SET stock = p.stock + oi.quantity FROM order_items oi
                        WHERE oi.order_id = $1 AND oi.product_id = p.id`, [id]);
    await client.query(`UPDATE orders SET status = 'CANCELLED' WHERE id = $1`, [id]);
    return orderView(client, id, user);
  });
  res.json({ order });
});

app.post('/api/orders/:id/refunds', requireAuth, async (req, res) => {
  requireAdmin(res);
  const id = positiveInt(Number(req.params.id), 'id');
  const amountCents = positiveInt(req.body?.amountCents, 'amountCents');
  const user = getUser(res);
  const order = await inTransaction(async client => {
    const current = await lockedOrder(client, id);
    if (current.status !== 'PAID' && current.status !== 'PARTIALLY_REFUNDED') {
      throw new DomainError(409, 'INVALID_STATE', 'Only paid orders can be refunded');
    }
    const refunded = await client.query<{ amount: string }>(
      'SELECT COALESCE(SUM(amount_cents), 0) AS amount FROM refunds WHERE order_id = $1', [id]
    );
    // Check cumulative refunds under the order lock, not against a stale UI balance.
    const nextStatus = refundStatus(current.total_cents, Number(refunded.rows[0]!.amount), amountCents);
    await client.query(`INSERT INTO refunds (order_id, amount_cents, reason) VALUES ($1, $2, 'RETURN')`, [id, amountCents]);
    await client.query('UPDATE orders SET status = $1 WHERE id = $2', [nextStatus, id]);
    return orderView(client, id, user);
  });
  res.status(201).json({ order });
});

app.use(express.static(path.resolve(process.cwd(), 'public')));

// Stable error codes let API tests distinguish business-rule failures from server failures.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof DomainError) {
    res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
});

export { app };
