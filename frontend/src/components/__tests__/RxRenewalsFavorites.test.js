import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      prescriptions: "/rx/",
      prescriptionQueues: "/rx/queues/",
      prescription: (id) => `/rx/${id}/`,
      prescriptionAction: (id) => `/rx/${id}/action/`,
      prescriptionPdf: (id) => `/rx/${id}/pdf/`,
      prescriptionMeta: "/rx-meta/",
      prescriptionDrugs: "/rx-drugs/",
      prescriptionFavorites: "/favs/",
      prescriptionFavorite: (id) => `/favs/${id}/`,
      pharmacies: "/pharmacies/",
      patientPharmacy: (id) => `/patient-pharmacy/${id}/`,
      prescriberProfile: "/prescriber-profile/",
      patients: "/patients/",
      patientHeader: (id) => `/header/${id}/`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({ getAccessToken: () => "tok" }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "doctor", user_id: 5 }) }));
jest.mock("../IcdCodePicker", () => ({ __esModule: true, default: () => null, dxLabel: (d) => `${d.code} - ${d.description}` }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import PrescriptionDetailDialog from "../prescriptions/PrescriptionDetailDialog";
import PrescriptionFormDialog from "../prescriptions/PrescriptionFormDialog";
import PrescriptionWorklist from "../prescriptions/PrescriptionWorklist";
import PrescriptionsPanel from "../prescriptions/PrescriptionsPanel";

const PHARM = { id: 2, name: "Corner Pharmacy", address: "1 Main St", city: "Brooklyn", state: "NY", zip_code: "11201", phone: "718-555-0199", fax: "(718) 555-0198" };
const META = {
  frequencies: [{ value: "bid", label: "Twice a day (BID)" }, { value: "tid", label: "Three times a day (TID)" }],
  routes: ["PO", "Topical"], forms: ["tablet", "capsule"], max_refills: 11,
  doctors: [{ id: 5, name: "Dr Who", ready: true }], controlled_message: "Controlled substances can't be written here.",
  queues: [
    { value: "needs_signing", label: "Needs signing" }, { value: "to_send", label: "To print or fax" }, { value: "renewals", label: "Due for renewal" },
    { value: "sent", label: "Sent" }, { value: "cancelled", label: "Cancelled" }, { value: "all", label: "All" },
  ],
};
const RX = (over = {}) => ({
  id: 11, patient: 3, patient_name: "Ann Lee", prescriber: 5, prescriber_name: "Dr Who",
  drug_name: "Amoxicillin", strength: "500 mg", form: "capsule", dose: "1 capsule", route: "PO", frequency: "tid",
  duration_days: 10, prn: false, prn_reason: "", sig_extra: "", sig: "Take 1 capsule by mouth three times daily for 10 days.",
  quantity: "30", quantity_unit: "capsules", days_supply: 10, refills: 0, dispense_as_written: false,
  indication_code: "", indication_text: "", note_to_pharmacist: "", pharmacy: 2, pharmacy_name: "Corner Pharmacy",
  status: "signed", status_label: "Signed", delivery_method: "", created_at: "2026-10-01T12:00:00Z", signed_at: "2026-10-01T12:00:00Z", sent_at: null,
  cancelled_at: null, cancel_reason: "", print_count: 0, replaces: null, renews: null, runs_out_on: "2026-10-11", renewal_due: false, controlled: false,
  actions: ["print", "fax", "cancel", "revise", "renew"], signed_by_name: "Dr Who", pharmacy_detail: PHARM, delivery_detail: {},
  missing_for_sign: [], allergy_alerts: [], duplicates: [], replaced_by: [], events: [{ id: 1, type: "created", user: "Dr Who", detail: {}, at: "2026-10-01T12:00:00Z" }],
  ...over,
});
const FAV = (over = {}) => ({
  id: 41, label: "Strep throat", drug_name: "Penicillin V", code_system: "", code: "", strength: "500 mg", form: "tablet", dose: "1 tablet", route: "PO",
  frequency: "bid", duration_days: 10, prn: false, prn_reason: "", sig_extra: "", quantity: "20", quantity_unit: "tablets", days_supply: 10, refills: 1,
  dispense_as_written: false, indication_code: "", indication_text: "", note_to_pharmacist: "", sig: "Take 1 tablet by mouth twice daily for 10 days.", controlled: false, ...over,
});
let favs;
let rxs;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.values(toast).forEach((fn) => fn.mockReset());
  favs = [FAV()];
  rxs = [RX()];
  api.get.mockImplementation((url, cfg) => {
    if (url === "/favs/") return Promise.resolve({ data: { results: favs.filter((f) => !cfg?.params?.q || f.label.toLowerCase().includes(cfg.params.q.toLowerCase())) } });
    if (url === "/pharmacies/") return Promise.resolve({ data: { results: [PHARM] } });
    if (url === "/patient-pharmacy/3/") return Promise.resolve({ data: { pharmacy: null } });
    if (url === "/rx-meta/") return Promise.resolve({ data: META });
    if (url === "/rx/queues/") return Promise.resolve({ data: { counts: { needs_signing: 0, to_send: 0, renewals: 2, sent: 1, cancelled: 0, all: 3 } } });
    if (url === "/rx/") return Promise.resolve({ data: { count: rxs.length, results: rxs } });
    if (url === "/home/") return Promise.resolve({ data: { results: [], counts: {}, options: {} } });
    const m = /^\/rx\/(\d+)\/$/.exec(url);
    if (m) return Promise.resolve({ data: rxs.find((r) => String(r.id) === m[1]) });
    return Promise.resolve({ data: {} });
  });
});
afterEach(() => window.sessionStorage.clear());

const type = (testid, value) => fireEvent.change(screen.getByTestId(testid), { target: { value } });

describe("renewing", () => {
  const detail = (props = {}) => render(<PrescriptionDetailDialog open id={11} me={{ role: "doctor", id: 5 }} onClose={jest.fn()} onEdit={props.onEdit || jest.fn()} onChanged={jest.fn()} />);

  test("Renew makes a new draft and opens it for review", async () => {
    const onEdit = jest.fn();
    const draft = RX({ id: 30, status: "draft", status_label: "Draft", signed_at: null, renews: 11, actions: ["sign"], runs_out_on: null });
    api.post.mockResolvedValue({ data: draft });
    detail({ onEdit });
    fireEvent.click(await screen.findByTestId("rx-renew"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/rx/11/action/", { action: "renew" }, expect.anything()));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(draft));
    expect(toast.success).toHaveBeenCalledWith("A renewal draft was made. Review it, then sign.");
  });

  test("a prescription that can't be renewed shows no Renew button", async () => {
    rxs = [RX({ actions: ["print", "fax", "cancel", "revise"] })];
    detail();
    await screen.findByTestId("rx-sig");
    expect(screen.queryByTestId("rx-renew")).not.toBeInTheDocument();
  });

  test("shows when the supply runs out, and says when a renewal is due", async () => {
    rxs = [RX({ renewal_due: true })];
    detail();
    expect(await screen.findByTestId("rx-runs-out")).toHaveTextContent(/10\/11\/2026|11\/10\/2026/);
    expect(screen.getByTestId("rx-runs-out")).toHaveTextContent("due for renewal");
  });

  test("a renewal says which prescription it renews", async () => {
    rxs = [RX({ id: 30, status: "draft", status_label: "Draft", signed_at: null, renews: 11, actions: ["sign"], runs_out_on: null })];
    render(<PrescriptionDetailDialog open id={30} me={{ role: "doctor", id: 5 }} onClose={jest.fn()} onEdit={jest.fn()} />);
    expect(await screen.findByText("Prescription 11")).toBeInTheDocument();
  });

  test("the list marks prescriptions due for renewal", async () => {
    rxs = [RX({ renewal_due: true })];
    render(<PrescriptionsPanel patient={{ id: 3, name: "Ann Lee" }} />);
    expect(await screen.findByTestId("rx-renewal-due-11")).toHaveTextContent("Renewal due");
  });

  test("the manager has a Due for renewal queue with its count", async () => {
    rxs = [RX({ renewal_due: true })];
    render(<PrescriptionWorklist me={{ role: "doctor", id: 5 }} />);
    expect(await screen.findByTestId("rx-queue-renewals")).toHaveTextContent("Due for renewal (2)");
    fireEvent.click(screen.getByTestId("rx-queue-renewals"));
    await waitFor(() => expect(api.get.mock.calls.filter((c) => c[0] === "/rx/").pop()[1].params.queue).toBe("renewals"));
    expect(await screen.findByTestId("rx-renewal-due-11")).toBeInTheDocument();
  });
});

describe("favorites", () => {
  const form = (props = {}) =>
    render(<PrescriptionFormDialog open onClose={jest.fn()} onSaved={jest.fn()} patient={{ id: 3, name: "Ann Lee" }} meta={META} me={{ role: "doctor", id: 5 }} prescription={props.prescription || null} />);

  test("Save as favorite on a prescription saves it from that prescription", async () => {
    api.post.mockResolvedValue({ data: FAV() });
    render(<PrescriptionDetailDialog open id={11} me={{ role: "doctor", id: 5 }} onClose={jest.fn()} onEdit={jest.fn()} />);
    fireEvent.click(await screen.findByTestId("rx-favorite"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/favs/", { from_prescription: 11 }, expect.anything()));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Saved to your favorites."));
  });

  test("an already-saved favorite shows the server's message", async () => {
    api.post.mockRejectedValue({ response: { data: { detail: "That is already one of your favorites." } } });
    render(<PrescriptionDetailDialog open id={11} me={{ role: "doctor", id: 5 }} onClose={jest.fn()} onEdit={jest.fn()} />);
    fireEvent.click(await screen.findByTestId("rx-favorite"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That is already one of your favorites."));
  });

  test("a controlled prescription can't be saved as a favorite", async () => {
    rxs = [RX({ controlled: true })];
    render(<PrescriptionDetailDialog open id={11} me={{ role: "doctor", id: 5 }} onClose={jest.fn()} onEdit={jest.fn()} />);
    await screen.findByTestId("rx-sig");
    expect(screen.queryByTestId("rx-favorite")).not.toBeInTheDocument();
  });

  test("the writer's Favorites button lists them, and Use fills the form but keeps the doctor and pharmacy", async () => {
    form();
    await screen.findByTestId("rx-drug");
    fireEvent.mouseDown(screen.getByTestId("rx-pharmacy"));
    fireEvent.click(await screen.findByRole("option", { name: /Corner Pharmacy/ }));
    fireEvent.click(screen.getByTestId("rx-open-favorites"));
    const row = await screen.findByTestId("rx-favorite-41");
    expect(row).toHaveTextContent("Strep throat");
    expect(row).toHaveTextContent("Take 1 tablet by mouth twice daily for 10 days.");
    expect(row).toHaveTextContent("Dispense 20 tablets");
    fireEvent.click(screen.getByTestId("rx-favorite-use-41"));
    await waitFor(() => expect(screen.getByTestId("rx-strength")).toHaveValue("500 mg"));
    expect(screen.getByTestId("rx-drug")).toHaveValue("Penicillin V");
    expect(screen.getByTestId("rx-dose")).toHaveValue("1 tablet");
    expect(screen.getByTestId("rx-quantity")).toHaveValue("20");
    expect(screen.getByTestId("rx-days-supply")).toHaveValue("10");
    expect(screen.getByTestId("rx-pharmacy").value).toContain("Corner Pharmacy");
    expect(screen.getByTestId("rx-sig-preview")).toHaveTextContent("Take 1 tablet by mouth twice daily for 10 days.");
    // the dialog closed
    await waitFor(() => expect(screen.queryByTestId("rx-favorites")).not.toBeInTheDocument());
  });

  test("a favorite can be removed, and the list can be searched", async () => {
    favs = [FAV(), FAV({ id: 42, label: "Ear infection", drug_name: "Amoxicillin" })];
    form();
    fireEvent.click(await screen.findByTestId("rx-open-favorites"));
    await screen.findByTestId("rx-favorite-42");
    api.delete.mockResolvedValue({});
    fireEvent.click(screen.getByTestId("rx-favorite-remove-42"));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/favs/42/", expect.anything()));
    await waitFor(() => expect(screen.queryByTestId("rx-favorite-42")).not.toBeInTheDocument());
    fireEvent.change(screen.getByTestId("rx-favorites-search"), { target: { value: "zzz" } });
    expect(await screen.findByTestId("rx-favorites-empty")).toBeInTheDocument();
    await waitFor(() => expect(api.get.mock.calls.filter((c) => c[0] === "/favs/").pop()[1].params).toEqual({ q: "zzz" }));
  });

  test("an empty favorites list explains how to add one", async () => {
    favs = [];
    form();
    fireEvent.click(await screen.findByTestId("rx-open-favorites"));
    expect(await screen.findByTestId("rx-favorites-empty")).toHaveTextContent("No favorites yet");
  });

  test("Save as favorite in the writer sends what is on the form, and needs a drug", async () => {
    form();
    await screen.findByTestId("rx-drug");
    fireEvent.click(screen.getByTestId("rx-save-favorite"));
    expect(await screen.findByTestId("rx-form-error")).toHaveTextContent("Choose the drug first.");
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("rx-drug"), { target: { value: "Lisinopril" } });
    type("rx-strength", "10 mg");
    type("rx-dose", "1 tablet");
    type("rx-quantity", "30");
    api.post.mockResolvedValue({ data: FAV({ id: 50, drug_name: "Lisinopril" }) });
    fireEvent.click(screen.getByTestId("rx-save-favorite"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/favs/");
    expect(body).toMatchObject({ drug_name: "Lisinopril", strength: "10 mg", dose: "1 tablet", quantity: "30", route: "PO", refills: 0 });
    expect(body.patient).toBeUndefined();
    expect(body.pharmacy).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith("Saved to your favorites.");
  });

  test("editing a draft hides Favorites but still offers Save as favorite", async () => {
    form({ prescription: RX({ status: "draft", status_label: "Draft", actions: ["sign"] }) });
    await screen.findByTestId("rx-save-favorite");
    expect(screen.queryByTestId("rx-open-favorites")).not.toBeInTheDocument();
  });
});
