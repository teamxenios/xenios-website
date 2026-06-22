import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

export const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : null;

const unavailableDb: any = {
  insert: async () => {
    throw new Error("DATABASE_URL is not set. Legacy Postgres routes are unavailable.");
  },
  select: async () => {
    throw new Error("DATABASE_URL is not set. Legacy Postgres routes are unavailable.");
  },
  update: async () => {
    throw new Error("DATABASE_URL is not set. Legacy Postgres routes are unavailable.");
  },
  transaction: async () => {
    throw new Error("DATABASE_URL is not set. Legacy Postgres routes are unavailable.");
  },
};

export const db = databaseUrl ? drizzle(pool!, { schema }) : unavailableDb;
