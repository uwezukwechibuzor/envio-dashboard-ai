import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

function getDb() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 10 });
  return drizzle(sql, { schema });
}

// Singleton — reuse connection across hot-reloads in dev
declare global {
  var __db: ReturnType<typeof getDb> | undefined;
}

export const db = globalThis.__db ?? (globalThis.__db = getDb());
export { schema };
