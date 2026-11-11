export interface ParsedSubject {
  id: string;
  name: string;
  type: string;
  weekly_hours: number;
  mentor_group?: string;
}

/**
 * Normalizes subject types into the supported system options:
 * "SKILL", "ACADEMIC", "LAB", or "ELECTIVE".
 */
export function normalizeSubjectType(val?: string, fallback: string = "SKILL"): string {
  if (!val) return fallback;
  const clean = val.trim().toUpperCase();
  if (["SKILL", "PRACTICAL", "HANDS-ON", "PROJECT"].includes(clean)) return "SKILL";
  if (["THEORY", "ACADEMIC", "CORE", "LECTURE"].includes(clean)) return "ACADEMIC";
  if (["LAB", "LABORATORY", "PRACTICAL LAB"].includes(clean)) return "LAB";
  if (["ELECTIVE", "GENERAL", "OPEN ELECTIVE", "AUDIT"].includes(clean)) return "ELECTIVE";
  return fallback;
}

/**
 * Checks if a string token looks like a subject type identifier.
 */
export function isTypeToken(token: string): boolean {
  if (!token) return false;
  const u = token.trim().toUpperCase();
  return [
    "SKILL",
    "PRACTICAL",
    "THEORY",
    "ACADEMIC",
    "CORE",
    "LECTURE",
    "LAB",
    "LABORATORY",
    "ELECTIVE",
    "GENERAL"
  ].includes(u);
}

/**
 * Checks if a string token represents weekly hours (e.g. "4", "4 hrs", "3 hours", "4h").
 */
export function isHoursToken(token: string): boolean {
  if (!token) return false;
  const trimmed = token.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return n >= 1 && n <= 40;
  }
  return /^\d+\s*(hrs?|hours?|periods?|credits?|h)$/i.test(trimmed);
}

/**
 * Parses numeric weekly hours from token or number.
 */
export function parseHoursToken(val?: string | number, fallback: number = 4): number {
  if (typeof val === "number" && !isNaN(val) && val > 0) {
    return Math.min(Math.max(val, 1), 40);
  }
  if (!val) return fallback;
  const str = String(val).toLowerCase();
  const match = str.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) {
      return Math.min(Math.max(num, 1), 40);
    }
  }
  return fallback;
}

/**
 * Detects whether a line is a header row from Excel/CSV (e.g. "Subject Name", "Sl No").
 */
export function isHeaderLine(line: string): boolean {
  const l = line.toLowerCase();
  return (
    (l.includes("subject") && (l.includes("name") || l.includes("title") || l.includes("code") || l.includes("type"))) ||
    (l.includes("course") && (l.includes("name") || l.includes("title") || l.includes("code"))) ||
    l.includes("sl no") ||
    l.includes("sl.no") ||
    l.includes("s.no") ||
    l.includes("serial no") ||
    l.includes("weekly hours") ||
    l.includes("hours/week") ||
    l.includes("domain / type")
  );
}

/**
 * Cleans subject name by stripping bullets, serial numbers (e.g. "1.", "1)", "1 -"), and extra quotes.
 */
export function cleanSubjectName(name: string): string {
  return name
    .replace(/^(\d+[\.\)\-\:\/]\s*|\-\s+|\•\s+|\*\s+|\(\d+\)\s+|\[\d+\]\s+|\b\d+\s+)/, "")
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Intelligent parser for subject input from clipboard or text area:
 * Supports:
 * - Multi-line lists
 * - Comma or semicolon-separated subjects
 * - Tab-separated Excel / Google Sheets copies (with or without S.No column, Domain column, Hours column)
 * - Pipe-separated markdown tables
 * - Bulleted or numbered lists
 */
export function parseSubjectInput(
  text: string,
  defaultType: string = "SKILL",
  defaultHours: number = 4,
  defaultGroup: string = "",
  availableGroups: string[] = []
): ParsedSubject[] {
  if (!text || typeof text !== "string" || !text.trim()) return [];

  const rawLines = text.split(/\r?\n/);
  const results: ParsedSubject[] = [];
  const seenNames = new Set<string>();

  const addSubject = (name: string, type: string, hours: number, group?: string) => {
    const cleaned = cleanSubjectName(name);
    if (!cleaned || cleaned.length < 2) return;
    if (isHeaderLine(cleaned)) return;

    const key = cleaned.toLowerCase();
    if (!seenNames.has(key)) {
      seenNames.add(key);

      // Match against availableGroups case-insensitively
      let matchedGroup = group?.trim() || defaultGroup || "";
      if (group && availableGroups.length > 0) {
        const found = availableGroups.find(g => g.trim().toLowerCase() === group.trim().toLowerCase());
        if (found) matchedGroup = found;
      }

      results.push({
        id: `row_${Date.now()}_${results.length}_${Math.random().toString(36).substring(2, 6)}`,
        name: cleaned,
        type: normalizeSubjectType(type, defaultType),
        weekly_hours: parseHoursToken(hours, defaultHours),
        mentor_group: matchedGroup
      });
    }
  };

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isHeaderLine(line)) continue;

    // 1. Table Row Check: Tab-separated (Excel / Sheets) or Pipe-separated (|)
    if (line.includes("\t") || line.includes("|")) {
      const parts = line.split(/[\t|]/).map(p => p.trim()).filter(Boolean);
      if (parts.length === 0) continue;

      let nameIndex = 0;
      // If first column is serial number / index, skip it
      if (/^\d+$/.test(parts[0]) && parts.length > 1) {
        nameIndex = 1;
      }

      const name = parts[nameIndex] || "";
      let type = defaultType;
      let hours = defaultHours;
      let group = defaultGroup;

      for (let i = nameIndex + 1; i < parts.length; i++) {
        const col = parts[i];
        if (isTypeToken(col)) {
          type = col;
        } else if (isHoursToken(col)) {
          hours = parseHoursToken(col, defaultHours);
        } else if (availableGroups.length > 0 && availableGroups.some(g => g.toLowerCase() === col.toLowerCase())) {
          const matched = availableGroups.find(g => g.toLowerCase() === col.toLowerCase());
          if (matched) group = matched;
        } else if (!group && col.length > 1 && !/^\d+$/.test(col)) {
          group = col;
        }
      }

      addSubject(name, type, hours, group);
      continue;
    }

    // 2. Comma or Semicolon Separated Check
    if (line.includes(",") || line.includes(";")) {
      const parts = line.split(/[,;]/).map(p => p.trim()).filter(Boolean);

      // Check if this single line is a CSV row describing 1 subject (e.g. "Data Structures, SKILL, 4, Full Stack")
      const secondIsType = parts[1] && isTypeToken(parts[1]);
      const secondIsHours = parts[1] && isHoursToken(parts[1]);
      const thirdIsHours = parts[2] && isHoursToken(parts[2]);
      const hasGroup = parts.slice(1).some(p => availableGroups.some(g => g.toLowerCase() === p.toLowerCase()));

      if (parts.length <= 5 && (secondIsType || secondIsHours || thirdIsHours || hasGroup)) {
        const name = parts[0];
        let type = defaultType;
        let hours = defaultHours;
        let group = defaultGroup;

        for (let i = 1; i < parts.length; i++) {
          const col = parts[i];
          if (isTypeToken(col)) {
            type = col;
          } else if (isHoursToken(col)) {
            hours = parseHoursToken(col, defaultHours);
          } else if (availableGroups.length > 0 && availableGroups.some(g => g.toLowerCase() === col.toLowerCase())) {
            const matched = availableGroups.find(g => g.toLowerCase() === col.toLowerCase());
            if (matched) group = matched;
          } else if (!group && col.length > 1 && !/^\d+$/.test(col)) {
            group = col;
          }
        }
        addSubject(name, type, hours, group);
      } else {
        // Otherwise, it's multiple comma-separated subject names (e.g. "Maths, Physics, Chemistry")
        for (const item of parts) {
          addSubject(item, defaultType, defaultHours, defaultGroup);
        }
      }
      continue;
    }

    // 3. Plain single subject on this line
    addSubject(line, defaultType, defaultHours, defaultGroup);
  }

  return results;
}
