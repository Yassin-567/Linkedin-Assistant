import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured. Add your Neon connection string in the deployment environment.");
  if (!client) client = neon(url);
  return client;
}
