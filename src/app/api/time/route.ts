import { NextResponse } from "next/server";
import { getInstitutionDateStr, INSTITUTION_TIME_ZONE } from "@/lib/localDate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0"
};

export async function GET() {
  const now = new Date();
  const serverTime = now.toISOString();
  const timestamp = now.getTime();
  const serverDate = getInstitutionDateStr(now);
  const timeFormatted = now.toLocaleTimeString("en-IN", {
    timeZone: INSTITUTION_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });

  return NextResponse.json(
    {
      success: true,
      serverTime,
      serverDate,
      timestamp,
      timeFormatted,
      timeZone: INSTITUTION_TIME_ZONE
    },
    { headers: noCacheHeaders }
  );
}
