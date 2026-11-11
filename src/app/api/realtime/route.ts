export const dynamic = "force-dynamic";

import { getSessionFromRequest } from "@/lib/api-auth";
import { addRealtimeClient, removeRealtimeClient } from "@/lib/realtimeServer";
import { generateId } from "@/lib/id";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let session = null;
  try {
    session = await getSessionFromRequest(request);
  } catch (_) {}

  const userId = session?.userId || searchParams.get("userId") || "";
  const role = session?.role || searchParams.get("role") || "";
  const collegeId = session?.collegeId || searchParams.get("collegeId") || "";

  const aliasSet = new Set<string>();
  if (userId) aliasSet.add(String(userId).trim());
  if (session?.userId) aliasSet.add(String(session.userId).trim());
  if (session?.email) aliasSet.add(String(session.email).trim());
  const queryUserId = searchParams.get("userId");
  if (queryUserId) aliasSet.add(String(queryUserId).trim());

  const clientId = generateId("rtc");
  let intervalId: any = null;

  const stream = new ReadableStream({
    start(controller) {
      addRealtimeClient({
        id: clientId,
        userId: userId ? String(userId) : undefined,
        aliases: Array.from(aliasSet),
        role: role ? String(role) : undefined,
        collegeId: collegeId ? String(collegeId) : undefined,
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
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
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
