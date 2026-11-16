export const dynamic = "force-dynamic";
// Bound each stream so a serverless instance is not pinned forever; the client
// reconnects automatically (lib/dataSync) and the outbox poller covers the gap.
export const maxDuration = 300;

import { getSessionFromRequest } from "@/lib/api-auth";
import { addRealtimeClient, removeRealtimeClient } from "@/lib/realtimeServer";
import { generateId } from "@/lib/id";

export async function GET(request: Request) {
  // Identity, role and campus come ONLY from the verified session. The stream used
  // to fall back to ?role=&collegeId= query params, so an anonymous caller could
  // subscribe as role=admin and receive admin broadcasts.
  let session = null;
  try {
    session = await getSessionFromRequest(request);
  } catch (_) {
    session = null;
  }
  if (!session) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const userId = String(session.userId || "");
  const role = String(session.role || "");
  const collegeId = session.collegeId ? String(session.collegeId) : "";

  const aliasSet = new Set<string>();
  if (userId) aliasSet.add(userId.trim());
  if (session.email) aliasSet.add(String(session.email).trim());

  const clientId = generateId("rtc");
  let intervalId: any = null;
  let timeoutId: any = null;

  const stream = new ReadableStream({
    start(controller) {
      addRealtimeClient({
        id: clientId,
        userId: userId || undefined,
        aliases: Array.from(aliasSet),
        role: role || undefined,
        collegeId: collegeId || undefined,
        controller
      });

      // Keepalive heartbeat every 20 seconds to prevent reverse proxy/browser timeouts
      const encoder = new TextEncoder();
      intervalId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch (_) {
          clearInterval(intervalId);
          removeRealtimeClient(clientId);
        }
      }, 20000);

      // Gracefully close stream before Vercel's 300s limit so browser EventSource
      // reconnects cleanly without triggering a 504 / Task timed out log error.
      timeoutId = setTimeout(() => {
        try {
          controller.close();
        } catch (_) {}
        if (intervalId) clearInterval(intervalId);
        removeRealtimeClient(clientId);
      }, 270000);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      removeRealtimeClient(clientId);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
