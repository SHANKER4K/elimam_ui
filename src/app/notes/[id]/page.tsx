import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { noteLinks, notes } from "@/db/schema";
import { UUID_RE, currentUserId } from "@/lib/notes-server";
import { DeleteNoteButton, NoteEditor } from "@/components/notebook/notebook";

export const metadata: Metadata = { title: "ملاحظة", robots: { index: false } };

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect("/auth/sign-in");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)));
  if (!note) notFound();
  const backlinks = await db
    .select({ id: notes.id, title: notes.title })
    .from(noteLinks)
    .innerJoin(notes, eq(notes.id, noteLinks.fromNoteId))
    .where(and(eq(noteLinks.toNoteId, id), eq(notes.userId, userId)));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10" dir="rtl">
      <div className="flex items-center justify-between text-sm">
        <Link href="/notes" className="text-muted-foreground hover:text-foreground">← دفتر الملاحظات</Link>
        <DeleteNoteButton noteId={note.id} />
      </div>
      {/* key: remount the editor when navigating between notes via [[links]] */}
      <NoteEditor key={note.id} noteId={note.id} initialTitle={note.title} initialDoc={note.doc as unknown[]} />
      {backlinks.length > 0 && (
        <section className="rounded-xl border border-border/60 bg-card p-4">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">ملاحظات تشير إلى هذه الملاحظة</h2>
          <ul className="space-y-1">
            {backlinks.map((b) => (
              <li key={b.id}>
                <Link href={`/notes/${b.id}`} className="text-primary hover:underline">{b.title || "بلا عنوان"}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
