import { app } from './app';
import { initializeDatabase, pool } from './db';

async function main() {
  await initializeDatabase();
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () => console.log(`OrderFlow listening on port ${port}`));
  const shutdown = () => server.close(() => void pool.end());
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(error => {
  console.error('Could not start OrderFlow:', error);
  process.exitCode = 1;
  void pool.end();
});
