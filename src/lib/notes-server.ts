import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Signed-in user id, or null. Every notes route is owner-scoped by this. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export const unauthorized = () =>
  Response.json({ message: "Unauthorized" }, { status: 401 });
export const notFound = () =>
  Response.json({ message: "Not found" }, { status: 404 });
