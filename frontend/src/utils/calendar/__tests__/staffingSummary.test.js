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
    expect(rows[0]).toEqual({ shift_type: "day", assigned: 6, required: 8, status: "not_met", reasons: [] });
    expect(rows[1].status).toBe("unknown");
    expect(rows[2]).toEqual({ shift_type: "night", assigned: 1, required: 3, status: "not_met", reasons: [] });
  });
  it("handles a missing day", () => {
    expect(summarizeShifts(null)).toEqual([]);
  });
});

describe("summarizeShifts reasons", () => {
  it("keeps the reasons of red and amber items, prefixed with the unit, without repeats", () => {
    const rows = summarizeShifts({
      items: [
        { unit_name: "2 West", shift_type: "day", status: "not_met", assigned: 3, required: 3, reasons: ["Needs 1 more RN"] },
        { unit_name: "2 West", shift_type: "day", status: "not_met", assigned: 3, required: 3, reasons: ["Needs 1 more RN"] },
        { unit_name: "4 East", shift_type: "day", status: "met", assigned: 3, required: 3, reasons: ["Fine"] },
      ],
    });
    expect(rows[0].reasons).toEqual(["2 West: Needs 1 more RN"]);
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

describe("units with no standard", () => {
  const info = {
    items: [
      { unit_id: 1, unit_name: "2 West", shift_type: "day", status: "met", assigned: 4, required: 4 },
      { unit_id: 3, unit_name: "Garden Level", shift_type: null, status: "no_standard", assigned: null, required: null },
    ],
  };

  it("does not count them in the shift summary or the fill list", () => {
    const rows = summarizeShifts(info);
    expect(rows).toHaveLength(1);
    expect(rows[0].shift_type).toBe("day");
    expect(toFillList(info)).toEqual([]);
  });

  it("lists them by unit", () => {
    const { noStandardUnits } = require("../staffingSummary");
    expect(noStandardUnits(info)).toEqual([{ unit_id: 3, unit_name: "Garden Level" }]);
  });
});
