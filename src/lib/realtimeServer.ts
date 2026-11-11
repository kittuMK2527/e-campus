import { logger } from "./logger";

export interface RealtimeClient {
  id: string;
  userId?: string;
  aliases?: string[];
  role?: string;
  collegeId?: string;
  controller: ReadableStreamDefaultController;
}

export interface RealtimeEvent {
  domain: "requests" | "attendance" | "exams" | "daily_configs" | "feedback" | "notifications" | "tracker" | "general" | (string & {});
  action: string;
  targetUserIds?: string[];
  targetRoles?: string[];
  collegeId?: string;
  payload?: any;
  timestamp?: number;
}

// Persist active subscriber set across dev module reloads via globalThis
const globalForRealtime = globalThis as unknown as {
  _fpRealtimeClients?: Set<RealtimeClient>;
};

const clients: Set<RealtimeClient> =
  globalForRealtime._fpRealtimeClients || new Set<RealtimeClient>();

if (process.env.NODE_ENV !== "production") {
  globalForRealtime._fpRealtimeClients = clients;
}

export function addRealtimeClient(client: RealtimeClient) {
  clients.add(client);
  // Send initial handshake
  try {
    const encoder = new TextEncoder();
    client.controller.enqueue(
      encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: "connected", at: Date.now() })}\n\n`)
    );
  } catch (_) {
    clients.delete(client);
  }
}

export function removeRealtimeClient(id: string) {
  for (const client of clients) {
    if (client.id === id) {
      clients.delete(client);
      break;
    }
  }
}

export function notifyRealtimeEvent(event: RealtimeEvent) {
  const encoder = new TextEncoder();
  const fullEvent = {
    ...event,
    timestamp: event.timestamp || Date.now()
  };
  const message = `event: fp_event\ndata: ${JSON.stringify(fullEvent)}\n\n`;
  const encoded = encoder.encode(message);

  const staleClients: RealtimeClient[] = [];

  const targetUserIdsLower = event.targetUserIds && event.targetUserIds.length > 0
    ? new Set(event.targetUserIds.map((u) => String(u).toLowerCase().trim()))
    : null;

  const targetRolesLower = event.targetRoles && event.targetRoles.length > 0
    ? new Set(event.targetRoles.map((r) => String(r).toLowerCase().trim()))
    : null;

  for (const client of clients) {
    try {
      const clientRoleLower = client.role ? client.role.toLowerCase().trim() : "";
      const clientAliases = new Set<string>();
      if (client.userId) clientAliases.add(client.userId.toLowerCase().trim());
      if (client.aliases) {
        client.aliases.forEach((a) => clientAliases.add(String(a).toLowerCase().trim()));
      }

      let isTargeted = false;

      // 1. User alias matching (case-insensitive across user UUID, reference_id, and email)
      if (targetUserIdsLower && targetUserIdsLower.size > 0) {
        for (const alias of clientAliases) {
          if (targetUserIdsLower.has(alias)) {
            isTargeted = true;
            break;
          }
        }
      }

      // 2. Role matching
      if (!isTargeted && targetRolesLower && targetRolesLower.size > 0) {
        if (clientRoleLower && (targetRolesLower.has(clientRoleLower) || targetRolesLower.has("all"))) {
          isTargeted = true;
        }
      }

      // 3. Super Admin global governance & system alerts
      if (!isTargeted && (clientRoleLower === "admin" || clientRoleLower === "superadmin")) {
        if (
          event.domain === "notifications" ||
          event.domain === "feedback" ||
          (event.domain === "requests" && (!targetRolesLower || targetRolesLower.has("admin")))
        ) {
          isTargeted = true;
        }
      }

      // 4. Universal broadcast if no specific user or role constraints
      if (!targetUserIdsLower && !targetRolesLower) {
        isTargeted = true;
      }

      if (!isTargeted) continue;

      // 5. College scope filter (Admins bypass college filters to see system-wide events)
      if (
        event.collegeId &&
        client.collegeId &&
        client.collegeId !== "all" &&
        event.collegeId !== "all" &&
        clientRoleLower !== "admin" &&
        clientRoleLower !== "superadmin"
      ) {
        if (client.collegeId.toLowerCase() !== event.collegeId.toLowerCase()) {
          continue;
        }
      }

      client.controller.enqueue(encoded);
    } catch (err) {
      staleClients.push(client);
    }
  }

  for (const stale of staleClients) {
    clients.delete(stale);
  }
}

