"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RedirectingLoader } from "@/components/RedirectingLoader";

export default function KamIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/kam/overview");
  }, [router]);
  return <RedirectingLoader label="Loading KAM Portfolio…" />;
}
