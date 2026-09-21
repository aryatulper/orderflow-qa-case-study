import { mkdir } from 'node:fs/promises';
await mkdir('reports', { recursive: true });
