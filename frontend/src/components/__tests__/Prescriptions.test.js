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
      pharmacy: (id) => `/pharmacies/${id}/`,
      patientPharmacy: (id) => `/patient-pharmacy/${id}/`,
      prescriberProfile: "/prescriber-profile/",
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });
let mockRole = "doctor";
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: mockRole, user_id: 5 }) }));
jest.mock("../IcdCodePicker", () => ({ __esModule: true, default: () => null, dxLabel: (d) => `${d.code} - ${d.description}` }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import PrescriptionsPanel from "../prescriptions/PrescriptionsPanel";
import PrescriptionDetailDialog from "../prescriptions/PrescriptionDetailDialog";
import PrescriptionFormDialog from "../prescriptions/PrescriptionFormDialog";
import PrescriberProfileDialog from "../prescriptions/PrescriberProfileDialog";
import PharmacyDialog from "../prescriptions/PharmacyDialog";
import { buildSig } from "../prescriptions/rxShared";
import { CHART_TABS, visibleChartTabs } from "../patients/PatientChartTabs";

const META = {
  frequencies: [{ value: "bid", label: "Twice a day (BID)" }, { value: "tid", label: "Three times a day (TID)" }, { value: "prn", label: "As needed (PRN)" }],
  routes: ["PO", "Topical"],
  forms: ["tablet", "capsule"],
  doctors: [{ id: 5, name: "Dr Who", ready: true }, { id: 6, name: "Dr Not Ready", ready: false }],
  max_refills: 11,
  controlled_message: "Controlled substances (Schedule II-V) can't be written on paper or fax here.",
};
const PHARM = { id: 2, name: "Corner Pharmacy", address: "1 Main St", city: "Brooklyn", state: "NY", zip_code: "11201", phone: "718-555-0199", fax: "(718) 555-0198" };

const RX = (over = {}) => ({
  id: 11, patient: 3, patient_name: "Ann Lee", prescriber: 5, prescriber_name: "Dr Who",
  drug_name: "Amoxicillin", strength: "500 mg", form: "capsule", dose: "1 capsule", route: "PO", frequency: "tid",
  duration_days: 10, prn: false, prn_reason: "", sig_extra: "", sig: "Take 1 capsule by mouth three times daily for 10 days.",
  quantity: "30", quantity_unit: "capsules", days_supply: 10, refills: 0, dispense_as_written: false,
  indication_code: "", indication_text: "", note_to_pharmacist: "", pharmacy: 2, pharmacy_name: "Corner Pharmacy",
  status: "draft", status_label: "Draft", delivery_method: "", created_at: "2026-10-08T12:00:00Z", signed_at: null, sent_at: null,
  cancelled_at: null, cancel_reason: "", print_count: 0, replaces: null, controlled: false, actions: ["sign"],
  signed_by_name: "", pharmacy_detail: PHARM, delivery_detail: {}, missing_for_sign: [], allergy_alerts: [], duplicates: [],
  replaced_by: [], events: [{ id: 1, type: "created", user: "Dr Who", detail: {}, at: "2026-10-08T12:00:00Z" }],
  ...over,
});

const choose = async (label, option) => {
  fireEvent.mouseDown(screen.getByLabelText(label));
  fireEvent.click(await screen.findByRole("option", { name: option }));
};
const type = (testid, value) => fireEvent.change(screen.getByTestId(testid), { target: { value } });

beforeEach(() => {
  mockRole = "doctor";
  Object.values(api).forEach((fn) => fn.mockReset());
  toast.success.mockReset();
  window.open = jest.fn();
  window.URL.createObjectURL = jest.fn(() => "blob:x");
  window.URL.revokeObjectURL = jest.fn();
});

describe("directions sentence", () => {
  test("matches the server's wording", () => {
    expect(buildSig({ dose: "1 tablet", route: "PO", frequency: "bid", duration_days: "10", sig_extra: "with food" })).toBe("Take 1 tablet by mouth twice daily for 10 days. with food.");
    expect(buildSig({ dose: "1 tablet", route: "PO", frequency: "q6h", prn: true, prn_reason: "pain" })).toBe("Take 1 tablet by mouth every 6 hours as needed for pain.");
    expect(buildSig({ dose: "1 drop", route: "Ophthalmic", frequency: "tid", duration_days: 1 })).toBe("Instill 1 drop in the eye three times daily for 1 day.");
    expect(buildSig({ dose: "2 puffs", route: "Inhaled", frequency: "prn", prn_reason: "wheezing" })).toBe("Inhale 2 puffs by inhalation as needed for wheezing.");
  });
});

describe("chart tab", () => {
  test("Prescriptions is a clinical tab after Orders", () => {
    const keys = CHART_TABS.map((t) => t.value);
    expect(keys.indexOf("prescriptions")).toBe(keys.indexOf("orders") + 1);
    expect(visibleChartTabs("registrar").some((t) => t.value === "prescriptions")).toBe(false);
    expect(visibleChartTabs("doctor").some((t) => t.value === "prescriptions")).toBe(true);
  });
});

describe("panel", () => {
  const setup = (rows = [RX()]) =>
    api.get.mockImplementation((url) => {
      if (url === "/rx-meta/") return Promise.resolve({ data: META });
      if (url === "/rx/") return Promise.resolve({ data: { count: rows.length, results: rows } });
      if (url === "/rx/11/") return Promise.resolve({ data: rows[0] });
      if (url === "/pharmacies/") return Promise.resolve({ data: { results: [PHARM] } });
      if (url.startsWith("/patient-pharmacy/")) return Promise.resolve({ data: { pharmacy: null } });
      return Promise.resolve({ data: {} });
    });

  test("lists the patient's prescriptions", async () => {
    setup([RX(), RX({ id: 12, drug_name: "Lisinopril", strength: "10 mg", status: "sent", status_label: "Given / sent", delivery_method: "fax" })]);
    render(<PrescriptionsPanel patient={{ id: 3, name: "Ann Lee" }} />);
    expect(await screen.findByText("Prescriptions — Ann Lee")).toBeInTheDocument();
    expect(await screen.findByTestId("rx-row-11")).toHaveTextContent("Amoxicillin 500 mg capsule");
    expect(screen.getByTestId("rx-row-11")).toHaveTextContent("Take 1 capsule by mouth three times daily");
    expect(screen.getByTestId("rx-row-12")).toHaveTextContent("Faxed");
    const call = api.get.mock.calls.find((c) => c[0] === "/rx/");
    expect(call[1].params.patient).toBe(3);
  });

  test("shows an empty state and filters by status", async () => {
    setup([]);
    render(<PrescriptionsPanel patient={{ id: 3, name: "Ann Lee" }} />);
    expect(await screen.findByTestId("rx-empty")).toBeInTheDocument();
    await choose("Show", "Active");
    await waitFor(() => expect(api.get.mock.calls.filter((c) => c[0] === "/rx/").pop()[1].params.status).toBe("active"));
  });

  test("a registrar can't start a prescription", async () => {
    mockRole = "registrar";
    setup([]);
    render(<PrescriptionsPanel patient={{ id: 3, name: "Ann Lee" }} />);
    await screen.findByTestId("rx-empty");
    expect(screen.queryByTestId("rx-new")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rx-my-details")).not.toBeInTheDocument();
  });

  test("a doctor sees the prescriber-details button; a nurse sees New but not that", async () => {
    setup([]);
    const { unmount } = render(<PrescriptionsPanel patient={{ id: 3, name: "Ann Lee" }} />);
    expect(await screen.findByTestId("rx-my-details")).toBeInTheDocument();
    unmount();
    mockRole = "nurse";
    render(<PrescriptionsPanel patient={{ id: 3, name: "Ann Lee" }} />);
    expect(await screen.findByTestId("rx-new")).toBeInTheDocument();
    expect(screen.queryByTestId("rx-my-details")).not.toBeInTheDocument();
  });

  test("clicking a row opens it", async () => {
    setup();
    render(<PrescriptionsPanel patient={{ id: 3, name: "Ann Lee" }} />);
    fireEvent.click(await screen.findByTestId("rx-row-11"));
    expect(await screen.findByTestId("rx-detail")).toBeInTheDocument();
    expect(await screen.findByTestId("rx-sig")).toHaveTextContent("Take 1 capsule by mouth three times daily for 10 days.");
  });
});

describe("writer form", () => {
  const ME = { role: "doctor", id: 5 };
  const open = (props = {}) =>
    render(<PrescriptionFormDialog open onClose={jest.fn()} onSaved={props.onSaved || jest.fn()} patient={{ id: 3, name: "Ann Lee" }} meta={META} me={props.me || ME} prescription={props.prescription || null} />);

  beforeEach(() => {
    api.get.mockImplementation((url, cfg) => {
      if (url === "/pharmacies/") return Promise.resolve({ data: { results: [PHARM] } });
      if (url === "/patient-pharmacy/3/") return Promise.resolve({ data: { pharmacy: null } });
      if (url === "/rx-drugs/") {
        return Promise.resolve({ data: { results: cfg.params.q.startsWith("oxy") ? [{ display: "Oxycodone", controlled: true }] : [{ display: "Amoxicillin", code: "723", system: "rxnorm", controlled: false }] } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  test("creates a draft with the structured fields and a live directions preview", async () => {
    const onSaved = jest.fn();
    api.post.mockResolvedValue({ data: RX() });
    api.put.mockResolvedValue({ data: {} });
    open({ onSaved });
    fireEvent.change(await screen.findByTestId("rx-drug"), { target: { value: "Amoxicillin" } });
    type("rx-strength", "500 mg");
    type("rx-dose", "1 capsule");
    await choose("How often", "Three times a day (TID)");
    type("rx-duration", "10");
    expect(await screen.findByTestId("rx-sig-preview")).toHaveTextContent("Take 1 capsule by mouth three times daily for 10 days.");
    type("rx-quantity", "30");
    type("rx-unit", "capsules");
    type("rx-days-supply", "10");
    fireEvent.mouseDown(screen.getByTestId("rx-pharmacy"));
    fireEvent.click(await screen.findByRole("option", { name: /Corner Pharmacy/ }));
    fireEvent.click(screen.getByTestId("rx-form-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/rx/");
    expect(body).toMatchObject({
      patient: 3, drug_name: "Amoxicillin", strength: "500 mg", dose: "1 capsule", route: "PO", frequency: "tid",
      duration_days: 10, quantity: "30", quantity_unit: "capsules", days_supply: 10, refills: 0, pharmacy: 2, prescriber: 5,
    });
    // the first pharmacy chosen for the patient is remembered as theirs
    expect(api.put).toHaveBeenCalledWith("/patient-pharmacy/3/", { pharmacy: 2 }, expect.anything());
  });

  test("needs a drug, and a doctor for a nurse's draft", async () => {
    open({ me: { role: "nurse", id: 9 } });
    await screen.findByTestId("rx-drug");
    fireEvent.click(screen.getByTestId("rx-form-save"));
    expect(await screen.findByTestId("rx-form-error")).toHaveTextContent("Choose the drug.");
    fireEvent.change(screen.getByTestId("rx-drug"), { target: { value: "Lisinopril" } });
    fireEvent.click(screen.getByTestId("rx-form-save"));
    expect(await screen.findByTestId("rx-form-error")).toHaveTextContent("Choose the prescribing doctor.");
    expect(api.post).not.toHaveBeenCalled();
  });

  test("a controlled drug in the search can't be picked", async () => {
    open();
    fireEvent.change(await screen.findByTestId("rx-drug"), { target: { value: "oxyc" } });
    const option = await screen.findByRole("option", { name: /Oxycodone/ });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(option).toHaveTextContent("Controlled - not available");
  });

  test("shows the server's message when it refuses", async () => {
    api.post.mockRejectedValue({ response: { data: { detail: "Controlled substances (Schedule II-V) can't be written on paper or fax here." } } });
    open();
    fireEvent.change(await screen.findByTestId("rx-drug"), { target: { value: "Percocet" } });
    fireEvent.click(screen.getByTestId("rx-form-save"));
    expect(await screen.findByTestId("rx-form-error")).toHaveTextContent("Controlled substances");
  });

  test("editing a draft fills the form and saves with PATCH", async () => {
    api.patch.mockResolvedValue({ data: RX({ quantity: "20" }) });
    const onSaved = jest.fn();
    open({ prescription: RX(), onSaved });
    await waitFor(() => expect(screen.getByTestId("rx-strength")).toHaveValue("500 mg"));
    expect(screen.getByTestId("rx-dose")).toHaveValue("1 capsule");
    type("rx-quantity", "20");
    fireEvent.click(screen.getByTestId("rx-form-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.patch.mock.calls[0][0]).toBe("/rx/11/");
    expect(api.patch.mock.calls[0][1].quantity).toBe("20");
  });

  test("adds a pharmacy from the form and selects it", async () => {
    api.post.mockResolvedValue({ data: { id: 9, name: "Walk-in Rx", city: "Queens", state: "NY" } });
    open();
    await screen.findByTestId("rx-drug");
    fireEvent.click(screen.getByTestId("rx-add-pharmacy"));
    fireEvent.change(await screen.findByTestId("pharmacy-name"), { target: { value: "Walk-in Rx" } });
    fireEvent.change(screen.getByTestId("pharmacy-fax"), { target: { value: "212-555-0000" } });
    fireEvent.click(screen.getByTestId("pharmacy-save"));
    await waitFor(() => expect(screen.queryByTestId("pharmacy-dialog")).not.toBeInTheDocument());
    expect(api.post.mock.calls[0][0]).toBe("/pharmacies/");
    expect(api.post.mock.calls[0][1]).toMatchObject({ name: "Walk-in Rx", fax: "212-555-0000" });
    expect(screen.getByTestId("rx-pharmacy")).toHaveValue("Walk-in Rx — Queens NY");
  });
});

describe("detail dialog", () => {
  const ME = { role: "doctor", id: 5 };
  const show = (rx, props = {}) => {
    api.get.mockImplementation((url) => (url === "/rx/11/" ? Promise.resolve({ data: rx }) : Promise.resolve({ data: {} })));
    return render(<PrescriptionDetailDialog open id={11} me={props.me || ME} onClose={jest.fn()} onChanged={props.onChanged} onEdit={props.onEdit} onSetupProfile={props.onSetupProfile} />);
  };
  const SIGNED = (over = {}) => RX({ status: "signed", status_label: "Signed", signed_at: "2026-10-08T13:00:00Z", signed_by_name: "Dr Who", actions: ["print", "fax", "cancel", "revise"], ...over });

  test("signs a ready draft", async () => {
    api.post.mockResolvedValue({ data: SIGNED() });
    show(RX());
    fireEvent.click(await screen.findByTestId("rx-sign"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][0]).toBe("/rx/11/action/");
    expect(api.post.mock.calls[0][1]).toMatchObject({ action: "sign" });
    expect(await screen.findByTestId("rx-status")).toHaveTextContent("Signed");
    expect(toast.success).toHaveBeenCalledWith("Prescription signed.");
  });

  test("Sign is off while things are missing, and the prescriber can go fill in their details", async () => {
    const onSetupProfile = jest.fn();
    show(RX({ missing_for_sign: ["quantity", "prescriber license number"] }), { onSetupProfile });
    expect(await screen.findByTestId("rx-missing")).toHaveTextContent("quantity, prescriber license number");
    expect(screen.getByTestId("rx-sign")).toBeDisabled();
    fireEvent.click(screen.getByTestId("rx-setup-profile"));
    expect(onSetupProfile).toHaveBeenCalled();
  });

  test("only the prescribing doctor gets Sign", async () => {
    show(RX({ actions: [] }), { me: { role: "nurse", id: 9 } });
    await screen.findByTestId("rx-sig");
    expect(screen.queryByTestId("rx-sign")).not.toBeInTheDocument();
    expect(screen.getByTestId("rx-edit")).toBeInTheDocument();
  });

  test("an allergy stops signing until a reason is given", async () => {
    api.post
      .mockRejectedValueOnce({ response: { status: 409, data: { detail: "Allergy alert for 'Amoxicillin'. Give a reason to sign anyway.", errors: [{ kind: "allergy", allergy_alerts: [{ allergy_id: 1, message: "Same drug as the allergy: patient is allergic to Amoxicillin." }] }] } } })
      .mockResolvedValueOnce({ data: SIGNED() });
    show(RX({ allergy_alerts: [{ allergy_id: 1, message: "Same drug as the allergy: patient is allergic to Amoxicillin." }] }));
    expect(await screen.findByTestId("rx-allergy-alerts")).toHaveTextContent("allergic to Amoxicillin");
    fireEvent.click(screen.getByTestId("rx-sign"));
    expect(await screen.findByTestId("rx-stop")).toHaveTextContent("Allergy alert");
    expect(screen.getByTestId("rx-stop-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("rx-stop-reason"), { target: { value: "Tolerated before" } });
    fireEvent.click(screen.getByTestId("rx-stop-confirm"));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[1][1]).toMatchObject({ action: "sign", allergy_override_reason: "Tolerated before" });
  });

  test("a running duplicate also needs a reason", async () => {
    api.post
      .mockRejectedValueOnce({ response: { status: 409, data: { detail: "This patient already has a running prescription for the same drug.", errors: [{ kind: "duplicate", duplicates: [] }] } } })
      .mockResolvedValueOnce({ data: SIGNED() });
    show(RX());
    fireEvent.click(await screen.findByTestId("rx-sign"));
    expect(await screen.findByTestId("rx-stop")).toHaveTextContent("already has a running prescription");
    fireEvent.change(screen.getByTestId("rx-stop-reason"), { target: { value: "Dose change" } });
    fireEvent.click(screen.getByTestId("rx-stop-confirm"));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[1][1]).toMatchObject({ duplicate_reason: "Dose change" });
  });

  test("print opens the PDF through the logging call", async () => {
    api.post.mockResolvedValue({ data: new Blob(["%PDF"]) });
    show(SIGNED());
    fireEvent.click(await screen.findByTestId("rx-print"));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith("blob:x", "_blank", "noopener"));
    expect(api.post.mock.calls[0][0]).toBe("/rx/11/pdf/");
    expect(api.post.mock.calls[0][2]).toMatchObject({ responseType: "blob" });
  });

  test("preview does not use the logging call", async () => {
    api.get.mockImplementation((url) => (url === "/rx/11/" ? Promise.resolve({ data: SIGNED() }) : Promise.resolve({ data: new Blob(["%PDF"]) })));
    render(<PrescriptionDetailDialog open id={11} me={ME} onClose={jest.fn()} />);
    fireEvent.click(await screen.findByTestId("rx-preview"));
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    expect(api.post).not.toHaveBeenCalled();
    expect(api.get.mock.calls.some((c) => c[0] === "/rx/11/pdf/" && c[1].responseType === "blob")).toBe(true);
  });

  test("records a fax with the pharmacy's number filled in", async () => {
    api.post.mockResolvedValue({ data: SIGNED({ status: "sent", status_label: "Given / sent", delivery_method: "fax", sent_at: "2026-10-08T14:00:00Z", delivery_detail: { fax_number: "7185550198", confirmation: "FX-1" } }) });
    show(SIGNED());
    fireEvent.click(await screen.findByTestId("rx-fax"));
    const number = await screen.findByTestId("rx-fax-number");
    expect(number).toHaveValue("(718) 555-0198");
    fireEvent.change(screen.getByTestId("rx-fax-confirmation"), { target: { value: "FX-1" } });
    fireEvent.click(screen.getByTestId("rx-fax-confirm"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toMatchObject({ action: "fax", fax_number: "(718) 555-0198", confirmation: "FX-1" });
    expect(await screen.findByTestId("rx-status")).toHaveTextContent("Given / sent");
    expect(toast.success).toHaveBeenCalledWith("Fax recorded.");
  });

  test("Mark as faxed needs a number", async () => {
    show(SIGNED({ pharmacy_detail: null }));
    fireEvent.click(await screen.findByTestId("rx-fax"));
    await screen.findByTestId("rx-fax-panel");
    expect(screen.getByTestId("rx-fax-confirm")).toBeDisabled();
  });

  test("cancel needs a reason", async () => {
    api.post.mockResolvedValue({ data: SIGNED({ status: "cancelled", status_label: "Cancelled", cancelled_at: "2026-10-08T15:00:00Z", cancel_reason: "Wrong drug", actions: ["revise"] }) });
    show(SIGNED());
    fireEvent.click(await screen.findByTestId("rx-cancel"));
    expect(screen.getByTestId("rx-cancel-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("rx-cancel-reason"), { target: { value: "Wrong drug" } });
    fireEvent.click(screen.getByTestId("rx-cancel-confirm"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toMatchObject({ action: "cancel", reason: "Wrong drug" });
    expect(await screen.findByTestId("rx-status")).toHaveTextContent("Cancelled");
  });

  test("revise hands the new draft to the editor", async () => {
    const onEdit = jest.fn();
    api.post.mockResolvedValue({ data: RX({ id: 12, replaces: 11 }) });
    show(SIGNED(), { onEdit });
    fireEvent.click(await screen.findByTestId("rx-revise"));
    await waitFor(() => expect(onEdit).toHaveBeenCalled());
    expect(onEdit.mock.calls[0][0].id).toBe(12);
    expect(api.post.mock.calls[0][1]).toMatchObject({ action: "revise" });
  });

  test("a signed prescription can't be edited or deleted, and warns about recalling a sent one", async () => {
    show(SIGNED({ status: "sent", status_label: "Given / sent", delivery_method: "print", sent_at: "2026-10-08T14:00:00Z" }));
    await screen.findByTestId("rx-sig");
    expect(screen.queryByTestId("rx-edit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rx-delete")).not.toBeInTheDocument();
    expect(screen.getByText(/call the pharmacy too/)).toBeInTheDocument();
  });

  test("deletes a draft", async () => {
    api.delete.mockResolvedValue({});
    show(RX());
    fireEvent.click(await screen.findByTestId("rx-delete"));
    await waitFor(() => expect(api.delete).toHaveBeenCalled());
    expect(api.delete.mock.calls[0][0]).toBe("/rx/11/");
  });

  test("history lists each step with its reasons", async () => {
    show(SIGNED({ events: [
      { id: 1, type: "created", user: "Dr Who", detail: {}, at: "2026-10-08T12:00:00Z" },
      { id: 2, type: "signed", user: "Dr Who", detail: { allergy_override: { reason: "Tolerated before" } }, at: "2026-10-08T13:00:00Z" },
      { id: 3, type: "faxed", user: "Nina Nurse", detail: {}, at: "2026-10-08T14:00:00Z" },
    ] }));
    const history = await screen.findByTestId("rx-history");
    expect(within(history).getByText("Draft created")).toBeInTheDocument();
    expect(within(history).getByText(/Signed.*allergy override: Tolerated before/)).toBeInTheDocument();
    expect(within(history).getByText("Faxed")).toBeInTheDocument();
  });
});

describe("prescriber details", () => {
  test("loads and saves", async () => {
    api.get.mockResolvedValue({ data: { name: "Dr Who", npi: "", license_number: "", license_state: "", dea_number: "", practice_name: "", address: "", phone: "", fax: "" } });
    api.put.mockResolvedValue({ data: { ready: true } });
    const onSaved = jest.fn();
    render(<PrescriberProfileDialog open onClose={jest.fn()} onSaved={onSaved} />);
    fireEvent.change(await screen.findByTestId("profile-npi"), { target: { value: "1234567893" } });
    fireEvent.change(screen.getByTestId("profile-license_number"), { target: { value: "123456" } });
    fireEvent.change(screen.getByTestId("profile-license_state"), { target: { value: "NY" } });
    fireEvent.click(screen.getByTestId("profile-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.put.mock.calls[0][0]).toBe("/prescriber-profile/");
    expect(api.put.mock.calls[0][1]).toMatchObject({ npi: "1234567893", license_number: "123456", license_state: "NY" });
  });

  test("shows the server's complaint about a bad number", async () => {
    api.get.mockResolvedValue({ data: { name: "Dr Who", npi: "", license_number: "", license_state: "", dea_number: "", practice_name: "", address: "", phone: "", fax: "" } });
    api.put.mockRejectedValue({ response: { data: { detail: "That NPI isn't valid (10 digits with a correct check digit)." } } });
    render(<PrescriberProfileDialog open onClose={jest.fn()} />);
    fireEvent.change(await screen.findByTestId("profile-npi"), { target: { value: "1234567890" } });
    fireEvent.click(screen.getByTestId("profile-save"));
    expect(await screen.findByTestId("profile-error")).toHaveTextContent("NPI isn't valid");
  });

  test("an administrator can open a doctor's details", async () => {
    api.get.mockResolvedValue({ data: { name: "Dr Who", npi: "1234567893", license_number: "1", license_state: "NY", dea_number: "", practice_name: "", address: "", phone: "", fax: "" } });
    render(<PrescriberProfileDialog open onClose={jest.fn()} userId={6} />);
    await screen.findByTestId("profile-npi");
    expect(api.get.mock.calls[0][1].params).toEqual({ user: 6 });
  });
});

describe("pharmacy dialog", () => {
  test("needs a name", async () => {
    render(<PharmacyDialog open onClose={jest.fn()} onSaved={jest.fn()} />);
    fireEvent.click(screen.getByTestId("pharmacy-save"));
    expect(await screen.findByTestId("pharmacy-error")).toHaveTextContent("needs a name");
    expect(api.post).not.toHaveBeenCalled();
  });
});
