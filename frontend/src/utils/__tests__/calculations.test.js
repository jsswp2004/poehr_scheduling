import {
  applyCalculations,
  computeCalc,
  describeCalc,
  formatNumber,
  INTERPRETATION_SUFFIX,
  parseFormula,
  toNumber,
} from "../calculations";
import vectors from "./calcVectors.json";

// The same cases appointments/test_calculations.py runs against the Python
// engine -- if one side changes and the other doesn't, both suites say so.
describe("computeCalc matches the shared vectors", () => {
  vectors.forEach((vec) => {
    it(vec.name, () => {
      const got = computeCalc(vec.calc, { ...vec.values });
      expect(got.value).toBe(vec.expect.value);
      expect(got.interpretation).toBe(vec.expect.interpretation);
      expect(got.alerts).toEqual(vec.expect.alerts);
    });
  });
});

describe("applyCalculations", () => {
  const keys = Array.from({ length: 9 }, (_, i) => `phq9_q${i + 1}`);
  const items = [
    ...keys.map((key) => ({ key, field_type: "dropdown" })),
    {
      key: "phq9_total",
      field_type: "calculated",
      calc: {
        operation: "sum",
        sources: keys,
        decimals: 0,
        bands: [
          { min: 0, max: 4, label: "None-minimal" },
          { min: 5, max: 27, label: "Elevated" },
        ],
      },
    },
    {
      key: "double_total",
      field_type: "calculated",
      calc: { operation: "formula", formula: "phq9_total * 2", sources: ["phq9_total"], decimals: 0 },
    },
  ];

  it("stores the total, its interpretation, and chains calculations", () => {
    const input = Object.fromEntries(keys.map((k) => [k, "1"]));
    const { values } = applyCalculations(items, input);
    expect(values.phq9_total).toBe("9");
    expect(values[`phq9_total${INTERPRETATION_SUFFIX}`]).toBe("Elevated");
    expect(values.double_total).toBe("18");
    expect(input.phq9_total).toBeUndefined(); // input is not mutated
  });

  it("overwrites a stale value and clears it when an answer is removed", () => {
    const input = Object.fromEntries(keys.map((k) => [k, "1"]));
    input.phq9_total = "99";
    const first = applyCalculations(items, input).values;
    expect(first.phq9_total).toBe("9");
    const cleared = applyCalculations(items, { ...first, phq9_q3: "" }).values;
    expect(cleared.phq9_total).toBeUndefined();
    expect(cleared[`phq9_total${INTERPRETATION_SUFFIX}`]).toBeUndefined();
    expect(cleared.double_total).toBeUndefined();
  });
});

describe("helpers", () => {
  it("reads only plain decimals", () => {
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber(" 3 ")).toBe(3);
    expect(toNumber("")).toBeNull();
    expect(toNumber("abc")).toBeNull();
    expect(toNumber("0x10")).toBeNull();
    expect(toNumber("Infinity")).toBeNull();
    expect(toNumber(true)).toBe(1);
  });

  it("formats with exact decimals and no negative zero", () => {
    expect(formatNumber(1.005, 2)).toBe("1.01");
    expect(formatNumber(-0.04, 1)).toBe("0.0");
    expect(formatNumber(12, 0)).toBe("12");
  });

  it("reports formula mistakes readably", () => {
    expect(() => parseFormula("a +")).toThrow(/ends unexpectedly/);
    expect(() => parseFormula("a $ 2")).toThrow(/not allowed/);
    expect(() => parseFormula("(a")).toThrow(/matching/);
  });

  it("describes a calculation briefly", () => {
    expect(describeCalc({ operation: "sum", sources: ["a", "b"] })).toBe("sum (total) of 2 items");
    expect(describeCalc({})).toBe("not set up");
  });
});
