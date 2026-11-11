export interface FeeStudentFilters {
  q?: string;
  collegeId?: string;
  department?: string;
  year?: string;
  status?: string;
}

export interface FeeStudentsPage<Student, Fee> {
  success: true;
  students: Student[];
  fees: Fee[];
  total: number;
  page: number;
  pageSize: number;
}

export function feeStudentsUrl(filters: FeeStudentFilters, page: number, pageSize: number) {
  const params = new URLSearchParams({ mode: "students", page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) params.set(key, value);
  }
  return `/api/fees?${params}`;
}

/** On-demand only. Return rows only after every page succeeds, so callers never write a partial workbook. */
export async function collectFeeStudentRows<Student extends { id: string }, Fee, Row>(
  filters: FeeStudentFilters,
  loadPage: (url: string) => Promise<FeeStudentsPage<Student, Fee>>,
  mapPage: (page: FeeStudentsPage<Student, Fee>) => Row[],
): Promise<Row[]> {
  const rows: Row[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  const pageSize = 100;

  for (let page = 1; ; page++) {
    const result = await loadPage(feeStudentsUrl(filters, page, pageSize));
    if (!result?.success || !Array.isArray(result.students) || !Array.isArray(result.fees) ||
        !Number.isSafeInteger(result.total) || result.total < 0 ||
        result.page !== page || result.pageSize !== pageSize) {
      throw new Error("Unable to download a complete fee directory. Please retry.");
    }
    total ??= result.total;
    if (result.total !== total || result.students.length !== Math.min(pageSize, total - seen.size)) {
      throw new Error("Fee directory changed during download. Please retry.");
    }
    for (const student of result.students) {
      if (seen.has(student.id)) {
        throw new Error("Fee directory changed during download. Please retry.");
      }
      seen.add(student.id);
    }
    rows.push(...mapPage(result));
    if (seen.size === total) return rows;
  }
}
