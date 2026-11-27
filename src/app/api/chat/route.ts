import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { identityHeaders } from "@/lib/identity";

export async function POST(req: Request) {
  // gate the inference relay — proxy matcher can't cover /api/* paths
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  // AG-UI RunAgentInput; the chat config rides in forwardedProps.
  const body = await req.json();
  // ponytail: strip any client-sent api_key — FastAPI fetches the key
  // itself via get_decrypted_key(request.state.user_id, model_provider).
  // user_id is stripped too: identity is signed below, never taken from
  // the body.
  const { api_key: _unused, user_id: _alsoUnused, ...forwardedProps } =
    body.forwardedProps ?? {};
  void _unused;
  void _alsoUnused;
  const forward = { ...body, forwardedProps };

  const identity = identityHeaders(session.user.id);
  if (!identity) {
    return Response.json(
      { message: "USER_SHARED_SECRET is not configured" },
      { status: 500 },
    );
  }

  // ponytail: relays the backend's AG-UI event stream verbatim; the relay
  // needs no event awareness. Route per SHANKER4K/elimam#20.
  const url = process.env.NEXT_PUBLIC_API_URL;
  const backend = await fetch(url + "/chat/agui", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...identity },
    body: JSON.stringify(forward),
  });

  // Forward the backend's non-2xx status + JSON body as-is so the client
  // can surface the error (400 API key not set, 404 session, 409...).
  if (!backend.ok) {
    return new Response(backend.body, {
      status: backend.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(backend.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
