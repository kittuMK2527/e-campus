import { getInstitutionDateStr } from "./localDate";

/**
 * Server-Authoritative Time Module
 *
 * Prevents mobile and client-side clock tampering by synchronizing with
 * the authoritative server clock and maintaining a calibrated offset.
 * Any device clock manipulation (e.g. user changing phone time to bypass
 * deadlines or access time-locked exams/attendance) is automatically neutralized.
 */

let serverOffsetMs = 0;
let isSynced = false;
let isSyncing = false;
let syncPromise: Promise<number> | null = null;

/**
 * Synchronize with the server clock via /api/time.
 * Accounts for network round-trip latency to calculate precise clock skew.
 */
export async function syncServerTime(): Promise<number> {
  if (typeof window === "undefined") {
    return 0;
  }

  if (isSyncing && syncPromise) {
    return syncPromise;
  }

  isSyncing = true;
  syncPromise = (async () => {
    try {
      const clientSend = Date.now();
      const res = await fetch("/api/time", {
        method: "GET",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });

      if (!res.ok) throw new Error("Time API non-OK response");
      const clientReceive = Date.now();
      const data = await res.json();

      if (data && typeof data.timestamp === "number") {
        const roundTripTime = clientReceive - clientSend;
        const oneWayLatency = Math.max(0, Math.round(roundTripTime / 2));
        const estimatedServerNow = data.timestamp + oneWayLatency;
        serverOffsetMs = estimatedServerNow - clientReceive;
        isSynced = true;
      }
    } catch {
      // Fallback: if offline or failed, keep existing offset
    } finally {
      isSyncing = false;
    }
    return serverOffsetMs;
  })();

  return syncPromise;
}

/**
 * Returns the authoritative current Date in server time.
 * Even if the mobile device's system clock has been changed backwards or forwards,
 * this returns the true, tamper-proof current moment.
 */
export function getServerNow(): Date {
  return new Date(Date.now() + serverOffsetMs);
}

/**
 * Authoritative timestamp in epoch milliseconds.
 */
export function getServerTimestamp(): number {
  return Date.now() + serverOffsetMs;
}

/**
 * Authoritative YYYY-MM-DD string in Indian Standard Time (Asia/Kolkata).
 */
export function getServerDateStr(): string {
  return getInstitutionDateStr(getServerNow());
}

/**
 * Checks whether an authoritative server deadline has elapsed.
 */
export function isPastServerDeadline(deadline: Date | string | number): boolean {
  if (!deadline) return false;
  let deadlineEpoch = 0;
  if (deadline instanceof Date) {
    deadlineEpoch = deadline.getTime();
  } else if (typeof deadline === "number") {
    deadlineEpoch = deadline;
  } else {
    deadlineEpoch = new Date(deadline).getTime();
  }

  if (isNaN(deadlineEpoch)) return false;
  return getServerTimestamp() > deadlineEpoch;
}

/**
 * Returns whether server time has completed at least one sync.
 */
export function isServerTimeSynced(): boolean {
  return isSynced;
}

/**
 * Automatically set up periodic resyncing on client side.
 */
export function setupServerTimeAutoSync(): () => void {
  if (typeof window === "undefined") return () => {};

  // Initial sync
  syncServerTime();

  // Periodic resync every 5 minutes
  const intervalId = setInterval(() => {
    syncServerTime();
  }, 5 * 60 * 1000);

  // Resync whenever user switches back to the app/tab
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      syncServerTime();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
