"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RedirectingLoader } from "@/components/RedirectingLoader";

export default function MentorIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/mentor/home");
  }, [router]);
  return <RedirectingLoader label="Loading Mentor Workspace…" />;
}
