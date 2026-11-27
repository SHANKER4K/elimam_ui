import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { currentUserId, unauthorized } from "@/lib/notes-server";

// GET /api/notes?q= — the caller's notes, newest first. `q` filters by title
// (the [[ link picker).
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 100);
  const rows = await db
    .select({ id: notes.id, title: notes.title, updatedAt: notes.updatedAt })
    .from(notes)
    .where(
      q
        ? and(eq(notes.userId, userId), ilike(notes.title, `%${q.replace(/[%_\\]/g, "\\$&")}%`))
        : eq(notes.userId, userId),
    )
    .orderBy(desc(notes.updatedAt))
    .limit(q ? 10 : 200);
  return Response.json(rows);
}

// POST /api/notes — create an empty note (optionally titled).
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.slice(0, 500) : "";
  const [row] = await db
    .insert(notes)
    .values({ userId, title })
    .returning({ id: notes.id, title: notes.title });
  return Response.json(row, { status: 201 });
}
