export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { revokeAllUserSessions, createUserSession, buildSessionCookie, buildCsrfCookie } from "@/lib/session";

export async function POST(request: Request) {
  try {
    // Password changes require a live session and a valid CSRF token. Without this,
    // the endpoint was an unauthenticated, unthrottled password-guessing oracle.
    const { auth, errorResponse } = await requireAuth(request, { allowPasswordChangeRequired: true });
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const db = await getDb();
    const body = await request.json();
    const { currentPassword, newPassword } = body ?? {};

    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return NextResponse.json(
        { success: false, message: "Current password and new password must be strings." },
        { status: 400 }
      );
    }

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Missing required fields (current password or new password)." },
        { status: 400 }
      );
    }

    // The account is taken from the session, never from client input.
    const user = await db.get("SELECT * FROM users WHERE id = ?", [auth.user.id]);

    if (!user || !user.password_hash) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect." },
        { status: 400 }
      );
    }

    if (!verifyPassword(currentPassword, user.password_hash)) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect." },
        { status: 400 }
      );
    }

    // Validate on the trimmed value, but hash exactly what was submitted: login
    // verifies the raw input, so trimming here would lock out space-wrapped passwords.
    if (newPassword.trim().length < 6) {
      return NextResponse.json(
        { success: false, message: "New password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, message: "New password cannot be the same as your current password." },
        { status: 400 }
      );
    }

    const hashedNewPass = hashPassword(newPassword);
    const nowStr = new Date().toISOString();

    // The credential and its roster copy change together. Committed separately, a
    // failure between the two left an account that signed in against `users` while
    // every role screen still validated the old hash.
    await db.transaction(async (tx) => {
      await tx.run(
        "UPDATE users SET password_hash = ?, plain_password = ?, must_change_password = 0, updated_at = ? WHERE id = ?",
        [hashedNewPass, newPassword, nowStr, user.id]
      );

      if (user.role === "student") {
        await tx.run(
          "UPDATE students SET password_hash = ?, updated_at = ? WHERE id = ?",
          [hashedNewPass, nowStr, user.reference_id]
        );
      } else if (user.role === "mentor") {
        await tx.run(
          "UPDATE mentors SET password_hash = ?, updated_at = ? WHERE id = ?",
          [hashedNewPass, nowStr, user.reference_id]
        );
      } else if (user.role === "sme") {
        await tx.run("UPDATE sme_users SET password = ? WHERE id = ?", [hashedNewPass, user.reference_id]);
      }
    });

    // Security: Global session revocation across all devices upon password reset
    await revokeAllUserSessions(db, user.id, "password_changed");

    // Re-issue a fresh session for the current client
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "Web Browser";
    const { rawToken, csrfToken } = await createUserSession(db, user.id, { ip, userAgent });

    const response = NextResponse.json({
      success: true,
      message: "Password updated successfully!",
      user: { ...auth.user, mustChangePassword: false },
      csrfToken
    });

    response.headers.append("Set-Cookie", buildSessionCookie(rawToken));
    response.headers.append("Set-Cookie", buildCsrfCookie(csrfToken));
    return response;
  } catch (error: any) {
    console.error("API POST Change Password error:", error);
    return NextResponse.json({ success: false, message: "Server error updating password." }, { status: 500 });
  }
}
