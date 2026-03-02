export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDb } from "@core/db";
import { sql } from "drizzle-orm";

export async function GET() {
  const db = getDb();
  const rows = db.all(sql`
    SELECT tool_type, COUNT(*) as count
    FROM sessions
    GROUP BY tool_type
    HAVING count > 0
    ORDER BY count DESC
  `);
  return NextResponse.json(rows);
}
