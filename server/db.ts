// server/db.ts

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { Pool } from 'pg';
import * as schema from '@college-pickem/shared';

// No logger import is needed when using the boolean flag with drizzle-orm/postgres-js

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set!');
}

// Create a single, persistent client for your local server environment
const client = postgres(connectionString);

// Pass the client, schema, and the logger option to Drizzle
export const db = drizzle(client, { schema, logger: false });

// Create a PostgreSQL connection pool for session store
export const pool = new Pool({
  connectionString: connectionString
});