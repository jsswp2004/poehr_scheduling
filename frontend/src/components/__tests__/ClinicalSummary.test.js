import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      clinicalSummary: "/summary/",
      problemList: "/problems/",
      problemEntry: (id) => `/problems/${id}/`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({}), { virtual: true });
let mockRole = "doctor";
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: mockRole, user_id: 5 }) }));
jest.mock(
  "../IcdCodePicker",
  () => ({
    __esModule: true,
    default: ({ onChange, value }) => (
      <button type="button" data-testid="icd-pick" data-value={JSON.stringify(value)} onClick={() => onChange([{ code: "I10", description: "Essential hypertension" }])}>
        pick
      </button>
    ),
  }),
  { virtual: true }
);

import { api } from "../../api/client";
import ClinicalSummary from "../clinicalSummary/ClinicalSummary";
import FishbonePanels, { BmpFishbone, CbcFishbone, OtherLabs, cellDescription, flagMark } from "../clinicalSummary/Fishbone";
import Sparkline from "../clinicalSummary/Sparkline";

const PATIENT = { id: 3, name: "Bcs, Test" };
const NOW = "2026-10-09T12:00:00Z";

const cell = (key, label, value, extra = {}) =>
  value === null
    ? { key, label, value: null }
    : { key, label, value, units: "", reference: "", flag: "", critical: false, at: NOW, report: 1, report_title: "Panel", previous: null, trend: "", ...extra };

const BMP = {
  key: "bmp", title: "BMP", at: NOW,
  cells: [
    cell("na", "Na", "133", { flag: "L", units: "mmol/L", reference: "135-145", previous: { value: "141", at: NOW }, trend: "down" }),
    cell("k", "K", "6.8", { flag: "HH", critical: true }),
    cell("cl", "Cl", "104"), cell("co2", "CO2", "24"), cell("bun", "BUN", "30", { flag: "H" }), cell("cr", "Cr", null), cell("glu", "Glu", "98"),
  ],
};
const CBC = { key: "cbc", title: "CBC", at: NOW, cells: [cell("wbc", "WBC", "7.1"), cell("hgb", "Hgb", "9", { flag: "L" }), cell("hct", "Hct", null), cell("plt", "Plt", "250")] };
const OTHER = { key: "other", title: "Other labs", at: NOW, cells: [cell("ca", "Ca", "8.9"), cell("mg", "Mg", null), cell("a1c", "A1c", "9.1", { flag: "H" })] };

const SUMMARY = (over = {}) => ({
  patient: 3, generated_at: NOW,
  header: {
    name: "Bcs, Test", mrn: "M123", age: "43 y", sex: "Male", location: "Riverside Clinic", attending: "Dr. Jeffrey Lee", care_setting: "Ambulatory",
    allergies: { text: "Penicillin (Rash, severe)", emphasis: "alert", items: [{ substance: "Penicillin", reaction: "Rash", severity: "severe" }] },
  },
  problems: {
    items: [
      { id: 11, description: "Type 2 diabetes", code: "E11.9", status: "active", status_label: "Active", onset_date: "2020-01-05", note: "" },
      { id: 12, description: "Hypertension", code: "I10", status: "chronic", status_label: "Chronic", onset_date: null, note: "" },
    ],
    resolved_count: 1, history_text: "Appendectomy 2010",
    other_sources: [{ code: "R07.9", description: "Chest pain", source: "Referral" }],
  },
  medications: {
    home: [{ id: 21, drug_name: "Lisinopril", strength: "10 mg", sig: "Take 1 tablet by mouth once daily.", source: "patient", last_taken: null, allergy_alerts: 0 },
      { id: 22, drug_name: "Amoxicillin", strength: "", sig: "Take 1 capsule.", source: "patient", last_taken: null, allergy_alerts: 1 }],
    home_count: 2,
    prescriptions: [{ id: 31, drug_name: "Metformin", strength: "500 mg", sig: "Take 1 tablet twice daily.", status: "signed", runs_out_at: NOW, renewal_due: true }],
    prescription_count: 1, renewals_due: 1, drafts: 2,
    last_review: null, needs_reconciliation: true,
  },
  results: {
    hidden: false, unreviewed: 2,
    recent: [{ id: 41, title: "BMP", status: "final", review_status: "unreviewed", at: NOW, abnormal: 3, critical: 1 },
      { id: 42, title: "CBC", status: "final", review_status: "reviewed", at: NOW, abnormal: 1, critical: 0 }],
    fishbone: [BMP, CBC, OTHER],
  },
  vitals: {
    latest: {
      hr: { value: 88, unit: "bpm", at: NOW }, sbp: { value: 128, unit: "mmHg", at: NOW }, dbp: { value: 82, unit: "mmHg", at: NOW },
      temp: { value: 98.6, unit: "°F", at: NOW },
    },
    series: { hr: [{ at: NOW, value: 80 }, { at: NOW, value: 88 }], sbp: [{ at: NOW, value: 120 }, { at: NOW, value: 128 }] },
  },
  orders: { count: 2, awaiting_cosign: 1, items: [{ id: 51, name: "CBC", category: "laboratory", status: "active", status_label: "Active", priority: "stat", at: NOW },
    { id: 52, name: "Chest x-ray", category: "imaging", status: "pending_cosign", status_label: "Pending cosign", priority: "routine", at: NOW }] },
  tasks: { count: 2, overdue: 1, items: [{ id: 61, title: "Give dose", due_at: NOW, overdue: true, prn: false }, { id: 62, title: "PRN pain", due_at: NOW, overdue: false, prn: true }] },
  notes_referrals: {
    notes: [{ id: 71, type: "Doctor Assessment", documentation_type: "", status: "signed", author: "Jeffrey Lee", at: NOW }],
    referrals: [{ id: 81, specialty: "Cardiology", destination: "", status: "sent", status_label: "Sent", urgency: "urgent" }],
  },
  upcoming: { items: [{ id: 91, title: "Follow-up", at: NOW, status: "scheduled", provider: "Jeffrey Lee" }, { id: 92, title: "Request", at: NOW, status: "pending", provider: "" }] },
  ...over,
});

let summary;
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "doctor";
  summary = SUMMARY();
  window.print = jest.fn();
  api.get.mockImplementation(async (url, opts) => {
    if (url === "/summary/") return { data: summary };
    if (url === "/problems/") return { data: { results: [{ id: 13, description: "Old fracture", code: "S52.50", status: "resolved", resolved_date: "2024-03-02" }] } };
    throw new Error(`unexpected GET ${url}`);
  });
  api.post.mockResolvedValue({ data: { id: 99 } });
  api.patch.mockResolvedValue({ data: { id: 11 } });
});

const open = async (props = {}) => {
  const view = render(<ClinicalSummary patient={PATIENT} {...props} />);
  await screen.findByTestId("cs-body");
  return view;
};

describe("fishbone diagrams", () => {
  test("flag marks: an arrow, doubled up with ‼ when critical", () => {
    expect(flagMark("")).toBe("");
    expect(flagMark("H")).toBe("↑");
    expect(flagMark("L")).toBe("↓");
    expect(flagMark("HH")).toBe("↑‼");
    expect(flagMark("LL")).toBe("↓‼");
    expect(flagMark("A")).toBe("!");
  });

  test("a value is described in words with its range, time and the value before it", () => {
    const text = cellDescription(BMP.cells[0]);
    expect(text).toContain("Na 133 mmol/L");
    expect(text).toContain("low");
    expect(text).toContain("reference 135-145");
    expect(text).toContain("down from 141");
    expect(cellDescription(BMP.cells[5])).toBe("Cr: no result");
  });

  test("the BMP draws every value in its place, with flags and a dash for a missing one", () => {
    render(<BmpFishbone panel={BMP} />);
    expect(screen.getByTestId("fish-na")).toHaveTextContent("133↓");
    expect(screen.getByTestId("fish-k")).toHaveTextContent("6.8↑‼");
    expect(screen.getByTestId("fish-bun")).toHaveTextContent("30↑");
    expect(screen.getByTestId("fish-cl")).toHaveTextContent("104");
    expect(screen.getByTestId("fish-cl")).not.toHaveTextContent("↑");
    expect(screen.getByTestId("fish-cr")).toHaveTextContent("–");
    expect(screen.getByTestId("fish-glu")).toHaveTextContent("98");
    expect(screen.getByRole("img", { name: /Na 133 mmol\/L/ })).toBeInTheDocument();
  });

  test("the CBC draws WBC, Hgb, Hct and platelets", () => {
    render(<CbcFishbone panel={CBC} />);
    expect(screen.getByTestId("fish-wbc")).toHaveTextContent("7.1");
    expect(screen.getByTestId("fish-hgb")).toHaveTextContent("9↓");
    expect(screen.getByTestId("fish-hct")).toHaveTextContent("–");
    expect(screen.getByTestId("fish-plt")).toHaveTextContent("250");
  });

  test("other labs are chips, and a lab with no result is left out", () => {
    render(<OtherLabs panel={OTHER} />);
    expect(screen.getByTestId("fish-ca")).toHaveTextContent("Ca 8.9");
    expect(screen.getByTestId("fish-a1c")).toHaveTextContent("A1c 9.1↑");
    expect(screen.queryByTestId("fish-mg")).not.toBeInTheDocument();
  });

  test("panels show their title and collection time; none means nothing is drawn", () => {
    const { container, rerender } = render(<FishbonePanels panels={[BMP, CBC]} />);
    expect(screen.getByTestId("panel-bmp")).toHaveTextContent("BMP");
    expect(screen.getByTestId("panel-cbc")).toHaveTextContent("CBC");
    expect(screen.queryByTestId("panel-other")).not.toBeInTheDocument();
    rerender(<FishbonePanels panels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("sparkline", () => {
  test("draws a line for two or more readings and nothing for fewer", () => {
    const { rerender } = render(<Sparkline points={[{ value: 1 }, { value: 3 }, { value: 2 }]} label="HR trend" />);
    expect(screen.getByRole("img", { name: "HR trend" })).toBeInTheDocument();
    rerender(<Sparkline points={[{ value: 1 }]} />);
    expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
    rerender(<Sparkline points={[]} />);
    expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
  });

  test("a flat line does not divide by zero", () => {
    render(<Sparkline points={[{ value: 5 }, { value: 5 }]} />);
    expect(screen.getByTestId("sparkline").innerHTML).not.toContain("NaN");
  });
});

describe("the summary screen", () => {
  test("loads once for the patient and shows every card", async () => {
    await open();
    expect(api.get).toHaveBeenCalledWith("/summary/", expect.objectContaining({ params: { patient: 3 } }));
    expect(screen.getByTestId("cs-header")).toHaveTextContent("Bcs, Test");
    expect(screen.getByTestId("cs-header-line")).toHaveTextContent("43 y · Male");
    expect(screen.getByTestId("cs-header-line")).toHaveTextContent("Attending Dr. Jeffrey Lee");
    expect(screen.getByTestId("cs-allergies")).toHaveTextContent("Penicillin · Rash · severe");
    for (const id of ["cs-problems", "cs-meds", "cs-results", "cs-vitals", "cs-orders", "cs-notes", "cs-upcoming"]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  test("allergy chip when none are recorded says what the chart says", async () => {
    summary = SUMMARY({ header: { ...SUMMARY().header, allergies: { text: "No known allergies", emphasis: "none", items: [] } } });
    await open();
    expect(screen.getByTestId("cs-allergies")).toHaveTextContent("No known allergies");
  });

  test("problems: the list, the history text, and diagnoses seen elsewhere", async () => {
    await open();
    expect(screen.getByTestId("problem-11")).toHaveTextContent("Type 2 diabetes");
    expect(screen.getByTestId("problem-11")).toHaveTextContent("E11.9");
    expect(screen.getByTestId("problem-11")).toHaveTextContent("since");
    expect(screen.getByTestId("problem-12")).toHaveTextContent("Chronic");
    expect(screen.getByTestId("cs-history")).toHaveTextContent("Appendectomy 2010");
    expect(screen.getByTestId("other-dx-R07.9")).toHaveTextContent("R07.9 · Referral");
  });

  test("medications: reconciliation and renewal warnings, allergy alert, never reconciled", async () => {
    await open();
    expect(screen.getByTestId("cs-reconcile")).toBeInTheDocument();
    expect(screen.getByTestId("cs-renewals")).toHaveTextContent("1 due for renewal");
    expect(screen.getByTestId("home-med-21")).toHaveTextContent("Lisinopril 10 mg");
    expect(screen.queryByTestId("home-med-alert-21")).not.toBeInTheDocument();
    expect(screen.getByTestId("home-med-alert-22")).toBeInTheDocument();
    expect(screen.getByTestId("cs-rx-31")).toHaveTextContent("Renewal due");
    expect(screen.getByTestId("cs-meds")).toHaveTextContent("Never reconciled");
    expect(screen.getByTestId("cs-meds")).toHaveTextContent("2 draft prescriptions");
  });

  test("medications: a reconciled list shows who and when, with no warning", async () => {
    summary = SUMMARY({ medications: { ...SUMMARY().medications, needs_reconciliation: false, renewals_due: 0, drafts: 1, last_review: { at: NOW, by: "Nan Nurse" } } });
    await open();
    expect(screen.queryByTestId("cs-reconcile")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cs-renewals")).not.toBeInTheDocument();
    expect(screen.getByTestId("cs-meds")).toHaveTextContent("Last reconciled");
    expect(screen.getByTestId("cs-meds")).toHaveTextContent("by Nan Nurse");
    expect(screen.getByTestId("cs-meds")).toHaveTextContent("1 draft prescription");
    expect(screen.getByTestId("cs-meds")).not.toHaveTextContent("1 draft prescriptions");
  });

  test("results: unreviewed count, the fishbones, and recent reports with critical and abnormal counts", async () => {
    await open();
    expect(screen.getByTestId("cs-unreviewed")).toHaveTextContent("2 not yet reviewed");
    expect(screen.getByTestId("fishbone-bmp")).toBeInTheDocument();
    expect(screen.getByTestId("fishbone-cbc")).toBeInTheDocument();
    expect(screen.getByTestId("other-labs")).toBeInTheDocument();
    expect(screen.getByTestId("cs-report-41")).toHaveTextContent("1 critical");
    expect(screen.getByTestId("cs-report-41")).toHaveTextContent("Not reviewed");
    expect(screen.getByTestId("cs-report-42")).toHaveTextContent("1 abnormal");
    expect(screen.getByTestId("cs-report-42")).not.toHaveTextContent("Not reviewed");
  });

  test("results: no lab values yet", async () => {
    summary = SUMMARY({ results: { hidden: false, unreviewed: 0, recent: [], fishbone: [] } });
    await open();
    expect(screen.getByTestId("cs-results")).toHaveTextContent("No BMP, CBC or other key lab values yet.");
    expect(screen.getByTestId("cs-results")).toHaveTextContent("No lab reports.");
    expect(screen.queryByTestId("cs-unreviewed")).not.toBeInTheDocument();
  });

  test("results: a user without the right is told so", async () => {
    summary = SUMMARY({ results: { hidden: true } });
    await open();
    expect(screen.getByTestId("cs-results")).toHaveTextContent("don't have access to lab results");
  });

  test("vitals: BP combines both numbers; only readings that exist get a tile", async () => {
    await open();
    expect(screen.getByTestId("vital-bp")).toHaveTextContent("128/82");
    expect(screen.getByTestId("vital-hr")).toHaveTextContent("88");
    expect(screen.getByTestId("vital-temp")).toHaveTextContent("98.6");
    expect(screen.queryByTestId("vital-rr")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vital-spo2")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("vital-hr")).getByTestId("sparkline")).toBeInTheDocument();
    expect(within(screen.getByTestId("vital-temp")).queryByTestId("sparkline")).not.toBeInTheDocument(); // one reading: no trend
    expect(screen.getByTestId("cs-vitals-when")).toHaveTextContent("Last taken");
  });

  test("vitals: none recorded", async () => {
    summary = SUMMARY({ vitals: { latest: {}, series: {} } });
    await open();
    expect(screen.getByTestId("cs-vitals")).toHaveTextContent("No vital signs recorded.");
    expect(screen.queryByTestId("cs-vitals-when")).not.toBeInTheDocument();
  });

  test("a BP with only one number gets no BP tile", async () => {
    summary = SUMMARY({ vitals: { latest: { sbp: { value: 120, unit: "mmHg", at: NOW } }, series: {} } });
    await open();
    expect(screen.queryByTestId("vital-bp")).not.toBeInTheDocument();
  });

  test("orders and tasks: cosign and overdue are called out, PRN is not overdue", async () => {
    await open();
    expect(screen.getByTestId("cs-cosign")).toHaveTextContent("1 awaiting cosign");
    expect(screen.getByTestId("cs-order-51")).toHaveTextContent("CBC");
    expect(screen.getByTestId("cs-order-51")).toHaveTextContent("stat");
    expect(screen.getByTestId("cs-order-52")).not.toHaveTextContent("routine");
    expect(screen.getByTestId("cs-overdue")).toHaveTextContent("1 overdue");
    expect(screen.getByTestId("cs-task-62")).toHaveTextContent("as needed");
  });

  test("orders hidden without the right, tasks still shown", async () => {
    summary = SUMMARY({ orders: null });
    await open();
    expect(screen.getByTestId("cs-orders")).toHaveTextContent("don't have access to orders");
    expect(screen.getByTestId("cs-task-61")).toBeInTheDocument();
  });

  test("notes, referrals and upcoming visits", async () => {
    await open();
    expect(screen.getByTestId("cs-note-71")).toHaveTextContent("Doctor Assessment");
    expect(screen.getByTestId("cs-note-71")).toHaveTextContent("signed · Jeffrey Lee");
    expect(screen.getByTestId("cs-referral-81")).toHaveTextContent("Cardiology");
    expect(screen.getByTestId("cs-referral-81")).toHaveTextContent("urgent");
    expect(screen.getByTestId("cs-appt-91")).toHaveTextContent("Follow-up");
    expect(screen.getByTestId("cs-appt-92")).toHaveTextContent("request pending");
  });

  test("empty cards say so", async () => {
    summary = SUMMARY({
      problems: { items: [], resolved_count: 0, history_text: "", other_sources: [] },
      medications: { home: [], home_count: 0, prescriptions: [], prescription_count: 0, renewals_due: 0, drafts: 0, last_review: null, needs_reconciliation: false },
      orders: { count: 0, awaiting_cosign: 0, items: [] }, tasks: { count: 0, overdue: 0, items: [] },
      notes_referrals: { notes: [], referrals: [] }, upcoming: { items: [] },
    });
    await open();
    expect(screen.getByTestId("cs-problems")).toHaveTextContent("No problems on the list.");
    expect(screen.queryByTestId("problem-resolved-toggle")).not.toBeInTheDocument();
    expect(screen.getByTestId("cs-meds")).toHaveTextContent("None recorded.");
    expect(screen.getByTestId("cs-meds")).toHaveTextContent("No active prescriptions.");
    expect(screen.getByTestId("cs-orders")).toHaveTextContent("No open orders.");
    expect(screen.getByTestId("cs-orders")).toHaveTextContent("Nothing to do.");
    expect(screen.getByTestId("cs-notes")).toHaveTextContent("No notes.");
    expect(screen.getByTestId("cs-notes")).toHaveTextContent("No open referrals.");
    expect(screen.getByTestId("cs-upcoming")).toHaveTextContent("None scheduled.");
  });

  test("each card's link opens the tab where that work is done", async () => {
    const onOpenTab = jest.fn();
    await open({ onOpenTab });
    fireEvent.click(screen.getByTestId("cs-meds-link"));
    fireEvent.click(screen.getByTestId("cs-results-link"));
    fireEvent.click(screen.getByTestId("cs-vitals-link"));
    fireEvent.click(screen.getByTestId("cs-notes-link"));
    fireEvent.click(within(screen.getByTestId("cs-orders")).getByText("Open Orders"));
    fireEvent.click(within(screen.getByTestId("cs-orders")).getByText("Open Task List"));
    fireEvent.click(within(screen.getByTestId("cs-notes")).getByText("Open Referral List"));
    expect(onOpenTab.mock.calls.map((c) => c[0])).toEqual(["prescriptions", "results", "flowsheets", "documents", "orders", "task_list", "referral_list"]);
  });

  test("links do nothing harmful when no handler is given", async () => {
    await open();
    fireEvent.click(screen.getByTestId("cs-meds-link"));
    expect(screen.getByTestId("cs-meds")).toBeInTheDocument();
  });

  test("a card that failed says so and the rest still show", async () => {
    summary = SUMMARY({ vitals: { error: "Could not load this section." }, orders: { error: "x" }, tasks: { error: "x" } });
    await open();
    expect(screen.getByTestId("cs-vitals-error")).toHaveTextContent("Could not load this section.");
    expect(screen.getByTestId("cs-orders-error")).toBeInTheDocument();
    expect(screen.getByTestId("problem-11")).toBeInTheDocument();
    expect(screen.getByTestId("cs-header")).toBeInTheDocument();
  });

  test("a failed header does not stop the page", async () => {
    summary = SUMMARY({ header: { error: "x" } });
    await open();
    expect(screen.queryByTestId("cs-header")).not.toBeInTheDocument();
    expect(screen.getByTestId("problem-11")).toBeInTheDocument();
  });

  test("if the whole summary fails to load there is a message and Try again", async () => {
    api.get.mockRejectedValueOnce({ response: { data: { detail: "Patient not found." } } });
    render(<ClinicalSummary patient={PATIENT} />);
    expect(await screen.findByTestId("cs-load-error")).toHaveTextContent("Patient not found.");
    fireEvent.click(screen.getByText("Try again"));
    await screen.findByTestId("cs-body");
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  test("Refresh loads again; Print asks the browser to print", async () => {
    await open();
    fireEvent.click(screen.getByTestId("cs-refresh"));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByTestId("cs-print"));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  test("the printable block is its own element so print can show only it", async () => {
    await open();
    const body = screen.getByTestId("cs-body");
    expect(body.id).toBe("clinical-summary-print");
    expect(body).toContainElement(screen.getByTestId("cs-problems"));
  });
});

describe("the problem list", () => {
  test("add a problem: the picker fills the code and the wording, then it is saved and the page reloads", async () => {
    await open();
    fireEvent.click(screen.getByTestId("problem-add"));
    expect(screen.getByTestId("problem-save")).toBeDisabled(); // nothing to save yet
    fireEvent.click(screen.getByTestId("icd-pick"));
    expect(screen.getByTestId("problem-description").value).toBe("Essential hypertension");
    fireEvent.change(screen.getByTestId("problem-note"), { target: { value: "  new this year " } });
    fireEvent.click(screen.getByTestId("problem-save"));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][0]).toBe("/problems/");
    expect(api.post.mock.calls[0][1]).toEqual({
      patient: 3, description: "Essential hypertension", code: "I10", status: "active", onset_date: null, note: "new this year",
    });
    await waitFor(() => expect(api.get.mock.calls.filter((c) => c[0] === "/summary/").length).toBe(2));
    await waitFor(() => expect(screen.queryByTestId("problem-dialog")).not.toBeInTheDocument());
  });

  test("a typed wording is kept when a code is picked", async () => {
    await open();
    fireEvent.click(screen.getByTestId("problem-add"));
    fireEvent.change(screen.getByTestId("problem-description"), { target: { value: "High blood pressure" } });
    fireEvent.click(screen.getByTestId("icd-pick"));
    expect(screen.getByTestId("problem-description").value).toBe("High blood pressure");
  });

  test("a diagnosis seen elsewhere opens the form already filled in", async () => {
    await open();
    fireEvent.click(screen.getByTestId("other-dx-R07.9"));
    expect(screen.getByTestId("problem-description").value).toBe("Chest pain");
    expect(JSON.parse(screen.getByTestId("icd-pick").dataset.value)).toEqual([{ code: "R07.9", description: "" }]);
  });

  test("a server message (the code is already listed) stays in the dialog", async () => {
    api.post.mockRejectedValueOnce({ response: { data: { detail: "E11.9 is already on the problem list." } } });
    await open();
    fireEvent.click(screen.getByTestId("problem-add"));
    fireEvent.change(screen.getByTestId("problem-description"), { target: { value: "Diabetes" } });
    fireEvent.click(screen.getByTestId("problem-save"));
    expect(await screen.findByTestId("problem-error")).toHaveTextContent("already on the problem list");
    expect(screen.getByTestId("problem-dialog")).toBeInTheDocument();
  });

  test("edit: the form opens with the problem, and Save sends the changes", async () => {
    await open();
    fireEvent.click(screen.getByText("Type 2 diabetes"));
    expect(screen.getByTestId("problem-description").value).toBe("Type 2 diabetes");
    expect(screen.getByTestId("problem-onset").value).toBe("2020-01-05");
    fireEvent.change(screen.getByTestId("problem-status"), { target: { value: "chronic" } });
    fireEvent.click(screen.getByTestId("problem-save"));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(api.patch.mock.calls[0][0]).toBe("/problems/11/");
    expect(api.patch.mock.calls[0][1]).toEqual({ description: "Type 2 diabetes", code: "E11.9", status: "chronic", onset_date: "2020-01-05", note: "" });
  });

  test("entered in error takes two clicks and keeps the rest of the screen as it was", async () => {
    await open();
    fireEvent.click(screen.getByText("Hypertension"));
    expect(screen.queryByTestId("problem-error-confirm")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("problem-error-start"));
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("problem-error-confirm"));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/problems/12/", { status: "entered_in_error" }, expect.anything()));
  });

  test("entered in error can be backed out of", async () => {
    await open();
    fireEvent.click(screen.getByText("Hypertension"));
    fireEvent.click(screen.getByTestId("problem-error-start"));
    fireEvent.click(screen.getByText("Keep it"));
    expect(screen.getByTestId("problem-error-start")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  test("an adding dialog has no entered-in-error button", async () => {
    await open();
    fireEvent.click(screen.getByTestId("problem-add"));
    expect(screen.queryByTestId("problem-error-start")).not.toBeInTheDocument();
  });

  test("Cancel closes the dialog without saving", async () => {
    await open();
    fireEvent.click(screen.getByTestId("problem-add"));
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByTestId("problem-dialog")).not.toBeInTheDocument());
    expect(api.post).not.toHaveBeenCalled();
  });

  test("resolved problems load only when asked for", async () => {
    await open();
    expect(api.get.mock.calls.filter((c) => c[0] === "/problems/")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("problem-resolved-toggle"));
    expect(await screen.findByTestId("resolved-13")).toHaveTextContent("Old fracture (S52.50)");
    expect(api.get).toHaveBeenCalledWith("/problems/", expect.objectContaining({ params: { patient: 3, show: "resolved" } }));
    fireEvent.click(screen.getByTestId("problem-resolved-toggle"));
    expect(screen.queryByTestId("resolved-13")).not.toBeInTheDocument();
  });

  test("a registrar cannot edit: no Add button, problems are not clickable", async () => {
    mockRole = "registrar";
    await open();
    await waitFor(() => expect(screen.queryByTestId("problem-add")).not.toBeInTheDocument());
    expect(screen.queryByTestId("other-dx-R07.9")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("other-dx-R07.9"));
    expect(screen.queryByTestId("problem-dialog")).not.toBeInTheDocument();
  });
});
