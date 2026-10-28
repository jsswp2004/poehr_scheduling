import { formatCell, presetRange, rangeText, resultToCsv, stepRange } from "./reportUtils";

describe("report dates", () => {
  const wed = new Date(2026, 9, 28); // Wednesday, Oct 28 2026

  test("weeks run Monday to Sunday", () => {
    expect(presetRange("week", wed)).toEqual({ start: "2026-10-26", end: "2026-11-01" });
  });

  test("month and today", () => {
    expect(presetRange("month", wed)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(presetRange("today", wed)).toEqual({ start: "2026-10-28", end: "2026-10-28" });
  });

  test("stepping a week or a month", () => {
    expect(stepRange("week", "2026-10-26", "2026-11-01", 1)).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(stepRange("month", "2026-10-01", "2026-10-31", -1)).toEqual({ start: "2026-09-01", end: "2026-09-30" });
  });

  test("range text", () => {
    expect(rangeText("2026-10-26", "2026-11-01")).toBe("Oct 26 – Nov 1, 2026");
    expect(rangeText("2026-10-28", "2026-10-28")).toBe("Oct 28, 2026");
  });
});

describe("report cells", () => {
  test("formats by type", () => {
    expect(formatCell(null, "hours")).toBe("—");
    expect(formatCell(12.5, "hours")).toBe("12.5");
    expect(formatCell(3.94, "percent")).toBe("3.9%");
    expect(formatCell(2.5, "ratio")).toBe("2.50");
    expect(formatCell("2026-10-26", "date")).toBe("Oct 26, 2026");
    expect(formatCell("Total", "date")).toBe("Total");
  });
});

describe("CSV", () => {
  test("quotes commas and neutralises formulas", () => {
    const result = {
      columns: [
        { key: "staff", label: "Staff member", type: "text" },
        { key: "hours", label: "Hours", type: "hours" },
      ],
      rows: [
        { staff: "Lee, Ann", hours: 48 },
        { staff: "=HYPERLINK(\"x\")", hours: 12 },
      ],
      totals: { staff: "Total", hours: 60 },
    };
    const lines = resultToCsv(result).split("\r\n");
    expect(lines[0]).toBe("Staff member,Hours");
    expect(lines[1]).toBe('"Lee, Ann",48');
    expect(lines[2].startsWith('"\'=HYPERLINK')).toBe(true);
    expect(lines[3]).toBe("Total,60");
  });
});
