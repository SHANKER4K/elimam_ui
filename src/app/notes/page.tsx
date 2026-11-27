import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { currentUserId } from "@/lib/notes-server";
import { NewNoteButton } from "@/components/notebook/notebook";

export const metadata: Metadata = { title: "دفتر الملاحظات", robots: { index: false } };

export default async function NotesPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/auth/sign-in");
  const rows = await db
    .select({ id: notes.id, title: notes.title, updatedAt: notes.updatedAt })
    .from(notes)
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="font-arabic text-2xl font-bold">دفتر الملاحظات</h1>
        <NewNoteButton />
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          لا ملاحظات بعد. اكتب <kbd>/آية</kbd> أو <kbd>/حديث</kbd> داخل ملاحظة لإدراج مصدر، و<kbd>[[</kbd> للربط بملاحظة أخرى.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((n) => (
            <li key={n.id}>
              <Link href={`/notes/${n.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted">
                <span dir="auto">{n.title || "بلا عنوان"}</span>
                <time className="text-xs text-muted-foreground" dateTime={n.updatedAt.toISOString()}>
                  {n.updatedAt.toLocaleDateString("ar")}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
