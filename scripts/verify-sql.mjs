import { readFile } from 'node:fs/promises';
import pg from 'pg';

const sql = await readFile(new URL('../db/validations.sql', import.meta.url), 'utf8');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://orderflow:orderflow@localhost:5432/orderflow' });
try {
  // Each returned row names an invariant violation, so an empty result is the pass condition.
  const result = await pool.query(sql);
  if (result.rows.length) {
    console.error('SQL validation failed:', result.rows);
    process.exitCode = 1;
  } else {
    console.log('SQL validation passed: no order, payment, refund or stock anomalies.');
  }
} finally {
  await pool.end();
}
