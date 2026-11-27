import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { processUpcomingDemoReminders } from "@/lib/demoReminderCheck";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const result = await processUpcomingDemoReminders(db);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[check-reminders] Error:", error);
    return NextResponse.json({ success: false, message: error?.message || "Internal error." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
