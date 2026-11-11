"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuditRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedRole = localStorage.getItem("fp_current_role") || "cm";
      if (storedRole === "kam") {
        router.replace("/kam/audit");
      } else {
        router.replace("/cm/audit");
      }
    }
  }, [router]);

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-slate-50 text-slate-400 font-bold text-sm">
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
        <span>Loading Campus E-Audit Portal...</span>
      </div>
    </div>
  );
}
