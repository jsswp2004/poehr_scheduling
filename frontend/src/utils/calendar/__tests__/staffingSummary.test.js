import { worstStatus, summarizeShifts, toFillList, firstDayWithStatus } from "../staffingSummary";

const day = {
  status: "not_met",
  items: [
    { unit_id: 1, unit_name: "3 West", shift_type: "day", shift_label: "Day", status: "met", assigned: 4, required: 4, required_rn: 1, rn_scheduled: 2 },
    { unit_id: 2, unit_name: "4 East", shift_type: "day", shift_label: "Day", status: "not_met", assigned: 2, required: 4, required_rn: 1, rn_scheduled: 2 },
    { unit_id: 1, unit_name: "3 West", shift_type: "night", shift_label: "Night", status: "not_met", assigned: 1, required: 3, required_rn: 1, rn_scheduled: 0 },
    { unit_id: 2, unit_name: "4 East", shift_type: "evening", shift_label: "Evening", status: "unknown", assigned: 0, required: 0 },
  ],
};

describe("worstStatus", () => {
  it("ranks not_met over at_risk over met", () => {
    expect(worstStatus(["met", "at_risk", "not_met"])).toBe("not_met");
    expect(worstStatus(["met", "at_risk"])).toBe("at_risk");
    expect(worstStatus(["met", "met"])).toBe("met");
  });
  it("is unknown for nothing or only unknown", () => {
    expect(worstStatus([])).toBe("unknown");
    expect(worstStatus(undefined)).toBe("unknown");
    expect(worstStatus(["unknown"])).toBe("unknown");
  });
});

describe("summarizeShifts", () => {
  it("adds units together per shift and orders Day, Evening, Night", () => {
    const rows = summarizeShifts(day);
    expect(rows.map((r) => r.shift_type)).toEqual(["day", "evening", "night"]);
    expect(rows[0]).toEqual({ shift_type: "day", assigned: 6, required: 8, status: "not_met" });
    expect(rows[1].status).toBe("unknown");
    expect(rows[2]).toEqual({ shift_type: "night", assigned: 1, required: 3, status: "not_met" });
  });
  it("handles a missing day", () => {
    expect(summarizeShifts(null)).toEqual([]);
  });
});

describe("toFillList", () => {
  it("lists short unit shifts and one RN gap per shift, skipping unknown items", () => {
    const list = toFillList(day);
    expect(list.map((i) => [i.kind, i.unit_name, i.shift_type, i.need])).toEqual([
      ["staff", "4 East", "day", 2],
      ["staff", "3 West", "night", 2],
      ["rn", "3 West", "night", 1],
    ]);
  });
  it("is empty when everything is covered", () => {
    expect(
      toFillList({ items: [{ shift_type: "day", status: "met", assigned: 3, required: 3, required_rn: 1, rn_scheduled: 1 }] })
    ).toEqual([]);
  });
});

describe("firstDayWithStatus", () => {
  it("finds the earliest matching day", () => {
    const coverage = { days: { "2026-10-22": { status: "met" }, "2026-10-20": { status: "not_met" }, "2026-10-18": { status: "not_met" } } };
    expect(firstDayWithStatus(coverage, "not_met")).toBe("2026-10-18");
    expect(firstDayWithStatus(coverage, "at_risk")).toBeNull();
    expect(firstDayWithStatus(null, "met")).toBeNull();
  });
});
