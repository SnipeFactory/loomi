export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@core/db";

export async function GET() {
  const db = getDb();
  const rows = db.all(sql`
    SELECT provider, COUNT(*) as count
    FROM sessions
    GROUP BY provider
    HAVING count > 0
    ORDER BY count DESC
  `);

  return NextResponse.json(rows);
}
