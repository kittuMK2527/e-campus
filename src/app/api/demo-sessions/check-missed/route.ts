export const maxDuration = 60;

import { NextResponse } from "next/server";
import { processMissedDemoSessions } from "@/lib/demoMissedCheck";

export async function POST() {
  try {
    const res = await processMissedDemoSessions();
    return NextResponse.json({ success: true, ...res });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const res = await processMissedDemoSessions();
    return NextResponse.json({ success: true, ...res });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}
