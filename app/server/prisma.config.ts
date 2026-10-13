import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `schema.prisma` names two connection strings: DATABASE_URL (what the app
// queries through) and DIRECT_URL (what migrations run through). They differ
// only behind a connection pooler such as Supabase's. A plain PostgreSQL on
// the host computer has one address, so a blank or missing DIRECT_URL means
// "the same as DATABASE_URL" — every Prisma command loads this file first.
if (!process.env.DIRECT_URL?.trim() && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
});
