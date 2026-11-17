export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

// Student leave system has been decommissioned across the entire application.
export async function GET() {
  return NextResponse.json({
    success: true,
    requests: [],
    message: "Student leave system has been decommissioned."
  });
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message: "Student leave system has been decommissioned."
    },
    { status: 410 }
  );
}
