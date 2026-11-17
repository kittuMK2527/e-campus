export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

// Leave system has been decommissioned across the entire application.
export async function GET() {
  return NextResponse.json({
    success: true,
    records: [],
    message: "Leave system has been decommissioned."
  });
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message: "Leave system has been decommissioned."
    },
    { status: 410 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    {
      success: false,
      message: "Leave system has been decommissioned."
    },
    { status: 410 }
  );
}
