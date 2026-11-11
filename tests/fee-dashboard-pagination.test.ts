import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import React from "react";
import { collectFeeStudentRows, feeStudentsUrl, type FeeStudentsPage } from "../src/lib/feePages";

// Exercise the dashboard's handlers/query options without a browser, server, or real API.
// Hook state/effects are replayed; UI primitives stay as elements for prop/text assertions.
const h = vi.hoisted(() => ({
  state: [] as any[], stateCursor: 0, effectCursor: 0, changed: false,
  deps: [] as unknown[][], effects: [] as (() => void)[],
  options: [] as any[], results: {} as Record<string, any>,
  api: vi.fn(), toast: vi.fn(), invalidate: vi.fn(), write: vi.fn(), sheet: vi.fn(),
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: any) => {
      const index = h.stateCursor++;
      if (!(index in h.state)) h.state[index] = typeof initial === "function" ? initial() : initial;
      return [h.state[index], (next: any) => {
        const value = typeof next === "function" ? next(h.state[index]) : next;
        if (!Object.is(value, h.state[index])) h.changed = true;
        h.state[index] = value;
      }];
    },
    useMemo: (fn: () => unknown) => fn(),
    useEffect: (fn: () => void, deps: unknown[]) => {
      const index = h.effectCursor++;
      if (!h.deps[index] || deps.some((dep, i) => !Object.is(dep, h.deps[index][i]))) h.effects.push(fn);
      h.deps[index] = deps;
    },
  };
});
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: any) => {
    h.options.push(options);
    return h.results[options.queryKey[1]];
  },
  useQueryClient: () => ({ invalidateQueries: h.invalidate }),
}));
vi.mock("@/lib/apiFetch", () => ({ apiFetch: h.api }));
vi.mock("@/context/AppContext", () => ({
  useApp: () => ({ colleges: [{ id: "ctx", name: " Context College " }], coursesList: [{ name: " Context Course ", college_id: "a" }] }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ toast: h.toast, confirm: vi.fn() }) }));
vi.mock("@/components/ui/card", () => ({ Card: "Card", CardHeader: "CardHeader", CardTitle: "CardTitle", CardDescription: "CardDescription", CardContent: "CardContent" }));
vi.mock("@/components/ui/badge", () => ({ Badge: "Badge" }));
vi.mock("@/components/ui/button", () => ({ Button: "Button" }));
vi.mock("@/components/ui/input", () => ({ Input: "Input" }));
vi.mock("@/components/ui/table", () => ({ Table: "Table", TableHeader: "TableHeader", TableBody: "TableBody", TableHead: "TableHead", TableRow: "TableRow", TableCell: "TableCell" }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: "Dialog", DialogHeader: "DialogHeader", DialogTitle: "DialogTitle", DialogDescription: "DialogDescription" }));
vi.mock("@/components/ui/Pagination", () => ({ Pagination: "Pagination" }));
vi.mock("xlsx", () => ({
  utils: { json_to_sheet: h.sheet, book_new: () => ({}), book_append_sheet: vi.fn() },
  writeFile: h.write,
}));

import { FeeManagerDashboard } from "../src/components/FeeManagerDashboard";

type Tab = "overview" | "colleges" | "students" | "transactions";
type Node = React.ReactElement<Record<string, any>>;
const nodes = (tree: any): Node[] => Array.isArray(tree) ? tree.flatMap(nodes)
  : React.isValidElement(tree) ? [tree as Node, ...nodes((tree.props as any).children)] : [];
const text = (tree: any): string => Array.isArray(tree) ? tree.map(text).join("")
  : React.isValidElement(tree) ? text((tree.props as any).children)
  : typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
const find = (tree: any, predicate: (node: Node) => boolean) => {
  const node = nodes(tree).find(predicate);
  expect(node, "Expected matching UI element").toBeDefined();
  return node!;
};
const button = (tree: any, label: string) => find(tree, n => n.type as any === "Button" && text(n).trim() === label);
const pagination = (tree: any) => find(tree, n => n.type as any === "Pagination");
const select = (tree: any, label: string) => find(tree, n => n.type === "select" && text(n).includes(label));
const change = (node: Node, value: string) => node.props.onChange({ target: { value } });
const query = (mode: string) => h.options.find(o => o.queryKey[1] === mode);

function render(tab: Tab = "students") {
  for (let attempts = 0; attempts < 10; attempts++) {
    h.stateCursor = 0;
    h.effectCursor = 0;
    h.options = [];
    h.effects = [];
    h.changed = false;
    const tree = FeeManagerDashboard({ activeTab: tab });
    h.effects.forEach(fn => fn());
    if (!h.changed) return tree;
  }
  throw new Error("Dashboard effects did not settle");
}
const ok = (data: any) => ({ data, isPending: false, isError: false, isSuccess: true, refetch: vi.fn() });
const student = (id: string, overrides = {}) => ({
  id, name: `Name ${id}`, college_id: "a", email: `${id}@test.invalid`, department: "CSE",
  classGroup: "Batch Year III", year: "Year III", semester: "Semester 5", register_number: `REG-${id}`,
  ...overrides,
});
const fee = (studentId: string, id = "fee-1", overrides = {}) => ({
  id, student_id: studentId, college_id: "a", term_name: id, amount: 100, paid_amount: 30,
  status: "partial", due_date: "2026-01-01", created_at: "2025-01-01", ...overrides,
});
function fixture() {
  return {
    success: true, colleges: [{ id: "a", name: "College A" }, { id: "b", name: "College B" }],
    stats: { totalFees: 1500, totalPaid: 200, totalOutstanding: 1300, totalStudents: 9999, paidCount: 3, partialCount: 4, unpaidCount: 5 },
    todayRevenue: 77,
    collegeTotals: [
      { college_id: "a", totalStudents: 6000, totalFees: 1000, totalPaid: 0, paymentTotal: 1200, paidCount: 2, partialCount: 3, unpaidCount: 4, pendingCount: 7 },
      { college_id: "b", totalStudents: 3999, totalFees: 500, totalPaid: 200, paymentTotal: 900, paidCount: 1, partialCount: 1, unpaidCount: 1, pendingCount: 2 },
    ],
    facets: [
      { college_id: "a", department: " CSE ", year: "Year III", semester: "Semester 5", classGroup: "" },
      { college_id: "a", department: "CompleteRosterDept", year: "Year IV", semester: "Semester 7", classGroup: "" },
      { college_id: "a", department: "", year: "", semester: "", classGroup: "Batch Year II" },
      { college_id: "a", department: "123", year: "", semester: "", classGroup: "" },
      { college_id: "b", department: "Other", year: "", semester: "", classGroup: "" },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.api.mockReset();
  h.state = [];
  h.deps = [];
  h.results = {
    summary: ok(fixture()),
    students: ok({ success: true, students: [student("s501")], fees: [fee("s501"), fee("s501", "fee-2"), fee("s501", "fee-3", { pay_link: "https://example.invalid/pay" })], total: 601, page: 1, pageSize: 25 }),
    payments: ok({ success: true, payments: [
      { id: "p1", student_id: "outside-page", student_name: "Joined Outside Page", college_id: "a", amount: 30, payment_date: "2026-01-01", receipt_no: "R1", reference_no: "REF1", payment_method: "cash" },
      { id: "p2", student_id: "deleted-student", student_name: null, college_id: "a", amount: 30, payment_date: "2026-01-01", receipt_no: "R2", reference_no: "REF2", payment_method: "cash" },
    ], total: 1401, page: 1, pageSize: 25 }),
  };
  vi.stubGlobal("localStorage", { getItem: () => null });
});

describe("fee dashboard server queries", () => {
  it.each<Tab>(["overview", "colleges", "students", "transactions"])("enables only %s's ledger, keeping summary always enabled", async tab => {
    render(tab);
    expect(h.options).toHaveLength(3);
    expect(query("summary").queryKey).toEqual(["fees", "summary"]);
    expect(query("summary").enabled).not.toBe(false);
    expect(query("students").enabled).toBe(tab === "students");
    expect(query("payments").enabled).toBe(tab === "transactions");
    expect(h.api).not.toHaveBeenCalled(); // Neither exports nor templates eagerly load a roster.
    h.api.mockResolvedValue({ success: true });
    for (const options of h.options.filter(o => o.enabled !== false)) await options.queryFn({ signal: undefined });
    expect(h.api.mock.calls).toHaveLength(tab === "students" || tab === "transactions" ? 2 : 1);
    expect(h.api.mock.calls[0][0]).toBe("/api/fees?mode=summary");
    for (const [url] of h.api.mock.calls) expect(new URL(url, "https://fixture.invalid").searchParams.has("mode")).toBe(true);
  });

  it("keys every student filter and server page; dates do not reset or filter students", async () => {
    let tree = render();
    change(find(tree, n => n.type as any === "Input" && n.props.value === ""), "Reg & 42");
    change(select(tree, "All Colleges"), "a");
    change(select(tree, "All Departments"), "CSE");
    change(select(tree, "All Academic Years"), "Year III");
    change(select(tree, "All Statuses"), "partial");
    tree = render();
    pagination(tree).props.onPageChange(3);
    tree = render();
    const key = query("students").queryKey;
    expect(key).toEqual(["fees", "students", { q: "Reg & 42", collegeId: "a", department: "CSE", year: "Year III", status: "partial" }, 3, 25]);
    expect(pagination(tree).props.totalItems).toBe(601);
    expect(text(tree)).toContain("Showing 601 of 9999 students");
    expect(text(tree)).toContain("Name s501"); // No client slice of the server's page 3.
    change(find(tree, n => n.props.title === "From Date"), "2026-01-01");
    tree = render();
    expect(query("students").queryKey).toEqual(key);
    h.api.mockResolvedValue({ success: true });
    await query("students").queryFn({ signal: undefined });
    const params = new URL(h.api.mock.calls[0][0], "https://fixture.invalid").searchParams;
    expect(Object.fromEntries(params)).toEqual({ mode: "students", page: "3", pageSize: "25", ...key[2] });
    expect(params.has("from")).toBe(false);
    pagination(tree).props.onPageSizeChange(100);
    tree = render();
    expect(query("students").queryKey.slice(-2)).toEqual([1, 100]);
    expect(pagination(tree).props.pageSizeOptions).toEqual([10, 25, 50, 100]);
    pagination(tree).props.onPageChange(2);
    tree = render();
    change(select(tree, "All Statuses"), "paid");
    render();
    expect(query("students").queryKey.slice(-2)).toEqual([1, 100]);
  });

  it("keys payment search, college, dates and pagination, with joined names independent of the student page", async () => {
    let tree = render();
    change(find(tree, n => n.type as any === "Input" && n.props.value === ""), "receipt");
    change(select(tree, "All Colleges"), "a");
    change(select(tree, "All Departments"), "CSE");
    tree = render("transactions");
    change(find(tree, n => n.props.title === "From Date"), "2026-01-01");
    change(find(tree, n => n.props.title === "To Date"), "2026-02-01");
    tree = render("transactions");
    pagination(tree).props.onPageChange(4);
    tree = render("transactions");
    expect(query("payments").queryKey).toEqual(["fees", "payments", { q: "receipt", collegeId: "a", from: "2026-01-01", to: "2026-02-01" }, 4, 25]);
    expect(pagination(tree).props.totalItems).toBe(1401);
    expect(text(tree)).toContain("Joined Outside Page");
    expect(text(tree)).toContain("deleted-student");
    h.api.mockResolvedValue({ success: true });
    await query("payments").queryFn({ signal: undefined });
    expect(Object.fromEntries(new URL(h.api.mock.calls[0][0], "https://fixture.invalid").searchParams)).toEqual({ mode: "payments", page: "4", pageSize: "25", q: "receipt", collegeId: "a", from: "2026-01-01", to: "2026-02-01" });
    change(find(tree, n => n.props.title === "To Date"), "2026-03-01");
    tree = render("transactions");
    expect(query("payments").queryKey.slice(-2)).toEqual([1, 25]);
    pagination(tree).props.onPageSizeChange(50);
    render("transactions");
    expect(query("payments").queryKey.slice(-2)).toEqual([1, 50]);
  });

  it.each(["students", "transactions"] as const)("clamps %s after a mutation reduces the total", tab => {
    let tree = render(tab);
    pagination(tree).props.onPageChange(3);
    render(tab);
    const mode = tab === "students" ? "students" : "payments";
    h.results[mode].data = { ...h.results[mode].data, total: 26 };
    tree = render(tab);
    expect(pagination(tree).props.currentPage).toBe(2);
    h.results[mode].data = { ...h.results[mode].data, total: 0, students: [], payments: [] };
    render(tab);
    expect(query(mode).queryKey.slice(-2)).toEqual([1, 25]);
  });

  it.each(["students", "transactions"] as const)("keeps %s loading/errors distinct from empty results and retries independently", tab => {
    const mode = tab === "students" ? "students" : "payments";
    h.results[mode].isPending = true;
    h.results[mode].isSuccess = false;
    let tree = render(tab);
    expect(nodes(tree).some(n => n.props.role === "status")).toBe(true);
    expect(text(tree)).not.toMatch(/No students match|No payment transactions found/);
    h.results[mode].isPending = false;
    h.results[mode].isError = true;
    tree = render(tab);
    expect(nodes(tree).some(n => n.props.role === "alert")).toBe(true);
    expect(text(tree)).not.toMatch(/No students match|No payment transactions found/);
    button(tree, tab === "students" ? "Retry Students" : "Retry Transactions").props.onClick();
    expect(h.results[mode].refetch).toHaveBeenCalledOnce();
    expect(h.results.summary.refetch).not.toHaveBeenCalled();
    expect(text(tree)).not.toContain(tab === "students" ? "Name s501" : "Joined Outside Page");
  });

  it("rejects application failures instead of returning an empty successful query", async () => {
    render();
    h.api.mockResolvedValue({ success: false, message: "fixture failure" });
    for (const mode of ["summary", "students", "payments"]) {
      await expect(query(mode).queryFn({ signal: undefined })).rejects.toThrow("fixture failure");
    }
  });

  it("retains all page-student fees for expansion and refreshes the whole fees query family", () => {
    let tree = render();
    expect(text(tree)).toContain("₹300");
    find(tree, n => n.type === "button" && text(n).includes("Name s501")).props.onClick();
    tree = render();
    for (const term of ["fee-1", "fee-2", "fee-3"]) expect(text(tree)).toContain(term);
    expect(find(tree, n => n.type === "a" && n.props.href === "https://example.invalid/pay")).toBeDefined();
    expect(nodes(tree).filter(n => n.type as any === "Button" && text(n) === "Edit Record")).toHaveLength(3);
    find(tree, n => n.props.title === "Refresh Dashboard").props.onClick();
    expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["fees"] });
    expect(h.api).not.toHaveBeenCalled();
  });

  it("uses complete summary totals/facets while preserving the college-only payment fallback and synthetic reports", () => {
    let tree = render("overview");
    const reportText = text(tree);
    expect(reportText).toContain("₹77");
    expect(reportText).toContain("₹525"); // Synthetic 35% of the raw targets (1500).
    expect(reportText).toContain("₹70"); // Synthetic 35% of raw paid fees (200), not payments.
    expect(reportText).not.toContain("₹1,200");
    expect(nodes(tree).some(n => n.type === "text" && text(n) === "7")).toBe(true); // Pending fee-record count.
    change(find(tree, n => n.props.title === "From Date"), "1999-01-01");
    // The pre-existing Clear affordance appears once a date filter is active; report numbers must not move.
    expect(text(render("overview")).replace("Clear", "")).toBe(reportText);
    tree = render("colleges");
    const a = find(tree, n => n.type as any === "Card" && text(n).includes("College A"));
    expect(text(a)).toContain("6000 Enrolled Students");
    expect(text(a).match(/₹1,200/g)).toHaveLength(2); // Target clamped to fallback paid.
    const b = find(tree, n => n.type as any === "Card" && text(n).includes("College B"));
    expect(text(b)).toContain("₹200");
    expect(text(b)).not.toContain("₹900");
    tree = render();
    expect(text(select(tree, "All Departments"))).toContain("CompleteRosterDept");
    expect(text(select(tree, "All Academic Years"))).toContain("Year IV");
    const templateCollege = find(tree, n => n.props["aria-label"] === "College");
    expect(text(templateCollege)).toContain("Context College");
    const templateDept = find(tree, n => n.props["aria-label"] === "Department");
    expect(text(templateDept)).toContain("Context Course");
    expect(text(templateDept)).not.toContain("123");
  });
});

type Student = ReturnType<typeof student>;
type Fee = ReturnType<typeof fee>;
function pageLoader(roster: Student[]) {
  return async (url: string): Promise<FeeStudentsPage<Student, Fee>> => {
    const params = new URL(url, "https://fixture.invalid").searchParams;
    const page = Number(params.get("page"));
    const pageSize = Number(params.get("pageSize"));
    const students = roster.slice((page - 1) * pageSize, page * pageSize);
    return { success: true, students, fees: students.flatMap(s => [fee(s.id), fee(s.id, "second-term")]), total: roster.length, page, pageSize };
  };
}

describe("complete on-demand fee downloads", () => {
  it("traverses more than 500 students at max100 with filters intact and fees from every page", async () => {
    const load = vi.fn(pageLoader(Array.from({ length: 607 }, (_, i) => student(`s${i}`))));
    const filters = { q: "Reg & 42", collegeId: "a", department: "CSE", year: "Year III", status: "partial" };
    const result = await collectFeeStudentRows(filters, load, page => page.students.map(s => ({ id: s.id, terms: page.fees.filter(f => f.student_id === s.id).length })));
    expect(result).toHaveLength(607);
    expect(result[606]).toEqual({ id: "s606", terms: 2 });
    expect(load).toHaveBeenCalledTimes(7);
    load.mock.calls.forEach(([url], index) => expect(Object.fromEntries(new URL(url, "https://fixture.invalid").searchParams)).toEqual({ mode: "students", page: String(index + 1), pageSize: "100", ...filters }));
  });

  it.each(["network", "application", "truncated", "changed total", "repeated page"])("rejects %s failures without returning partial rows", async failure => {
    const roster = Array.from({ length: 607 }, (_, i) => student(`s${i}`));
    const source = pageLoader(roster);
    const write = vi.fn();
    const load = vi.fn(async (url: string) => {
      const result = await source(url);
      if (result.page === 2) {
        if (failure === "network") throw new Error("offline");
        if (failure === "application") return { ...result, success: false } as unknown as typeof result;
        if (failure === "truncated") return { ...result, students: [] };
        if (failure === "changed total") return { ...result, total: 606 };
        if (failure === "repeated page") return { ...result, students: roster.slice(0, 100) };
      }
      return result;
    });
    await expect(collectFeeStudentRows({}, load, p => p.students).then(write)).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("exports all matching rows with existing XLSX columns, never just the visible page", async () => {
    const roster = Array.from({ length: 607 }, (_, i) => student(`s${i}`));
    h.api.mockImplementation(pageLoader(roster));
    let tree = render();
    change(select(tree, "All Colleges"), "a");
    change(select(tree, "All Departments"), "CSE");
    change(select(tree, "All Academic Years"), "Year III");
    change(select(tree, "All Statuses"), "partial");
    change(find(tree, n => n.type as any === "Input" && n.props.value === ""), "Reg & 42");
    tree = render();
    pagination(tree).props.onPageChange(2);
    tree = render();
    const pending = button(tree, "Export Report").props.onClick();
    expect(button(render(), "Exporting…").props.disabled).toBe(true);
    expect(button(render(), "Download (.xlsx)").props.disabled).toBe(true);
    await pending;
    expect(h.write).toHaveBeenCalledOnce();
    const rows = h.sheet.mock.calls[0][0];
    expect(rows).toHaveLength(607);
    expect(rows[606]).toMatchObject({ "Student ID": "s606", "College": "College A", "Total Target Fee (₹)": 200, "Paid Fee (₹)": 60, "Remaining Dues (₹)": 140, "Fee Status": "Partial" });
    expect(Object.keys(rows[0])).toHaveLength(14);
    expect(h.api).toHaveBeenCalledTimes(7);
    for (const [url] of h.api.mock.calls) {
      const params = new URL(url, "https://fixture.invalid").searchParams;
      expect(params.get("department")).toBe("CSE");
      expect(params.get("status")).toBe("partial");
      expect(params.get("q")).toBe("Reg & 42");
      expect(params.get("year")).toBe("Year III");
      expect(params.get("pageSize")).toBe("100");
    }
    expect(button(render(), "Export Report").props.disabled).toBe(false);
  });

  it("templates traverse only the selected college, preserving case/blank departments and year/semester defaults", async () => {
    const roster = Array.from({ length: 605 }, (_, i) => student(`s${i}`, {
      department: i % 3 === 0 ? " cSe " : i % 3 === 1 ? "" : "Other",
      year: i % 3 === 0 ? "Year I" : "", semester: i % 3 === 0 ? "Semester 1" : "",
    }));
    roster[1] = student("s1", { department: "", year: "", semester: "", register_number: "s1" });
    h.api.mockImplementation(pageLoader(roster));
    const tree = render("overview");
    expect(h.api).not.toHaveBeenCalled();
    const pending = button(tree, "Download (.xlsx)").props.onClick();
    expect(button(render("overview"), "Downloading…").props.disabled).toBe(true);
    await pending;
    expect(h.write).toHaveBeenCalledOnce();
    const rows = h.sheet.mock.calls[0][0];
    expect(rows).toHaveLength(404);
    expect(rows[0]).toMatchObject({ "Department": " cSe ", "Year": "Year I", "Semester": "Semester 1" });
    expect(rows[1]).toMatchObject({ "Department": "CSE", "Year": "Year III", "Semester": "Semester 5", "Registration Number": "" });
    expect(rows.at(-1)["Student Name"]).toBe("Name s604");
    expect(h.api).toHaveBeenCalledTimes(7);
    for (const [url] of h.api.mock.calls) {
      const params = new URL(url, "https://fixture.invalid").searchParams;
      expect([...params.keys()].sort()).toEqual(["collegeId", "mode", "page", "pageSize"]);
      expect(params.get("collegeId")).toBe("a");
    }
    expect(h.sheet.mock.calls[0][1].header).toHaveLength(12);
  });

  it("keeps the blank template row when the college has no matching students", async () => {
    h.api.mockImplementation(pageLoader([]));
    await button(render("overview"), "Download (.xlsx)").props.onClick();
    expect(h.sheet.mock.calls[0][0]).toEqual([{
      "Registration Number": "", "College Name": "College A", "Student Name": "", "Year": "Year III",
      "Email": "", "Mobile Number": "", "Department": "CSE", "Semester": "Semester 5",
      "FPC FEES PAID": "", "FPC FEES PENDING": "", "Amount": "", "Payment Link": "",
    }]);
  });

  it.each(["Export Report", "Download (.xlsx)"])("%s toasts on late-page failure and never writes a partial workbook", async action => {
    const source = pageLoader(Array.from({ length: 607 }, (_, i) => student(`s${i}`)));
    h.api.mockImplementation(async (url: string) => {
      const result = await source(url);
      if (result.page === 6) throw new Error("fixture page failure");
      return result;
    });
    await button(render(), action).props.onClick();
    expect(h.api).toHaveBeenCalledTimes(6);
    expect(h.write).not.toHaveBeenCalled();
    expect(h.sheet).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(expect.stringContaining("fixture page failure"));
    expect(button(render(), action).props.disabled).toBe(false);
  });

  it("has no monolithic ledger or page-size=all request path", () => {
    const source = readFileSync(new URL("../src/components/FeeManagerDashboard.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/role=fee_manager|filteredStudents|filteredPayments|data\.(?:students|fees|payments)\b|pageSize=all/);
    expect(feeStudentsUrl({ collegeId: "a" }, 1, 100)).toBe("/api/fees?mode=students&page=1&pageSize=100&collegeId=a");
  });
});
