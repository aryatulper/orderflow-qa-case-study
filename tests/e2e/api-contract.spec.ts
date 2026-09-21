import { expect, request, test } from '@playwright/test';

async function login(api: Awaited<ReturnType<typeof request.newContext>>, email: string): Promise<string> {
  const response = await api.post('/api/login', { data: { email, password: 'demo123' } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).token;
}

test('payment replay creates only one payment and a second key conflicts', async ({ baseURL }) => {
  const api = await request.newContext({ baseURL });
  try {
    const token = await login(api, 'arya@example.test');
    const auth = { Authorization: `Bearer ${token}` };
    const created = await api.post('/api/orders', { headers: auth, data: { items: [{ productId: 1, quantity: 1 }] } });
    expect(created.status()).toBe(201);
    const id = (await created.json()).order.id;
    const headers = { ...auth, 'Idempotency-Key': `pw-replay-${id}` };
    const first = await api.post(`/api/orders/${id}/payments`, { headers });
    const replay = await api.post(`/api/orders/${id}/payments`, { headers });
    const duplicate = await api.post(`/api/orders/${id}/payments`, { headers: { ...auth, 'Idempotency-Key': `pw-other-${id}` } });
    expect(first.status()).toBe(201);
    expect(replay.status()).toBe(200);
    expect((await replay.json()).replayed).toBe(true);
    expect((await replay.json()).order.payments).toHaveLength(1);
    expect(duplicate.status()).toBe(409);
  } finally { await api.dispose(); }
});

test('another customer cannot view or cancel an order; admin cannot refund above paid amount', async ({ baseURL }) => {
  const api = await request.newContext({ baseURL });
  try {
    const owner = await login(api, 'arya@example.test');
    const other = await login(api, 'other@example.test');
    const admin = await login(api, 'admin@example.test');
    const created = await api.post('/api/orders', { headers: { Authorization: `Bearer ${owner}` }, data: { items: [{ productId: 2, quantity: 1 }] } });
    const id = (await created.json()).order.id;
    const hidden = await api.get(`/api/orders/${id}`, { headers: { Authorization: `Bearer ${other}` } });
    const blocked = await api.post(`/api/orders/${id}/cancel`, { headers: { Authorization: `Bearer ${other}` } });
    expect(hidden.status()).toBe(404);
    expect(blocked.status()).toBe(404);
    await api.post(`/api/orders/${id}/payments`, { headers: { Authorization: `Bearer ${owner}`, 'Idempotency-Key': `pw-owner-${id}` } });
    const tooMuch = await api.post(`/api/orders/${id}/refunds`, { headers: { Authorization: `Bearer ${admin}` }, data: { amountCents: 17901 } });
    expect(tooMuch.status()).toBe(409);
    expect((await tooMuch.json()).error.code).toBe('REFUND_LIMIT');
    const partial = await api.post(`/api/orders/${id}/refunds`, { headers: { Authorization: `Bearer ${admin}` }, data: { amountCents: 10000 } });
    expect(partial.status()).toBe(201);
    expect((await partial.json()).order.status).toBe('PARTIALLY_REFUNDED');
  } finally { await api.dispose(); }
});

test('paid cancellation creates one full refund and returns stock exactly once', async ({ baseURL }) => {
  const api = await request.newContext({ baseURL });
  try {
    const token = await login(api, 'arya@example.test');
    const auth = { Authorization: `Bearer ${token}` };
    const before = (await (await api.get('/api/products')).json()).products.find((product: { id: number }) => product.id === 3).stock;
    const created = await api.post('/api/orders', { headers: auth, data: { items: [{ productId: 3, quantity: 1 }] } });
    const id = (await created.json()).order.id;
    await api.post(`/api/orders/${id}/payments`, { headers: { ...auth, 'Idempotency-Key': `pw-cancel-${id}` } });
    const cancelled = await api.post(`/api/orders/${id}/cancel`, { headers: auth });
    expect(cancelled.status()).toBe(200);
    const order = (await cancelled.json()).order;
    expect(order.status).toBe('CANCELLED');
    expect(order.refunds).toHaveLength(1);
    expect(order.refunds[0].reason).toBe('CANCELLATION');
    expect(order.refunds[0].amountCents).toBe(order.totalCents);
    const repeated = await api.post(`/api/orders/${id}/cancel`, { headers: auth });
    expect(repeated.status()).toBe(409);
    const after = (await (await api.get('/api/products')).json()).products.find((product: { id: number }) => product.id === 3).stock;
    expect(after).toBe(before);
  } finally { await api.dispose(); }
});

test('parallel payment retries share one capture', async ({ baseURL }) => {
  const api = await request.newContext({ baseURL });
  try {
    const token = await login(api, 'arya@example.test');
    const auth = { Authorization: `Bearer ${token}` };
    const created = await api.post('/api/orders', { headers: auth, data: { items: [{ productId: 3, quantity: 1 }] } });
    const id = (await created.json()).order.id;
    const headers = { ...auth, 'Idempotency-Key': `parallel-pay-${id}` };
    const responses = await Promise.all([
      api.post(`/api/orders/${id}/payments`, { headers }),
      api.post(`/api/orders/${id}/payments`, { headers })
    ]);
    expect(responses.map(response => response.status()).sort()).toEqual([200, 201]);
    const order = (await (await api.get(`/api/orders/${id}`, { headers: auth })).json()).order;
    expect(order.payments).toHaveLength(1);
  } finally { await api.dispose(); }
});

test('parallel orders cannot oversell the limited-stock product', async ({ baseURL }) => {
  const api = await request.newContext({ baseURL });
  try {
    const token = await login(api, 'arya@example.test');
    const auth = { Authorization: `Bearer ${token}` };
    const product = (await (await api.get('/api/products')).json()).products.find((item: { id: number }) => item.id === 4);
    expect(product.stock).toBe(1);
    const responses = await Promise.all([
      api.post('/api/orders', { headers: auth, data: { items: [{ productId: 4, quantity: 1 }] } }),
      api.post('/api/orders', { headers: auth, data: { items: [{ productId: 4, quantity: 1 }] } })
    ]);
    expect(responses.map(response => response.status()).sort()).toEqual([201, 409]);
    const winner = responses.find(response => response.status() === 201)!;
    const id = (await winner.json()).order.id;
    const stockAfter = (await (await api.get('/api/products')).json()).products.find((item: { id: number }) => item.id === 4).stock;
    expect(stockAfter).toBe(0);
    const cancelled = await api.post(`/api/orders/${id}/cancel`, { headers: auth });
    expect(cancelled.status()).toBe(200);
    const stockRestored = (await (await api.get('/api/products')).json()).products.find((item: { id: number }) => item.id === 4).stock;
    expect(stockRestored).toBe(1);
  } finally { await api.dispose(); }
});
