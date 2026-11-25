import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import envConfigs from "../configs/env-configs.js";

const globalForDb = globalThis as unknown as {
  sql: ReturnType<typeof postgres> | undefined;
};

// Reuse connection pool across warm serverless instances and local hot-reloads
// `prepare: false` is required for Supabase / PgBouncer transaction poolers (port 6543)
const sql =
  globalForDb.sql ??
  postgres(envConfigs.databaseUrl, {
    max: process.env.VERCEL ? 5 : 20,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

globalForDb.sql = sql;

export const db = drizzle({
  client: sql,
  logger: process.env.NODE_ENV === "development",
});

// Export transaction type so service helper functions can accept either `db` or `tx`
export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbClient = Database | Transaction;
