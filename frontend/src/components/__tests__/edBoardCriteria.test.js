import { render, screen } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { edBoard: "/ed/board/", edBoardPreference: "/ed/pref/" } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import EDBoard from "../edBoard/EDBoard";
import { ageIn, ageLabel, conditionMatches, describeCondition, describeCriteria, filterRows, matchesCriteria } from "../edBoard/edBoardColumns";
import { cellText } from "../edBoard/edBoardTable";

const visit = (over = {}) => ({
  registration: 1, name: "TEST, Jane", age: 34, age_months: 408, age_days: 12400, age_text: "34 y", sex: "F", esi: 3, ed_status: "tip", complaint: "Chest pain",
  md: { id: 8, name: "Lee, Jeffrey" }, rn: { id: 7, name: "Geronimo, Ann" }, ...over,
});
const baby = visit({ registration: 2, name: "OKAFOR, Noah", age: 0, age_months: 8, age_days: 250, age_text: "8 mo", sex: "M", esi: 2, complaint: "Fever" });
const child = visit({ registration: 3, name: "REYES, Mateo", age: 14, age_months: 170, age_days: 5200, age_text: "14 y", sex: "M", esi: 4, ed_status: "wtbs", md: null, complaint: "Ankle injury" });
const rows = () => [
  { type: "bed", bed: 1, loc: "ED-1", visit: visit() },
  { type: "bed", bed: 2, loc: "Peds-A", visit: baby },
  { type: "bed", bed: 3, loc: "Peds-B", visit: null, bed_status: "available" },
  { type: "waiting", bed: null, loc: "", visit: child },
];
const cond = (c) => ({ match: "all", conditions: [c] });

describe("age", () => {
  test("ageIn reads the same patient in years, months or days", () => {
    expect(ageIn(baby, "years")).toBe(0);
    expect(ageIn(baby, "months")).toBe(8);
    expect(ageIn(baby, "days")).toBe(250);
    expect(ageIn(visit({ age: null }), "years")).toBeNull();
  });

  test("a board without month and day counts still works from whole years", () => {
    expect(ageIn({ age: 3 }, "months")).toBe(36);
    expect(ageIn({ age: 3 }, "days")).toBe(1095);
  });

  test("babies read in months and days, everyone else in years", () => {
    expect(ageLabel(visit())).toBe("34y");
    expect(ageLabel(baby)).toBe("8mo");
    expect(ageLabel(visit({ age: 1, age_text: "11 mo" }))).toBe("11mo");
    expect(ageLabel(visit({ age: 0, age_text: "11 d" }))).toBe("11d");
    expect(ageLabel(visit({ age: null }))).toBe("");
    expect(ageLabel({ age: 0 })).toBe("0y");
  });

  test("the Age column shows it with the gender", () => {
    expect(cellText({ key: "age" }, { visit: baby }, {})).toBe("8mo /M");
    expect(cellText({ key: "age" }, { visit: visit() }, {})).toBe("34y /F");
  });
});

describe("conditions", () => {
  test("age under 18 keeps children and babies, not adults", () => {
    const c = { field: "age", op: "lt", value: 18, unit: "years" };
    expect([visit(), baby, child].map((v) => conditionMatches(c, v))).toEqual([false, true, true]);
  });

  test("every age comparison", () => {
    const at = (op, value, unit = "years") => conditionMatches({ field: "age", op, value, unit }, child);
    expect(at("lt", 14)).toBe(false);
    expect(at("lte", 14)).toBe(true);
    expect(at("gt", 14)).toBe(false);
    expect(at("gte", 14)).toBe(true);
    expect(conditionMatches({ field: "age", op: "lte", value: 6, unit: "months" }, baby)).toBe(false);
    expect(conditionMatches({ field: "age", op: "lte", value: 12, unit: "months" }, baby)).toBe(true);
    expect(conditionMatches({ field: "age", op: "lt", value: 300, unit: "days" }, baby)).toBe(true);
  });

  test("a patient with no date of birth never matches an age condition", () => {
    expect(conditionMatches({ field: "age", op: "lt", value: 18, unit: "years" }, visit({ age: null }))).toBe(false);
  });

  test("ESI, status, gender, MD and RN pick from a list", () => {
    expect(conditionMatches({ field: "esi", op: "in", value: [1, 2] }, baby)).toBe(true);
    expect(conditionMatches({ field: "esi", op: "in", value: [1, 2] }, visit())).toBe(false);
    expect(conditionMatches({ field: "esi", op: "in", value: [1, 2] }, visit({ esi: null }))).toBe(false);
    expect(conditionMatches({ field: "ed_status", op: "in", value: ["wtbs"] }, child)).toBe(true);
    expect(conditionMatches({ field: "sex", op: "in", value: ["F"] }, visit())).toBe(true);
    expect(conditionMatches({ field: "sex", op: "in", value: ["F"] }, baby)).toBe(false);
    expect(conditionMatches({ field: "md", op: "in", value: [8] }, visit())).toBe(true);
    expect(conditionMatches({ field: "md", op: "in", value: [8] }, child)).toBe(false);
    expect(conditionMatches({ field: "rn", op: "in", value: [7] }, visit())).toBe(true);
  });

  test("chief complaint contains text, ignoring case", () => {
    expect(conditionMatches({ field: "complaint", op: "contains", value: "FEV" }, baby)).toBe(true);
    expect(conditionMatches({ field: "complaint", op: "contains", value: "fever" }, visit())).toBe(false);
  });

  test("a condition this version does not know hides nobody", () => {
    expect(conditionMatches({ field: "shoe_size", op: "lt", value: 3 }, visit())).toBe(true);
  });

  test("all of the conditions, or any of them", () => {
    const kid = { field: "age", op: "lt", value: 18, unit: "years" };
    const sick = { field: "esi", op: "in", value: [1, 2] };
    expect(matchesCriteria({ match: "all", conditions: [kid, sick] }, baby)).toBe(true);
    expect(matchesCriteria({ match: "all", conditions: [kid, sick] }, child)).toBe(false);
    expect(matchesCriteria({ match: "any", conditions: [kid, sick] }, child)).toBe(true);
    expect(matchesCriteria({ match: "any", conditions: [kid, sick] }, visit())).toBe(false);
  });

  test("no conditions means everyone", () => {
    expect(matchesCriteria(null, visit())).toBe(true);
    expect(matchesCriteria({ match: "all", conditions: [] }, visit())).toBe(true);
  });
});

describe("filterRows with conditions", () => {
  const kids = cond({ field: "age", op: "lt", value: 18, unit: "years" });

  test("no conditions changes nothing", () => {
    expect(filterRows(rows(), "all", 1, [])).toHaveLength(4);
    expect(filterRows(rows(), "all", 1, [], { match: "all", conditions: [] })).toHaveLength(4);
  });

  test("keeps patients who match, including waiting ones, and drops adults", () => {
    const out = filterRows(rows(), "all", 1, [], kids);
    expect(out.map((r) => r.visit.name)).toEqual(["OKAFOR, Noah", "REYES, Mateo"]);
  });

  test("empty beds disappear unless beds were chosen", () => {
    expect(filterRows(rows(), "all", 1, [], kids).some((r) => r.type === "bed" && !r.visit)).toBe(false);
    expect(filterRows(rows(), "all", 1, [], kids, true).some((r) => r.type === "bed" && !r.visit)).toBe(false);
  });

  test("with beds chosen, empty beds in them stay, if the view asks for that", () => {
    const withBeds = filterRows(rows(), "all", 1, [2, 3], kids, true);
    expect(withBeds.map((r) => r.loc)).toEqual(["Peds-A", "Peds-B"]);
    const without = filterRows(rows(), "all", 1, [2, 3], kids, false);
    expect(without.map((r) => r.loc)).toEqual(["Peds-A"]);
  });

  test("conditions work with Waiting Area and Mine", () => {
    expect(filterRows(rows(), "waiting", 1, [], kids).map((r) => r.visit.name)).toEqual(["REYES, Mateo"]);
    expect(filterRows(rows(), "mine", 8, [], cond({ field: "age", op: "gte", value: 18, unit: "years" })).map((r) => r.visit.name)).toEqual(["TEST, Jane"]);
  });
});

describe("saying it in words", () => {
  const lookups = { statuses: [{ value: "wtbs", code: "WTBS" }], doctors: [{ id: 8, name: "Lee, Jeffrey" }], nurses: [{ id: 7, name: "Geronimo, Ann" }] };

  test("each kind of condition", () => {
    expect(describeCondition({ field: "age", op: "lt", value: 18, unit: "years" })).toBe("age under 18 years");
    expect(describeCondition({ field: "age", op: "gte", value: 1, unit: "months" })).toBe("age at least 1 month");
    expect(describeCondition({ field: "esi", op: "in", value: [1, 2] })).toBe("ESI 1 or 2");
    expect(describeCondition({ field: "ed_status", op: "in", value: ["wtbs", "gone"] }, lookups)).toBe("status WTBS or gone");
    expect(describeCondition({ field: "sex", op: "in", value: ["F", "M"] })).toBe("female or male");
    expect(describeCondition({ field: "md", op: "in", value: [8, 99] }, lookups)).toBe("MD Lee, Jeffrey or #99");
    expect(describeCondition({ field: "rn", op: "in", value: [7] }, lookups)).toBe("RN Geronimo, Ann");
    expect(describeCondition({ field: "complaint", op: "contains", value: "fever" })).toBe('complaint has "fever"');
  });

  test("joined with and / or, empty when there are none", () => {
    const list = [{ field: "age", op: "lt", value: 18, unit: "years" }, { field: "esi", op: "in", value: [1, 2] }];
    expect(describeCriteria({ match: "all", conditions: list })).toBe("age under 18 years and ESI 1 or 2");
    expect(describeCriteria({ match: "any", conditions: list })).toBe("age under 18 years or ESI 1 or 2");
    expect(describeCriteria(null)).toBe("");
    expect(describeCriteria({ match: "all", conditions: [] })).toBe("");
  });
});

describe("the board with a conditions view", () => {
  const data = () => ({
    departments: [{ id: 5, name: "ED", facility_name: "General" }],
    unit: 5,
    statuses: [{ value: "tip", code: "TIP", label: "Treating" }],
    staff: { nurses: [], doctors: [] },
    rows: rows(),
  });
  const columns = [
    { key: "loc", label: "LOC", width: 80, visible: true },
    { key: "patient", label: "Patient", width: 170, visible: true },
    { key: "age", label: "Age", width: 80, visible: true },
  ];

  test("says what it is filtered to and lists only those patients", () => {
    render(<EDBoard userRole="nurse" previewData={data()} previewView={{ label: "Peds ED", columns, rules: [], filter: "all", criteria: cond({ field: "age", op: "lt", value: 18, unit: "years" }) }} />);
    expect(screen.getByTestId("criteria-chip")).toHaveTextContent("Showing: age under 18 years · 2 patients");
    expect(screen.getByText("OKAFOR, Noah")).toBeInTheDocument();
    expect(screen.getByText("REYES, Mateo")).toBeInTheDocument();
    expect(screen.queryByText("TEST, Jane")).toBeNull();
    expect(screen.getByText("8mo /M")).toBeInTheDocument();
  });

  test("with no conditions there is no chip and everybody is listed", () => {
    render(<EDBoard userRole="nurse" previewData={data()} previewView={{ label: "All", columns, rules: [], filter: "all" }} />);
    expect(screen.queryByTestId("criteria-chip")).toBeNull();
    expect(screen.getByText("TEST, Jane")).toBeInTheDocument();
  });

  test("when nobody matches it says so", () => {
    render(<EDBoard userRole="nurse" previewData={data()} previewView={{ label: "Old", columns, rules: [], filter: "all", criteria: cond({ field: "age", op: "gt", value: 120, unit: "years" }) }} />);
    expect(screen.getByText("Nobody on the board matches this view's conditions.")).toBeInTheDocument();
  });
});
