import { unitOptionsFrom } from "../patients/unitOptions";

const tree = (...facilities) => facilities;
const fac = (name, ...units) => ({ name, units });
const unit = (id, name, care_type = "inpatient") => ({ id, name, care_type });

test("one facility: labels are just the unit names", () => {
  expect(unitOptionsFrom(tree(fac("Riverside Hospital (Demo)", unit(1, "Medicine"), unit(2, "Surgery"))))).toEqual([
    { id: 1, name: "Medicine", short: "Medicine" },
    { id: 2, name: "Surgery", short: "Surgery" },
  ]);
});

test("several facilities: the full label names the facility, the short one never does", () => {
  const options = unitOptionsFrom(tree(fac("Riverside Hospital (Demo)", unit(1, "Medicine")), fac("Harbor", unit(3, "Medicine"))));
  expect(options).toEqual([
    { id: 1, name: "Medicine (Riverside Hospital (Demo))", short: "Medicine" },
    { id: 3, name: "Medicine (Harbor)", short: "Medicine" },
  ]);
});

test("only inpatient units are offered", () => {
  expect(unitOptionsFrom(tree(fac("A", unit(1, "Ward"), unit(2, "Clinic", "outpatient"), unit(3, "ED", "emergency"))))).toEqual([{ id: 1, name: "Ward", short: "Ward" }]);
});

test("no tree, no facilities, or a facility with no units gives an empty list", () => {
  expect(unitOptionsFrom(null)).toEqual([]);
  expect(unitOptionsFrom(undefined)).toEqual([]);
  expect(unitOptionsFrom([])).toEqual([]);
  expect(unitOptionsFrom([{ name: "Empty" }])).toEqual([]);
});
