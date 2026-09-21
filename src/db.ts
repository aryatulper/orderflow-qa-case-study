import { randomBytes, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool, PoolClient } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://orderflow:orderflow@localhost:5432/orderflow' });

// One transaction keeps stock, order status and money records consistent on failure.
export async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Reproducible demo accounts and products make fresh local/CI runs testable.
export async function initializeDatabase(): Promise<void> {
  const schema = await readFile(path.resolve(process.cwd(), 'db/schema.sql'), 'utf8');
  await pool.query(schema);
  for (const [email, displayName, role] of [
    ['arya@example.test', 'Arya Customer', 'customer'],
    ['other@example.test', 'Other Customer', 'customer'],
    ['admin@example.test', 'Demo Admin', 'admin']
  ]) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync('demo123', salt, 64).toString('hex');
    await pool.query(
      `INSERT INTO users (email, display_name, role, password_salt, password_hash)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
      [email, displayName, role, salt, hash]
    );
  }
  for (const [name, priceCents, stock] of [
    ['Canvas Tote', 24900, 500],
    ['Ceramic Mug', 17900, 500],
    ['Notebook', 9900, 500],
    ['Limited Edition Pin', 4900, 1]
  ]) {
    await pool.query(
      `INSERT INTO products (name, price_cents, stock)
       VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
      [name, priceCents, stock]
    );
  }
}
