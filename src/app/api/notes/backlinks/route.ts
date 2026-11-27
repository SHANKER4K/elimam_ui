import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { noteCitations, notes } from "@/db/schema";
import { currentUserId, unauthorized } from "@/lib/notes-server";

// GET /api/notes/backlinks?ref=quran:2:255 — the caller's notes citing a ref
// (the "ملاحظاتك على هذه الآية" panel on reader pages).
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const ref = new URL(req.url).searchParams.get("ref");
  if (!ref || ref.length > 200) {
    return Response.json({ message: "ref required" }, { status: 400 });
  }
  const rows = await db
    .selectDistinct({ id: notes.id, title: notes.title })
    .from(noteCitations)
    .innerJoin(notes, eq(notes.id, noteCitations.noteId))
    .where(and(eq(noteCitations.ref, ref), eq(notes.userId, userId)));
  return Response.json(rows);
}
