import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { noteCitations, noteLinks, notes } from "@/db/schema";
import { extractRefs } from "@/lib/notes";
import { UUID_RE, currentUserId, notFound, unauthorized } from "@/lib/notes-server";

type Ctx = { params: Promise<{ id: string }> };
const MAX_DOC_BYTES = 1_000_000;

async function own(id: string, userId: string) {
  if (!UUID_RE.test(id)) return null;
  const [row] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)));
  return row ?? null;
}

// GET — the note plus its backlinks (the caller's notes that [[link]] to it).
export async function GET(_req: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const note = await own((await params).id, userId);
  if (!note) return notFound();
  const backlinks = await db
    .select({ id: notes.id, title: notes.title })
    .from(noteLinks)
    .innerJoin(notes, eq(notes.id, noteLinks.fromNoteId))
    .where(and(eq(noteLinks.toNoteId, note.id), eq(notes.userId, userId)));
  return Response.json({ ...note, backlinks });
}

// PATCH { title?, doc? } — autosave. Re-derives the citation/link index from
// the doc in the same transaction so backlinks never drift from content.
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const note = await own((await params).id, userId);
  if (!note) return notFound();

  const raw = await req.text();
  if (raw.length > MAX_DOC_BYTES) {
    return Response.json({ message: "Note too large" }, { status: 413 });
  }
  let body: { title?: unknown; doc?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ message: "Invalid JSON" }, { status: 400 });
  }
  if (body.doc !== undefined && !Array.isArray(body.doc)) {
    return Response.json({ message: "doc must be an array" }, { status: 400 });
  }
  const patch: Partial<typeof notes.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.title === "string") patch.title = body.title.slice(0, 500);
  if (body.doc !== undefined) patch.doc = body.doc;

  await db.transaction(async (tx) => {
    await tx.update(notes).set(patch).where(eq(notes.id, note.id));
    if (body.doc === undefined) return;
    const { citations, links } = extractRefs(body.doc);
    await tx.delete(noteCitations).where(eq(noteCitations.noteId, note.id));
    await tx.delete(noteLinks).where(eq(noteLinks.fromNoteId, note.id));
    if (citations.length) {
      await tx.insert(noteCitations).values(citations.map((c) => ({ ...c, noteId: note.id })));
    }
    // Only link to the caller's own notes; a forged id must not create an edge
    // into someone else's note.
    const targets = links.filter((l) => UUID_RE.test(l) && l !== note.id);
    if (targets.length) {
      const mine = await tx
        .select({ id: notes.id })
        .from(notes)
        .where(and(eq(notes.userId, userId), inArray(notes.id, targets)));
      const rows = mine.map((r) => ({ fromNoteId: note.id, toNoteId: r.id }));
      if (rows.length) await tx.insert(noteLinks).values(rows).onConflictDoNothing();
    }
  });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();
  const note = await own((await params).id, userId);
  if (!note) return notFound();
  await db.delete(notes).where(eq(notes.id, note.id)); // citations/links cascade
  return new Response(null, { status: 204 });
}
