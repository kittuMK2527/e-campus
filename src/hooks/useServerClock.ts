"use client";

import { useEffect, useState } from "react";
import { getServerNow } from "@/lib/serverTime";

export function useServerClock(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => getServerNow());

  useEffect(() => {
    const refresh = () => setNow(getServerNow());
    const interval = window.setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [intervalMs]);

  return now;
}
