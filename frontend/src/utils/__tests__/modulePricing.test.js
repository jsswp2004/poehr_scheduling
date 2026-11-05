import { monthlyTotal, planMonthlyTotal, planTerms } from "../modulePricing";

const modules = [
  { code: "scheduling", quoted: false },
  { code: "staffing", quoted: false },
  { code: "telehealth", quoted: false },
  { code: "lab_interface", quoted: true },
];

test("Professional includes one service, Clinic includes two, each extra is $150", () => {
  expect(planMonthlyTotal(["scheduling"], modules, null, "basic")).toBe(299);
  expect(planMonthlyTotal(["scheduling", "staffing"], modules, null, "basic")).toBe(449);
  expect(planMonthlyTotal(["scheduling", "staffing"], modules, null, "premium")).toBe(599);
  expect(planMonthlyTotal(["scheduling", "staffing", "telehealth"], modules, null, "premium")).toBe(749);
});

test("the quoted lab interface never counts, and Group is priced by a quote", () => {
  expect(planMonthlyTotal(["scheduling", "staffing", "lab_interface"], modules, null, "premium")).toBe(599);
  expect(planMonthlyTotal(["scheduling"], modules, null, "enterprise")).toBeNull();
});

test("server terms win over the built-in defaults", () => {
  const server = { premium: { base: 650, included_count: 3, quoted: false } };
  expect(planTerms(server, "premium")).toEqual({ base: 650, included: 3, quoted: false });
  expect(monthlyTotal(["scheduling"], modules)).toBe(299);
});
