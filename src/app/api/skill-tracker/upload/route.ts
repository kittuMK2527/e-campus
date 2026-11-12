export const maxDuration = 60;

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads", "submissions");
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".ppt",
  ".pptx",
  ".txt",
  ".zip"
]);

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, {
      allowedRoles: ["mentor", "sme", "cm", "kam", "admin"]
    });
    if (errorResponse) return errorResponse;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, message: "No document file provided for upload." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, message: "File size exceeds the 25 MB limit." },
        { status: 400 }
      );
    }

    const originalName = file.name || "document";
    const ext = path.extname(originalName).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        {
          success: false,
          message: `Unsupported file type (${ext || "unknown"}). Allowed formats: PDF, Word (.docx/.doc), Excel (.xlsx/.xls/.csv), PowerPoint (.pptx/.ppt), TXT, ZIP.`
        },
        { status: 400 }
      );
    }

    // Ensure uploads directory exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Sanitize base name and build collision-safe filename
    const baseRaw = path.basename(originalName, ext);
    const sanitizedBase = baseRaw.replace(/[^a-zA-Z0-9_\-\.]/g, "_").slice(0, 60) || "doc";
    const uniqueFileName = `${Date.now()}_${generateId("sub")}_${sanitizedBase}${ext}`;
    const filePath = path.join(UPLOADS_DIR, uniqueFileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/submissions/${uniqueFileName}`;

    return NextResponse.json({
      success: true,
      message: "Document uploaded successfully.",
      url: publicUrl,
      fileName: originalName,
      fileSize: file.size,
      storedFileName: uniqueFileName
    });
  } catch (err: any) {
    console.error("POST /api/skill-tracker/upload error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to upload document" },
      { status: 500 }
    );
  }
}
