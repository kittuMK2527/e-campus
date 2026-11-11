/**
 * Real-Time Event Sync Engine for FP Time Table System.
 *
 * Combines:
 * 1. BroadcastChannel API for 0ms sub-millisecond local cross-tab synchronization.
 * 2. Server-Sent Events (SSE) via /api/realtime for cross-device, cross-user triggers.
 * 3. LocalStorage events fallback for older or restricted environments.
 */

export interface RealtimeSyncPayload {
  domain: string;
  action?: string;
  at: number;
  collegeId?: string;
  payload?: any;
}

let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  try {
    broadcastChannel = new BroadcastChannel("fp_realtime_bus");
  } catch (_) {}
}

/**
 * Broadcasts to all open tabs and roles that a data domain changed.
 * Triggered on user action (e.g. CM approving late attendance, Mentor submitting handover).
 */
export function announceDataChanged(domain: string, payload?: any) {
  if (typeof window === "undefined") return;
  const eventPayload: RealtimeSyncPayload = {
    domain,
    at: Date.now(),
    payload
  };

  try {
    // 1. In-page CustomEvent
    window.dispatchEvent(new CustomEvent("fp_data_changed", { detail: eventPayload }));

    // 2. BroadcastChannel (0ms instant cross-tab sync)
    if (broadcastChannel) {
      broadcastChannel.postMessage(eventPayload);
    }

    // 3. LocalStorage fallback
    localStorage.setItem("fp_data_changed", JSON.stringify(eventPayload));
  } catch (_) {
    /* storage or broadcast may fail in private mode; in-page event still fired */
  }
}

/**
 * Initializes real-time listener for both BroadcastChannel and Server-Sent Events (SSE).
 * Returns a cleanup unsubscribe function.
 */
export function subscribeToRealtimeSync(
  onEvent: (event: RealtimeSyncPayload) => void,
  userScope?: { userId?: string; role?: string; collegeId?: string }
): () => void {
  if (typeof window === "undefined") return () => {};

  let sseSource: EventSource | null = null;
  let sseReconnectTimeout: any = null;
  let isCleanedUp = false;
  let lastSeenAt = 0;

  const handleIncomingEvent = (evt: RealtimeSyncPayload) => {
    if (!evt || !evt.domain) return;
    // Suppress duplicate echoes received within 150ms for identical domain/timestamp
    if (evt.at && evt.at === lastSeenAt) return;
    lastSeenAt = evt.at || Date.now();
    onEvent(evt);
  };

  // 1. BroadcastChannel Listener (Same-browser, cross-tab instant 0ms)
  const handleBroadcastMessage = (e: MessageEvent) => {
    if (e.data && e.data.domain) {
      handleIncomingEvent(e.data);
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener("message", handleBroadcastMessage);
  }

  // 2. Cross-tab LocalStorage fallback
  const handleStorage = (e: StorageEvent) => {
    if (e.key === "fp_data_changed" && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        handleIncomingEvent(parsed);
      } catch (_) {}
    }
  };
  window.addEventListener("storage", handleStorage);

  // 3. Server-Sent Events (Cross-device, cross-user real-time push)
  const connectSSE = () => {
    if (isCleanedUp) return;

    try {
      const params = new URLSearchParams();
      if (userScope?.userId) params.set("userId", userScope.userId);
      if (userScope?.role) params.set("role", userScope.role);
      if (userScope?.collegeId) params.set("collegeId", userScope.collegeId);

      const url = `/api/realtime?${params.toString()}`;
      sseSource = new EventSource(url);

      sseSource.addEventListener("fp_event", (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data);
          handleIncomingEvent({
            domain: parsed.domain || "general",
            action: parsed.action,
            at: parsed.timestamp || Date.now(),
            collegeId: parsed.collegeId,
            payload: parsed.payload
          });
        } catch (_) {}
      });

      sseSource.onerror = () => {
        if (sseSource) {
          sseSource.close();
          sseSource = null;
        }
        // Attempt reconnect with exponential jitter (3s to 8s)
        if (!isCleanedUp) {
          const retryMs = 3000 + Math.random() * 5000;
          sseReconnectTimeout = setTimeout(connectSSE, retryMs);
        }
      };
    } catch (_) {}
  };

  connectSSE();

  return () => {
    isCleanedUp = true;
    if (sseReconnectTimeout) clearTimeout(sseReconnectTimeout);
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
    if (broadcastChannel) {
      broadcastChannel.removeEventListener("message", handleBroadcastMessage);
    }
    window.removeEventListener("storage", handleStorage);
  };
}
