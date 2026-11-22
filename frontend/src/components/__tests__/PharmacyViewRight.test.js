jest.mock("jwt-decode", () => ({ jwtDecode: jest.fn() }));

import { jwtDecode } from "jwt-decode";
import { canViewPharmacy, pharmacyReadOnly, solutionsFor } from "../../utils/landing";
import { MODULE_LINKS, linkAllowed } from "../../utils/moduleLinks";
import { visibleChartTabs } from "../patients/PatientChartTabs";
import { availableCareSettings } from "../patients/CareSettingSidebar";

const PHARMACY_LINK = MODULE_LINKS.find((m) => m.key === "pharmacy");
const MODULES = ["clinical_documentation", "pharmacy"];
const signIn = (claims) => {
  localStorage.setItem("access_token", "t");
  jwtDecode.mockReturnValue({ exp: Date.now() / 1000 + 3600, modules: MODULES, ...claims });
};

afterEach(() => localStorage.removeItem("access_token"));

test("the 'pharmacy.view' right (sign-in claim) decides; older sign-ins fall back to the role", () => {
  expect(canViewPharmacy({ role: "doctor", pharmacy_view: true })).toBe(true);
  expect(canViewPharmacy({ role: "doctor", pharmacy_view: false })).toBe(false);
  expect(canViewPharmacy({ role: "doctor" })).toBe(false);
  expect(canViewPharmacy({ role: "pharmacist" })).toBe(true);
  expect(canViewPharmacy({ role: "pharmacist", pharmacy_view: false })).toBe(false); // taken away by an admin
  expect(pharmacyReadOnly({ role: "doctor", pharmacy_view: true })).toBe(true);
  expect(pharmacyReadOnly({ role: "pharmacist", pharmacy_view: true })).toBe(false);
});

test("a doctor granted the right gets the Pharmacy header link and Solutions tile; without it, neither", () => {
  expect(linkAllowed(PHARMACY_LINK, "doctor", { pharmacy_view: true })).toBe(true);
  expect(linkAllowed(PHARMACY_LINK, "doctor", { pharmacy_view: false })).toBe(false);
  expect(linkAllowed(PHARMACY_LINK, "admin", {})).toBe(true);
  expect(solutionsFor("doctor", MODULES, { pharmacy_view: true }).map((t) => t.key)).toContain("pharmacy");
  expect(solutionsFor("doctor", MODULES, { pharmacy_view: false }).map((t) => t.key)).not.toContain("pharmacy");
  expect(solutionsFor("doctor", ["clinical_documentation"], { pharmacy_view: true }).map((t) => t.key)).not.toContain("pharmacy"); // module off
});

test("a doctor with the right sees the read-only Pharmacy tabs (no Outpatient Rx, no eRx Routing)", () => {
  const tabs = visibleChartTabs("doctor", null, "pharmacy", true).map((t) => t.value);
  expect(tabs).toEqual(["patient_list", "verification_queue", "med_profile", "formulary", "orders", "prescriptions", "results", "patient_info"]);
  expect(visibleChartTabs("doctor", null, "pharmacy", false).map((t) => t.value)).toEqual(["patient_list"]);
  expect(visibleChartTabs("pharmacist", null, "pharmacy", true).map((t) => t.value)).toContain("outpatient_rx");
  expect(visibleChartTabs("pharmacist", null, "pharmacy", false).map((t) => t.value)).toEqual(["patient_list"]);
});

test("the Pharmacy care setting is offered to a doctor only with the right", () => {
  signIn({ role: "doctor", pharmacy_view: true });
  expect(availableCareSettings("doctor").map((c) => c.key)).toContain("pharmacy");
  signIn({ role: "doctor", pharmacy_view: false });
  expect(availableCareSettings("doctor").map((c) => c.key)).not.toContain("pharmacy");
});
