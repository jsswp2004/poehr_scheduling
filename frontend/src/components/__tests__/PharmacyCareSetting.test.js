import { render, screen } from "@testing-library/react";
import { jwtDecode } from "jwt-decode";
import CareSettingSidebar, { storedCareSetting, availableCareSettings } from "../patients/CareSettingSidebar";
import { PatientChartTabs, visibleChartTabs } from "../patients/PatientChartTabs";

jest.mock("jwt-decode", () => ({ jwtDecode: jest.fn() }));

const signIn = (role, modules) => {
  window.localStorage.setItem("access_token", "t");
  jwtDecode.mockReturnValue({ role, modules });
};

beforeEach(() => {
  window.localStorage.clear();
  jwtDecode.mockReset();
});

describe("Pharmacy care setting in the sidebar", () => {
  test("shown after Surgery for an admin when the organization has POWER Pharmacy", () => {
    signIn("admin", ["clinical_documentation", "surgery", "pharmacy"]);
    render(<CareSettingSidebar onChange={() => {}} />);
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")).filter((n) => n && n.length > 5 && !/sidebar/i.test(n));
    expect(names).toEqual(["Ambulatory Care", "Emergency Care", "Acute Care", "Surgery", "Pharmacy"]);
  });

  test("hidden without the module", () => {
    signIn("admin", ["clinical_documentation", "surgery"]);
    render(<CareSettingSidebar onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Pharmacy" })).toBeNull();
  });

  test("hidden for roles that do not work in pharmacy", () => {
    for (const role of ["doctor", "nurse", "registrar"]) {
      signIn(role, ["clinical_documentation", "pharmacy"]);
      expect(availableCareSettings().map((c) => c.key)).not.toContain("pharmacy");
    }
  });

  test("pharmacists and pharmacy assistants see Pharmacy only, and land on it", () => {
    for (const role of ["pharmacist", "pharmacy_tech"]) {
      signIn(role, ["clinical_documentation", "pharmacy"]);
      expect(availableCareSettings().map((c) => c.key)).toEqual(["pharmacy"]);
      expect(storedCareSetting()).toBe("pharmacy");
    }
  });

  test("a never-configured organization (all modules on) offers Pharmacy to an admin", () => {
    signIn("admin", null);
    expect(availableCareSettings().map((c) => c.key)).toContain("pharmacy");
  });
});

describe("Pharmacy chart tabs", () => {
  test("the Pharmacy care setting has its own tabs, in order", () => {
    expect(visibleChartTabs("pharmacist", null, "pharmacy").map((t) => t.label)).toEqual([
      "Patient List", "Verification Queue", "Outpatient Rx", "eRx Routing", "Med Profile", "Formulary", "Orders", "Prescriptions", "Results", "Patient Info",
    ]);
    // the clinic's tab layout for the other care settings does not apply here
    expect(visibleChartTabs("admin", ["patient_list", "documents"], "pharmacy").map((t) => t.value)).toContain("verification_queue");
  });

  test("the Pharmacy tabs never show in the other care settings", () => {
    for (const care of [null, "ambulatory", "emergency", "acute", "surgery"]) {
      const keys = visibleChartTabs("admin", null, care).map((t) => t.value);
      expect(keys).not.toContain("verification_queue");
      expect(keys).not.toContain("med_profile");
    }
  });

  test("Verification Queue badge: warning colour while within goal, red when any order is past goal", () => {
    const { rerender } = render(
      <PatientChartTabs value="patient_list" onChange={() => {}} role="pharmacist" careSetting="pharmacy" badges={{ verification_queue: 4 }} badgeOverdue={{ verification_queue: 0 }} />
    );
    const badge = screen.getByTestId("chart-tab-badge-verification_queue");
    expect(badge).toHaveTextContent("4");
    expect(badge.getAttribute("aria-label")).toBe("4 need review");
    rerender(
      <PatientChartTabs value="patient_list" onChange={() => {}} role="pharmacist" careSetting="pharmacy" badges={{ verification_queue: 4 }} badgeOverdue={{ verification_queue: 2 }} />
    );
    expect(screen.getByTestId("chart-tab-badge-verification_queue").getAttribute("aria-label")).toBe("4 need review, 2 overdue");
  });

  test("no badge when nothing is waiting", () => {
    render(<PatientChartTabs value="patient_list" onChange={() => {}} role="pharmacist" careSetting="pharmacy" badges={{ verification_queue: 0 }} />);
    expect(screen.queryByTestId("chart-tab-badge-verification_queue")).toBeNull();
  });
});
