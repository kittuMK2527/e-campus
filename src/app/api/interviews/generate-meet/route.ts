import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { getInstitutionDateStr } from "@/lib/localDate";
import {
  createGoogleCalendarEvent,
  getCalendarAppsScriptUrl,
  normalizeGoogleMeetLink
} from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const gasUrl = getCalendarAppsScriptUrl();
    if (!gasUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Google Apps Script URL is not configured. Please set GOOGLE_CALENDAR_GAS_URL or NEXT_PUBLIC_GAS_MAIL_URL in your environment variables."
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      title = "Faculty Interview Assessment Session",
      description = "Faculty evaluation session conducted via Zentra E-Campus.",
      targetDate,
      startTime = "08:20 AM",
      endTime = "09:10 AM",
      attendees = [],
      interviewId = ""
    } = body;

    const result = await createGoogleCalendarEvent({
      title,
      description,
      targetDate: targetDate || getInstitutionDateStr(),
      startTime,
      endTime,
      attendees: Array.isArray(attendees) ? attendees.filter(Boolean) : [],
      interviewId
    });

    const validatedMeet = normalizeGoogleMeetLink(result.gmeet_link);
    if (!validatedMeet) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to generate Google Meet link from Apps Script. Please verify that 'Google Calendar API' service is enabled in your Google Apps Script project."
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      gmeet_link: validatedMeet,
      gcal_link: result.gcal_link,
      event_created: result.event_created
    });
  } catch (error: any) {
    console.error("Generate Meet API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to generate Google Meet link"
      },
      { status: 500 }
    );
  }
}
