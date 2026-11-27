export const SME_LEAVE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const GENERIC_SCOPE_TOKENS = new Set([
  "",
  "all",
  "general",
  "general sme",
  "faculty",
  "n/a",
  "na",
  "none",
  "-"
]);

function normalizeToken(value: unknown): string {
  const raw = String(value || "").toLowerCase().trim().replace(/\s+/g, " ");
  return GENERIC_SCOPE_TOKENS.has(raw) ? "" : raw;
}

function splitSubjectTags(value: unknown): string[] {
  if (!value) return [];
  return String(value)
    .split(/[,;/|]+/)
    .map((part) => normalizeToken(part))
    .filter(Boolean);
}

export function validateLeaveDateRange(
  startDate: string,
  endDate?: string
): { valid: true; startDate: string; endDate: string } | { valid: false; message: string } {
  const start = String(startDate || "").trim();
  const end = String(endDate || start).trim();

  if (!SME_LEAVE_DATE_RE.test(start) || !SME_LEAVE_DATE_RE.test(end)) {
    return { valid: false, message: "Leave dates must use YYYY-MM-DD format." };
  }

  const startDt = new Date(`${start}T00:00:00Z`);
  const endDt = new Date(`${end}T00:00:00Z`);
  if (
    Number.isNaN(startDt.getTime()) ||
    Number.isNaN(endDt.getTime()) ||
    startDt.toISOString().slice(0, 10) !== start ||
    endDt.toISOString().slice(0, 10) !== end
  ) {
    return { valid: false, message: "Invalid calendar date provided." };
  }

  if (end < start) {
    return { valid: false, message: "End date cannot be earlier than start date." };
  }

  return { valid: true, startDate: start, endDate: end };
}

export interface SmeScopeRecord {
  id: string;
  name?: string | null;
  subject?: string | null;
  department?: string | null;
  head_subject_group?: string | null;
  mentor_group?: string | null;
}

export interface SubjectGroupScopeRow {
  id?: string;
  name?: string | null;
  lead_sme_id?: string | null;
}

export interface MentorScopeRow {
  id: string;
  name?: string | null;
  email?: string | null;
  department?: string | null;
  subjects?: string | null;
  subject_group?: string | null;
  mentor_group?: string | null;
  status?: string | null;
}

export interface DemoSessionScopeRow {
  id?: string;
  mentorId?: string | null;
  mentorid?: string | null;
  mentorName?: string | null;
  mentorname?: string | null;
  smeId?: string | null;
  smeid?: string | null;
  dateStr?: string | null;
  datestr?: string | null;
  status?: string | null;
}

export interface ResolvedMentorUnderSme {
  id: string;
  name: string;
  email?: string | null;
  matchedVia: Array<"group_subject" | "scheduled_demo">;
}

/**
 * Collects normalized non-generic group/subject tags owned by an SME
 * (lead subject groups, head_subject_group, mentor_group, department, subject).
 */
export function collectSmeScopeTags(
  sme: SmeScopeRecord,
  subjectGroups: SubjectGroupScopeRow[] = []
): string[] {
  const tags = new Set<string>();
  const smeId = String(sme?.id || "").trim();

  for (const sg of subjectGroups || []) {
    if (smeId && String(sg?.lead_sme_id || "").trim() === smeId) {
      const t = normalizeToken(sg?.name);
      if (t) tags.add(t);
    }
  }

  const directCandidates = [
    sme?.head_subject_group,
    sme?.mentor_group,
    sme?.department
  ];
  for (const cand of directCandidates) {
    const t = normalizeToken(cand);
    if (t) tags.add(t);
  }

  for (const sub of splitSubjectTags(sme?.subject)) {
    tags.add(sub);
  }

  return Array.from(tags);
}

/**
 * Resolves only the active mentors belonging to this specific SME:
 * 1. Active mentors whose group/subject/department/subjects match this SME's scope tags.
 * 2. Mentors who have an active (non-completed/non-cancelled) demo session assigned
 *    to this SME (optionally filtered to the leave [startDate, endDate] range).
 */
export function resolveMentorsUnderSme(opts: {
  sme: SmeScopeRecord;
  mentors: MentorScopeRow[];
  subjectGroups?: SubjectGroupScopeRow[];
  demoSessions?: DemoSessionScopeRow[];
  startDate?: string;
  endDate?: string;
}): { mentors: ResolvedMentorUnderSme[]; smeTags: string[] } {
  const { sme, mentors = [], subjectGroups = [], demoSessions = [], startDate, endDate } = opts;
  const smeId = String(sme?.id || "").trim();
  const smeTags = collectSmeScopeTags(sme, subjectGroups);
  const tagSet = new Set(smeTags);

  const byId = new Map<string, ResolvedMentorUnderSme>();

  for (const m of mentors) {
    const id = String(m?.id || "").trim();
    if (!id) continue;
    if (String(m?.status || "Active").toLowerCase().trim() === "inactive") continue;

    if (tagSet.size > 0) {
      const mentorTags = new Set<string>();
      for (const rawField of [m.mentor_group, m.subject_group, m.department]) {
        const t = normalizeToken(rawField);
        if (t) mentorTags.add(t);
      }
      for (const sub of splitSubjectTags(m.subjects)) {
        mentorTags.add(sub);
      }

      let matched = false;
      for (const mt of mentorTags) {
        if (tagSet.has(mt)) {
          matched = true;
          break;
        }
      }

      if (matched) {
        byId.set(id, {
          id,
          name: String(m.name || id),
          email: m.email || null,
          matchedVia: ["group_subject"]
        });
      }
    }
  }

  const mentorById = new Map<string, MentorScopeRow>();
  for (const m of mentors) {
    if (m?.id) mentorById.set(String(m.id).trim(), m);
  }

  for (const ds of demoSessions || []) {
    const rowSmeId = String(ds.smeId ?? ds.smeid ?? "").trim();
    if (!smeId || rowSmeId !== smeId) continue;

    const status = String(ds.status || "").toLowerCase().trim();
    if (status === "completed" || status === "not_conducted" || status === "cancelled") continue;

    const dDate = String(ds.dateStr ?? ds.datestr ?? "").trim();
    if (startDate && endDate && dDate) {
      if (dDate < startDate || dDate > endDate) continue;
    }

    const mId = String(ds.mentorId ?? ds.mentorid ?? "").trim();
    if (!mId) continue;

    const mentorRow = mentorById.get(mId);
    if (mentorRow && String(mentorRow.status || "Active").toLowerCase().trim() === "inactive") continue;

    const existing = byId.get(mId);
    if (existing) {
      if (!existing.matchedVia.includes("scheduled_demo")) {
        existing.matchedVia.push("scheduled_demo");
      }
    } else {
      byId.set(mId, {
        id: mId,
        name: String(mentorRow?.name || ds.mentorName || ds.mentorname || mId),
        email: mentorRow?.email || null,
        matchedVia: ["scheduled_demo"]
      });
    }
  }

  const resolved = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  return { mentors: resolved, smeTags };
}

export function buildSmeLeaveNotification(opts: {
  smeName: string;
  smeSubject?: string | null;
  startDate: string;
  endDate: string;
  leaveType?: string | null;
  reason?: string | null;
}): { title: string; message: string; link: string } {
  const smeName = String(opts.smeName || "SME").trim();
  const domainTag = opts.smeSubject ? ` (${opts.smeSubject})` : "";
  const dateLabel = opts.startDate === opts.endDate
    ? opts.startDate
    : `${opts.startDate} to ${opts.endDate}`;
  const leaveType = String(opts.leaveType || "Leave").trim();
  const reasonSuffix = opts.reason && String(opts.reason).trim()
    ? ` Reason: ${String(opts.reason).trim()}.`
    : "";

  return {
    title: `SME Leave Alert: ${smeName} (${dateLabel})`,
    message: `${smeName}${domainTag} is on ${leaveType} for ${dateLabel}.${reasonSuffix} Any scheduled demo or review sessions on this date may require rescheduling.`,
    link: "/mentor/lnd"
  };
}

export function buildSmeLeaveCancelNotification(opts: {
  smeName: string;
  smeSubject?: string | null;
  startDate: string;
  endDate: string;
}): { title: string; message: string; link: string } {
  const smeName = String(opts.smeName || "SME").trim();
  const domainTag = opts.smeSubject ? ` (${opts.smeSubject})` : "";
  const dateLabel = opts.startDate === opts.endDate
    ? opts.startDate
    : `${opts.startDate} to ${opts.endDate}`;

  return {
    title: `SME Available: ${smeName} cancelled leave (${dateLabel})`,
    message: `${smeName}${domainTag} has cancelled their marked leave for ${dateLabel} and is back to normal demo availability.`,
    link: "/mentor/lnd"
  };
}

export function smeOnLeaveOnDate(
  smeLeaves: any[] | undefined | null,
  smeId: string | undefined | null,
  dateStr: string | undefined | null
): any | null {
  if (!smeLeaves || !smeId || !dateStr) return null;
  return (
    smeLeaves.find(
      (lv: any) =>
        String(lv.sme_id || lv.smeId || "") === String(smeId) &&
        String(lv.status || "") === "approved" &&
        String(lv.start_date || lv.startDate || "") <= dateStr &&
        String(lv.end_date || lv.endDate || lv.start_date || lv.startDate || "") >= dateStr
    ) || null
  );
}
