import {
  assignLanes,
  barGeometry,
  boardName,
  boardRows,
  hourLabel,
  matchesSearch,
  minutesOfDay,
  shiftDay,
  startValue,
  todayISO,
  usDate,
} from "./surgeryUtils";

describe("surgeryUtils", () => {
  test("shiftDay crosses month and year ends", () => {
    expect(shiftDay("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
  });

  test("usDate and hourLabel", () => {
    expect(usDate("2026-11-03")).toBe("11-03-2026");
    expect(usDate("")).toBe("");
    expect([7, 12, 13, 0, 24].map(hourLabel)).toEqual(["7 am", "12 pm", "1 pm", "12 am", "12 am"]);
  });

  test("todayISO has the right shape", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("minutesOfDay reads the clock in the text and clamps other days", () => {
    expect(minutesOfDay("2026-11-03T08:30-05:00", "2026-11-03")).toBe(510);
    expect(minutesOfDay("2026-11-04T01:00-05:00", "2026-11-03")).toBe(1440);
    expect(minutesOfDay("2026-11-02T23:00-05:00", "2026-11-03")).toBe(0);
  });

  test("barGeometry places a bar as a share of the visible hours", () => {
    const bar = { scheduled_start: "2026-11-03T08:00-05:00", scheduled_end: "2026-11-03T09:30-05:00" };
    const g = barGeometry(bar, "2026-11-03", 7, 19);
    expect(g.left).toBeCloseTo(100 / 12, 5);
    expect(g.width).toBeCloseTo((90 / 720) * 100, 5);
  });

  test("barGeometry clips a bar that runs past the end of the visible hours", () => {
    const bar = { scheduled_start: "2026-11-03T18:00-05:00", scheduled_end: "2026-11-03T21:00-05:00" };
    const g = barGeometry(bar, "2026-11-03", 7, 19);
    expect(g.left + g.width).toBeCloseTo(100, 5);
  });

  test("assignLanes stacks overlapping cases and reuses a free lane", () => {
    const bars = [
      { id: 1, scheduled_start: "2026-11-03T08:00", scheduled_end: "2026-11-03T10:00" },
      { id: 2, scheduled_start: "2026-11-03T09:00", scheduled_end: "2026-11-03T09:30" },
      { id: 3, scheduled_start: "2026-11-03T10:00", scheduled_end: "2026-11-03T11:00" },
    ];
    const { bars: placed, lanes } = assignLanes(bars);
    expect(lanes).toBe(2);
    expect(placed.map((b) => [b.id, b.lane])).toEqual([[1, 0], [2, 1], [3, 0]]);
  });

  test("assignLanes with no cases still has one lane", () => {
    expect(assignLanes([]).lanes).toBe(1);
  });

  test("matchesSearch looks at name, MRN, case id and procedures", () => {
    const row = { patient: { name: "Bascom, Mark B", mrn: "MRN-000012" }, case_number: 1042, procedures_text: "CYSTOSCOPY [Right]", service: "Urology", surgeon: { name: "Lee, Jeffrey" } };
    expect(matchesSearch(row, "")).toBe(true);
    expect(matchesSearch(row, "bascom")).toBe(true);
    expect(matchesSearch(row, "000012")).toBe(true);
    expect(matchesSearch(row, "1042")).toBe(true);
    expect(matchesSearch(row, "cysto")).toBe(true);
    expect(matchesSearch(row, "lee")).toBe(true);
    expect(matchesSearch(row, "knee")).toBe(false);
  });

  test("startValue joins date and time without a zone", () => {
    expect(startValue("2026-11-03", "08:00")).toBe("2026-11-03T08:00");
  });

  test("boardName can cut a name down for a wall display", () => {
    expect(boardName("Bascom, Mark B")).toBe("BASCOM, MARK B");
    expect(boardName("Bascom, Mark B", "last_initial")).toBe("BASCOM, M.");
    expect(boardName("Bascom, Mark B", "initials")).toBe("M.B.");
    expect(boardName("Cher", "last_initial")).toBe("CHER");
    expect(boardName("", "initials")).toBe("");
    expect(boardName(null)).toBe("");
  });

  test("boardRows sorts by time and can drop finished cases", () => {
    const rows = [
      { id: 2, status: "pacu", scheduled_start: "2026-11-03T10:00" },
      { id: 1, status: "discharged", scheduled_start: "2026-11-03T07:30" },
      { id: 3, status: "cancelled", scheduled_start: "2026-11-03T08:00" },
      { id: 4, status: "transferred", scheduled_start: "2026-11-03T09:00" },
      { id: 5, status: "pending", scheduled_start: "2026-11-03T09:00" },
    ];
    expect(boardRows(rows, false).map((r) => r.id)).toEqual([1, 3, 4, 5, 2]);
    expect(boardRows(rows, true).map((r) => r.id)).toEqual([5, 2]);
    expect(rows[0].id).toBe(2); // the input is left alone
  });
});
