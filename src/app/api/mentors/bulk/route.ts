export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, syncMentorSubjectGroups, type QueryFailure } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_PASSWORD } from "@/lib/authConfig";
import { generateId } from "@/lib/id";

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "cm"] });
    if (errorResponse) return errorResponse;
    const user = auth?.user;
    const db = await getDb();
    const body = await request.json();
    const { mentors, defaultCollegeId } = body;

    if (!Array.isArray(mentors) || mentors.length === 0) {
      return NextResponse.json(
        { success: false, message: "No faculty records provided for import." },
        { status: 400 }
      );
    }

    // Fetch all colleges to resolve and validate college foreign keys
    const allColleges = await db.all("SELECT id, name FROM colleges");
    const collegeIdSet = new Set(allColleges.map((c: any) => c.id));
    const collegeNameMap = new Map(allColleges.map((c: any) => [String(c.name).toLowerCase().trim(), c.id]));
    const fallbackCollegeId = (defaultCollegeId && collegeIdSet.has(defaultCollegeId))
      ? defaultCollegeId
      : (user?.college_id && collegeIdSet.has(user.college_id))
        ? user.college_id
        : (allColleges[0]?.id || null);

    const now = new Date().toISOString();
    let importedCount = 0;
    const errors: string[] = [];
    const writtenMentors: any[] = [];
    // Hashing is deliberately expensive; a per-row call spent seconds of CPU on a
    // 50-row import even though every new account gets the same default password.
    const defaultPasswordHash = hashPassword(DEFAULT_PASSWORD);

    // Existence probes are hoisted out of the per-row loop. Inside the transaction
    // they were two round trips per imported row, so a 50-row import spent ~100
    // round trips before writing anything. The maps are kept current as rows are
    // written so a duplicate entry inside the same payload still sees itself.
    const payloadEmails = Array.from(new Set(
      mentors
        .map((item: any) => String(item.email || item.EmailAddress || item.email_address || item["Email Address"] || item["Email"] || "").trim().toLowerCase())
        .filter(Boolean)
    ));
    const payloadIds = Array.from(new Set(
      mentors.map((item: any) => item.id).filter((v: any) => typeof v === "string" && v)
    ));

    const mentorByEmail = new Map<string, any>();
    const mentorById = new Map<string, any>();
    const userByEmail = new Map<string, any>();
    const userById = new Map<string, any>();
    const userByReference = new Map<string, any>();

    if (payloadEmails.length > 0 || payloadIds.length > 0) {
      const preloadFailures: QueryFailure[] = [];
      const emailPh = payloadEmails.map(() => "?").join(",");
      const idPh = payloadIds.map(() => "?").join(",");
      const mentorWhere: string[] = [];
      const mentorParams: any[] = [];
      if (payloadEmails.length > 0) { mentorWhere.push(`LOWER(email) IN (${emailPh})`); mentorParams.push(...payloadEmails); }
      if (payloadIds.length > 0) { mentorWhere.push(`id IN (${idPh})`); mentorParams.push(...payloadIds); }
      const userWhere: string[] = [];
      const userParams: any[] = [];
      if (payloadEmails.length > 0) { userWhere.push(`LOWER(email) IN (${emailPh})`); userParams.push(...payloadEmails); }
      if (payloadIds.length > 0) { userWhere.push(`id IN (${idPh})`, `reference_id IN (${idPh})`); userParams.push(...payloadIds, ...payloadIds); }

      const [mentorRows, userRows] = await db.multiQuery([
        { sql: `SELECT id, email FROM mentors WHERE ${mentorWhere.join(" OR ")}`, params: mentorParams },
        { sql: `SELECT id, email, reference_id, password_hash FROM users WHERE ${userWhere.join(" OR ")}`, params: userParams },
      ], preloadFailures);
      if (preloadFailures.length > 0) {
        return NextResponse.json({ success: false, message: "Could not read existing faculty records. Please try again." }, { status: 500 });
      }

      for (const row of mentorRows) {
        if (row.id) mentorById.set(String(row.id), row);
        if (row.email) mentorByEmail.set(String(row.email).toLowerCase(), row);
      }
      for (const row of userRows) {
        if (row.email) userByEmail.set(String(row.email).toLowerCase(), row);
        if (row.id) userById.set(String(row.id), row);
        if (row.reference_id) userByReference.set(String(row.reference_id), row);
      }
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < mentors.length; i++) {
        const item = mentors[i];
        const rawName = item.name || item.FacultyName || item.faculty_name || item["Faculty Name"] || item["Name"] || "";
        const rawEmail = item.email || item.EmailAddress || item.email_address || item["Email Address"] || item["Email"] || "";
        const rawDept = item.department || item.Department || item["Department"] || "Computer Science";
        const rawShift = item.shift || item.Shift || item["Shift"] || "shift_1";
        const rawCollegeId = item.college_id || item.collegeId || item.CollegeId || item["College ID"] || fallbackCollegeId;
        const rawSubjects = item.subjects || item.Subjects || item["Subjects"] || item["Assigned Subjects"] || "";
        const rawClasses = item.classes || item.Classes || item["Classes"] || item["Assigned Classes"] || "";
        const rawSubjectGroup = item.mentor_group || item.subject_group || item.subjectGroup || item["Subject Group"] || item["Mentor Group"] || rawDept;
        const cleanDept = (rawSubjectGroup || String(rawDept)).trim();

        if (!rawName.trim() || !rawEmail.trim()) {
          errors.push(`Row ${i + 1}: Name and email are required.`);
          continue;
        }

        const cleanEmail = rawEmail.trim().toLowerCase();
        const cleanName = rawName.trim();
        const cleanShift = String(rawShift).toLowerCase().includes("2") ? "shift_2" : String(rawShift).toLowerCase().includes("gen") ? "general" : "shift_1";
        const avatar = item.avatar || "";

        // Validate and map college ID against existing colleges
        let safeCollegeId = fallbackCollegeId;
        if (rawCollegeId) {
          if (collegeIdSet.has(rawCollegeId)) {
            safeCollegeId = rawCollegeId;
          } else if (collegeNameMap.has(String(rawCollegeId).toLowerCase().trim())) {
            safeCollegeId = collegeNameMap.get(String(rawCollegeId).toLowerCase().trim());
          }
        }

        // Check if mentor already exists by email or id
        const existing = mentorByEmail.get(cleanEmail) || (item.id ? mentorById.get(String(item.id)) : undefined);

        let targetId = existing?.id || item.id || generateId("m");
        mentorByEmail.set(cleanEmail, { id: targetId });
        mentorById.set(String(targetId), { id: targetId });

        if (existing) {
          await tx.run(
            `UPDATE mentors 
             SET name = ?, department = ?, shift = ?, college_id = ?, mentor_group = ?, subject_group = ?,
                 subjects = CASE WHEN ? != '' THEN ? ELSE subjects END,
                 classes = CASE WHEN ? != '' THEN ? ELSE classes END
             WHERE id = ?`,
            cleanName, cleanDept, cleanShift, safeCollegeId, cleanDept, cleanDept,
            rawSubjects, rawSubjects, rawClasses, rawClasses, targetId
          );
        } else {
          await tx.run(
            `INSERT INTO mentors (id, name, email, department, avatar, subjects, classes, shift, college_id, mentor_group, subject_group)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            targetId, cleanName, cleanEmail, cleanDept, avatar, rawSubjects, rawClasses, cleanShift, safeCollegeId, cleanDept, cleanDept
          );
        }

        // Keep the existing login row (and its id, so live sessions stay valid).
        // Delete-and-recreate used to reset status and could delete a different
        // account that happened to share the email.
        const existingUser = userByEmail.get(cleanEmail) || userById.get(String(targetId)) || userByReference.get(String(targetId));
        let writtenUser: any;
        if (existingUser?.id) {
          await tx.run(
            `UPDATE users SET email = ?, role = 'mentor', reference_id = ?, status = 'Active', updated_at = ? WHERE id = ?`,
            cleanEmail, targetId, now, existingUser.id
          );
          writtenUser = {
            id: existingUser.id,
            email: cleanEmail,
            reference_id: targetId,
            password_hash: existingUser.password_hash || null
          };
        } else {
          await tx.run(
            `INSERT INTO users (id, email, password_hash, role, reference_id, status, must_change_password, created_at, updated_at)
             VALUES (?, ?, ?, 'mentor', ?, 'Active', 1, ?, ?)`,
            targetId, cleanEmail, defaultPasswordHash, targetId, now, now
          );
          writtenUser = { id: targetId, email: cleanEmail, reference_id: targetId, password_hash: defaultPasswordHash };
        }
        userByEmail.set(cleanEmail, writtenUser);
        userById.set(String(writtenUser.id), writtenUser);
        userByReference.set(String(targetId), writtenUser);

        writtenMentors.push({
          id: targetId,
          name: cleanName,
          email: cleanEmail,
          department: cleanDept,
          avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanEmail}`,
          subjects: rawSubjects || "",
          classes: rawClasses || "",
          shift: cleanShift,
          college_id: safeCollegeId,
          mentor_group: cleanDept,
          subject_group: cleanDept,
          role: "mentor"
        });

        importedCount++;
      }
    });

    await syncMentorSubjectGroups(db);

    return NextResponse.json({
      success: true,
      count: importedCount,
      mentors: writtenMentors,
      errors,
      message: `Successfully processed ${importedCount} faculty member(s).`
    });
  } catch (error: any) {
    console.error("API POST /api/mentors/bulk error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Bulk import failed." },
      { status: 500 }
    );
  }
}
