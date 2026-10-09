import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      prescriptions: "/rx/",
      prescription: (id) => `/rx/${id}/`,
      prescriptionAction: (id) => `/rx/${id}/action/`,
      prescriptionPdf: (id) => `/rx/${id}/pdf/`,
      prescriptionMeta: "/rx-meta/",
      prescriptionDrugs: "/rx-drugs/",
      pharmacies: "/pharmacies/",
      patientPharmacy: (id) => `/patient-pharmacy/${id}/`,
      prescriberProfile: "/prescriber-profile/",
      homeMedications: "/home/",
      homeMedication: (id) => `/home/${id}/`,
      homeMedicationAction: (id) => `/home/${id}/action/`,
      homeMedicationReview: "/home/review/",
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });
let mockRole = "nurse";
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: mockRole, user_id: 5 }) }));
jest.mock("../IcdCodePicker", () => ({ __esModule: true, default: () => null, dxLabel: (d) => `${d.code} - ${d.description}` }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import PrescriptionsPanel from "../prescriptions/PrescriptionsPanel";
import HomeMedsPanel from "../prescriptions/HomeMedsPanel";

const OPTIONS = {
  frequencies: [{ value: "daily", label: "Once a day" }, { value: "bid", label: "Twice a day (BID)" }],
  routes: ["PO", "Topical"],
  forms: ["tablet", "capsule"],
  sources: [{ value: "patient", label: "Patient" }, { value: "outside", label: "Outside records" }, { value: "our_rx", label: "Our prescription" }],
};
const META = {
  frequencies: OPTIONS.frequencies, routes: OPTIONS.routes, forms: OPTIONS.forms, max_refills: 11,
  doctors: [{ id: 5, name: "Dr Who", ready: true }], controlled_message: "Controlled substances can't be written here.",
};
const MED = (over = {}) => ({
  id: 21, patient: 3, drug_name: "Lisinopril", code_system: "", code: "", strength: "10 mg", form: "tablet", dose: "1 tablet", route: "PO",
  frequency: "daily", frequency_label: "Once a day", prn: false, prn_reason: "", sig_extra: "", sig: "Take 1 tablet by mouth once daily.",
  indication_text: "Blood pressure", source: "patient", source_label: "Patient", outside_prescriber: "", last_taken: "2026-10-07",
  status: "active", stopped_at: null, stopped_by_name: "", stop_reason: "", from_prescription: null, reviewed_at: null, reviewed_by_name: "",
  controlled: false, allergy_alerts: [], ...over,
});
let meds;
let lastReview;

beforeEach(() => {
  mockRole = "nurse";
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.values(toast).forEach((fn) => fn.mockReset());
  meds = [MED()];
  lastReview = null;
  api.get.mockImplementation((url, cfg) => {
    if (url === "/home/") {
      const want = cfg?.params?.status || "active";
      const rows = meds.filter((m) => m.status === want);
      return Promise.resolve({ data: { results: rows, counts: { active: meds.filter((m) => m.status === "active").length, stopped: meds.filter((m) => m.status === "stopped").length }, last_review: lastReview, options: OPTIONS } });
    }
    if (url === "/rx-meta/") return Promise.resolve({ data: META });
    if (url === "/rx/") return Promise.resolve({ data: { count: 0, results: [] } });
    if (url === "/pharmacies/") return Promise.resolve({ data: { results: [] } });
    if (url === "/patient-pharmacy/3/") return Promise.resolve({ data: { pharmacy: null } });
    if (url === "/rx-drugs/") return Promise.resolve({ data: { results: [{ display: "Metformin", system: "rxnorm", code: "6809", controlled: false }, { display: "Oxycodone", system: "rxnorm", code: "7804", controlled: true }] } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
});

const ME = { role: "nurse", id: 8 };
const PATIENT = { id: 3, name: "Ann Lee" };
const type = (testid, value) => fireEvent.change(screen.getByTestId(testid), { target: { value } });
const choose = async (label, option) => {
  fireEvent.mouseDown(screen.getByLabelText(label));
  fireEvent.click(await screen.findByRole("option", { name: option }));
};

test("lists what the patient takes, with directions, source and the last-taken date", async () => {
  render(<HomeMedsPanel patient={PATIENT} me={ME} />);
  const row = await screen.findByTestId("home-med-row-21");
  expect(row).toHaveTextContent("Lisinopril 10 mg tablet");
  expect(row).toHaveTextContent("Take 1 tablet by mouth once daily.");
  expect(row).toHaveTextContent("Patient");
  expect(row).toHaveTextContent("For Blood pressure");
  expect(screen.getByTestId("home-med-last-review")).toHaveTextContent("This list has not been confirmed yet.");
  expect(api.get.mock.calls[0][1].params).toEqual({ patient: 3, status: "active" });
});

test("shows when and by whom the list was last confirmed", async () => {
  lastReview = { by: "Dr Who", at: "2026-10-08T15:00:00Z", note: "Checked with daughter" };
  render(<HomeMedsPanel patient={PATIENT} me={ME} />);
  await screen.findByTestId("home-med-row-21");
  expect(screen.getByTestId("home-med-last-review")).toHaveTextContent("List confirmed by Dr Who");
  expect(screen.getByTestId("home-med-last-review")).toHaveTextContent("Checked with daughter");
});

test("flags controlled medicines and allergy alerts, and won't prescribe a controlled one", async () => {
  meds = [MED({ id: 22, drug_name: "Oxycodone", controlled: true }), MED({ id: 23, drug_name: "Amoxicillin", allergy_alerts: ["Allergy to penicillins."] })];
  render(<HomeMedsPanel patient={PATIENT} me={ME} />);
  await screen.findByTestId("home-med-row-22");
  expect(screen.getByTestId("home-med-row-22")).toHaveTextContent("Controlled");
  expect(screen.getByTestId("home-med-prescribe-22")).toBeDisabled();
  expect(screen.getByTestId("home-med-allergy-23")).toBeInTheDocument();
  expect(screen.getByTestId("home-med-prescribe-23")).not.toBeDisabled();
});

test("adding a medicine picks from the drug search and posts the patient and details", async () => {
  render(<HomeMedsPanel patient={PATIENT} me={ME} />);
  await screen.findByTestId("home-med-row-21");
  fireEvent.click(screen.getByTestId("home-med-add"));
  const drug = await screen.findByTestId("home-med-drug");
  fireEvent.change(drug, { target: { value: "metf" } });
  fireEvent.keyDown(drug, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: /Metformin/ }));
  type("home-med-strength", "500 mg");
  type("home-med-dose", "1 tablet");
  await choose("How often", "Twice a day (BID)");
  await choose("Reported by", "Outside records");
  type("home-med-outside", "Dr Smith, cardiology");
  api.post.mockResolvedValue({ data: MED({ id: 30, drug_name: "Metformin" }) });
  fireEvent.click(screen.getByTestId("home-med-save"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const [url, body] = api.post.mock.calls[0];
  expect(url).toBe("/home/");
  expect(body).toMatchObject({ patient: 3, drug_name: "Metformin", code: "6809", strength: "500 mg", dose: "1 tablet", frequency: "bid", source: "outside", outside_prescriber: "Dr Smith, cardiology" });
  await waitFor(() => expect(toast.success).toHaveBeenCalled());
});

test("a controlled medicine can be recorded as a home medication", async () => {
  render(<HomeMedsPanel patient={PATIENT} me={ME} />);
  await screen.findByTestId("home-med-row-21");
  fireEvent.click(screen.getByTestId("home-med-add"));
  const drug = await screen.findByTestId("home-med-drug");
  fireEvent.change(drug, { target: { value: "oxyc" } });
  fireEvent.keyDown(drug, { key: "ArrowDown" });
  const option = await screen.findByRole("option", { name: /Oxycodone/ });
  expect(option).not.toHaveAttribute("aria-disabled", "true");
  fireEvent.click(option);
  api.post.mockResolvedValue({ data: MED({ id: 31, drug_name: "Oxycodone", controlled: true }) });
  fireEvent.click(screen.getByTestId("home-med-save"));
  await waitFor(() => expect(api.post.mock.calls[0][1].drug_name).toBe("Oxycodone"));
});

test("the server's refusal (already on the list) is shown in the form", async () => {
  render(<HomeMedsPanel patient={PATIENT} me={ME} />);
  await screen.findByTestId("home-med-row-21");
  fireEvent.click(screen.getByTestId("home-med-add"));
  fireEvent.change(await screen.findByTestId("home-med-drug"), { target: { value: "Lisinopril" } });
  api.post.mockRejectedValue({ response: { data: { detail: "Lisinopril is already on this patient's home list." } } });
  fireEvent.click(screen.getByTestId("home-med-save"));
  expect(await screen.findByTestId("home-med-error")).toHaveTextContent("already on this patient's home list");
});

test("editing sends only a PATCH for that medicine", async () => {
  render(<HomeMedsPanel patient={PATIENT} me={ME} />);
  fireEvent.click(await screen.findByTestId("home-med-edit-21"));
  expect(await screen.findByTestId("home-med-strength")).toHaveValue("10 mg");
  type("home-med-strength", "20 mg");
  api.patch.mockResolvedValue({ data: MED({ strength: "20 mg" }) });
  fireEvent.click(screen.getByTestId("home-med-save"));
  await waitFor(() => expect(api.patch).toHaveBeenCalled());
  expect(api.patch.mock.calls[0][0]).toBe("/home/21/");
  expect(api.patch.mock.calls[0][1].strength).toBe("20 mg");
  expect(api.post).not.toHaveBeenCalled();
});

test("stopping needs a reason, then moves the medicine to Stopped", async () => {
  render(<HomeMedsPanel patient={PATIENT} me={ME} />);
  fireEvent.click(await screen.findByTestId("home-med-stop-21"));
  const confirm = await screen.findByTestId("home-med-stop-dialog-confirm");
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByTestId("home-med-stop-dialog-text"), { target: { value: "Dry cough" } });
  api.post.mockImplementation(() => {
    meds = [MED({ status: "stopped", stop_reason: "Dry cough", stopped_at: "2026-10-09T10:00:00Z" })];
    return Promise.resolve({ data: meds[0] });
  });
  fireEvent.click(confirm);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/home/21/action/", { action: "stop", reason: "Dry cough" }, expect.anything()));
  await waitFor(() => expect(screen.queryByTestId("home-med-row-21")).not.toBeInTheDocument());
  await choose("Show", /Stopped/);
  const row = await screen.findByTestId("home-med-row-21");
  expect(row).toHaveTextContent("Dry cough");
  api.post.mockImplementation(() => {
    meds = [MED()];
    return Promise.resolve({ data: meds[0] });
  });
  fireEvent.click(screen.getByTestId("home-med-resume-21"));
  await waitFor(() => expect(api.post).toHaveBeenLastCalledWith("/home/21/action/", { action: "resume" }, expect.anything()));
});

test("Confirm marks one medicine, and Confirm the list records the reconciliation with a note", async () => {
  render(<HomeMedsPanel patient={PATIENT} me={ME} />);
  fireEvent.click(await screen.findByTestId("home-med-confirm-21"));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/home/21/action/", { action: "confirm" }, expect.anything()));
  api.post.mockReset();
  api.post.mockResolvedValue({ data: {} });
  fireEvent.click(screen.getByTestId("home-med-review"));
  fireEvent.change(await screen.findByTestId("home-med-review-dialog-text"), { target: { value: "Checked with patient" } });
  fireEvent.click(screen.getByTestId("home-med-review-dialog-confirm"));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/home/review/", { patient: 3, note: "Checked with patient" }, expect.anything()));
});

test("Prescribe opens the writer already filled in from the home medication", async () => {
  mockRole = "doctor";
  render(<PrescriptionsPanel patient={PATIENT} />);
  fireEvent.click(await screen.findByTestId("rx-view-home"));
  fireEvent.click(await screen.findByTestId("home-med-prescribe-21"));
  expect(await screen.findByText(/New prescription — Ann Lee/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId("rx-strength")).toHaveValue("10 mg"));
  expect(screen.getByTestId("rx-dose")).toHaveValue("1 tablet");
  expect(screen.getByTestId("rx-drug")).toHaveValue("Lisinopril");
  expect(screen.getByTestId("rx-sig-preview")).toHaveTextContent("Take 1 tablet by mouth once daily.");
  // amounts are the prescriber's to fill in
  expect(screen.getByTestId("rx-quantity")).toHaveValue("");
});

test("the Prescriptions tab keeps its list, and a registrar-like role sees no editing buttons", async () => {
  render(<HomeMedsPanel patient={PATIENT} me={{ role: "registrar", id: 9 }} />);
  await screen.findByTestId("home-med-row-21");
  expect(screen.queryByTestId("home-med-add")).not.toBeInTheDocument();
  expect(screen.queryByTestId("home-med-stop-21")).not.toBeInTheDocument();
});

test("an empty list says so, and a failed load shows the message", async () => {
  meds = [];
  const { unmount } = render(<HomeMedsPanel patient={PATIENT} me={ME} />);
  expect(await screen.findByTestId("home-med-empty")).toHaveTextContent("No home medications on the list.");
  unmount();
  api.get.mockRejectedValue({ response: { status: 500, data: { detail: "Server hiccup." } } });
  render(<HomeMedsPanel patient={PATIENT} me={ME} />);
  expect(await screen.findByTestId("home-med-list-error")).toHaveTextContent("Server hiccup.");
});
