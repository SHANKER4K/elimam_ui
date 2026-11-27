"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NotebookPen, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// BlockNote touches the DOM at construction: client-only.
export const NoteEditor = dynamic(() => import("./note-editor-impl"), {
  ssr: false,
  loading: () => <Skeleton className="h-[50vh] w-full" />,
});

export function NewNoteButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await fetch("/api/notes", { method: "POST" });
        if (r.ok) router.push(`/notes/${(await r.json()).id}`);
        else setBusy(false);
      }}
      className="gap-1"
    >
      <Plus className="size-4" /> ملاحظة جديدة
    </Button>
  );
}

export function DeleteNoteButton({ noteId }: { noteId: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 text-muted-foreground hover:text-destructive"
      onClick={async () => {
        if (!confirm("حذف هذه الملاحظة نهائيًا؟")) return;
        const r = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
        if (r.ok) router.push("/notes");
      }}
    >
      <Trash2 className="size-4" /> حذف
    </Button>
  );
}

/**
 * "Your notes on this ayah/hadith" for reader pages. Renders nothing when
 * signed out or when no note cites `refKey`.
 */
export function NoteBacklinks({ refKey, label }: { refKey: string; label: string }) {
  const [rows, setRows] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    fetch(`/api/notes/backlinks?ref=${encodeURIComponent(refKey)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => {});
  }, [refKey]);
  if (!rows.length) return null;
  return (
    <section className="rounded-xl border border-border/60 bg-card p-4" dir="rtl">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <NotebookPen className="size-4" /> {label}
      </h2>
      <ul className="space-y-1">
        {rows.map((n) => (
          <li key={n.id}>
            <Link href={`/notes/${n.id}`} className="text-primary hover:underline">
              {n.title || "بلا عنوان"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
