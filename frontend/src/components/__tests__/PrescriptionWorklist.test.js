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
import PrescriptionWorklist from "../prescriptions/PrescriptionWorklist";

const META = {
  frequencies: [{ value: "tid", label: "Three times a day (TID)" }],
  routes: ["PO"],
  forms: ["tablet", "capsule"],
  doctors: [{ id: 5, name: "Dr Who", ready: true }, { id: 6, name: "Dr Grey", ready: true }],
  max_refills: 11,
  controlled_message: "Controlled substances can't be written here.",
  queues: [
    { value: "needs_signing", label: "Needs signing" },
    { value: "to_send", label: "To print or fax" },
    { value: "sent", label: "Sent" },
    { value: "cancelled", label: "Cancelled" },
    { value: "all", label: "All" },
  ],
  capabilities: { print: { available: true }, fax: { available: true, automatic: false }, erx: { available: false } },
  can_sign: true,
};
const RX = (over = {}) => ({
  id: 11, patient: 3, patient_name: "Ann Lee", prescriber: 5, prescriber_name: "Dr Who",
  drug_name: "Amoxicillin", strength: "500 mg", form: "capsule", dose: "1 capsule", route: "PO", frequency: "tid",
  duration_days: 10, prn: false, prn_reason: "", sig_extra: "", sig: "Take 1 capsule by mouth three times daily for 10 days.",
  quantity: "30", quantity_unit: "capsules", days_supply: 10, refills: 0, dispense_as_written: false,
  indication_code: "", indication_text: "", note_to_pharmacist: "", pharmacy: null, pharmacy_name: "",
  status: "draft", status_label: "Draft", delivery_method: "", created_at: "2026-10-08T12:00:00Z", signed_at: null, sent_at: null,
  cancelled_at: null, cancel_reason: "", print_count: 0, replaces: null, controlled: false, actions: ["sign"],
  signed_by_name: "", pharmacy_detail: null, delivery_detail: {}, missing_for_sign: [], allergy_alerts: [], duplicates: [],
  replaced_by: [], events: [{ id: 1, type: "created", user: "Dr Who", detail: {}, at: "2026-10-08T12:00:00Z" }],
  ...over,
});
const COUNTS = { needs_signing: 2, to_send: 1, sent: 4, cancelled: 0, all: 7 };
let list;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  list = [RX()];
  api.get.mockImplementation((url) => {
    if (url === "/rx-meta/") return Promise.resolve({ data: META });
    if (url === "/rx/queues/") return Promise.resolve({ data: { counts: COUNTS } });
    if (url === "/rx/") return Promise.resolve({ data: { count: list.length, results: list } });
    if (url === "/header/3/") return Promise.resolve({ data: { items: [{ key: "name", label: "Name", value: "LEE, ANN", emphasis: "strong" }, { key: "allergies", label: "Allergies", value: "Penicillin", emphasis: "alert" }] } });
    if (url === "/patients/") return Promise.resolve({ data: { results: [{ user_id: 3, first_name: "Ann", last_name: "Lee" }] } });
    if (url === "/patient-pharmacy/3/") return Promise.resolve({ data: { pharmacy: null } });
    if (url === "/pharmacies/") return Promise.resolve({ data: [] });
    const m = /^\/rx\/(\d+)\/$/.exec(url);
    if (m) return Promise.resolve({ data: list.find((r) => String(r.id) === m[1]) });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
});
afterEach(() => window.sessionStorage.clear());

const ME = { role: "doctor", id: 5 };
const remember = (patient) => window.sessionStorage.setItem("powerSelectedPatient:5", JSON.stringify(patient));
const listCalls = () => api.get.mock.calls.filter((c) => c[0] === "/rx/");
const choose = async (label, option) => {
  fireEvent.mouseDown(screen.getByLabelText(label));
  fireEvent.click(await screen.findByRole("option", { name: option }));
};

test("shows queue counts and the prescription rows, starting on Needs signing", async () => {
  render(<PrescriptionWorklist me={ME} />);
  await screen.findByTestId("rx-row-11");
  expect(await screen.findByTestId("rx-queue-needs_signing")).toHaveTextContent("Needs signing (2)");
  expect(screen.getByTestId("rx-queue-to_send")).toHaveTextContent("To print or fax (1)");
  expect(screen.getByTestId("rx-queue-all")).toHaveTextContent(/^All$/);
  expect(screen.getByTestId("rx-row-11")).toHaveTextContent("Ann Lee");
  expect(screen.getByTestId("rx-row-11")).toHaveTextContent("Amoxicillin 500 mg capsule");
  expect(listCalls()[0][1].params).toMatchObject({ queue: "needs_signing" });
});

test("choosing a queue asks the server for it", async () => {
  render(<PrescriptionWorklist me={ME} />);
  await screen.findByTestId("rx-row-11");
  fireEvent.click(screen.getByTestId("rx-queue-sent"));
  await waitFor(() => expect(listCalls().pop()[1].params.queue).toBe("sent"));
});

test("the search and prescriber filters go to the list and to the counts", async () => {
  render(<PrescriptionWorklist me={ME} />);
  await screen.findByTestId("rx-row-11");
  await choose("Prescriber", "Me");
  await waitFor(() => expect(listCalls().pop()[1].params.prescriber).toBe("me"));
  fireEvent.change(screen.getByTestId("rx-search"), { target: { value: "amox" } });
  await waitFor(() => expect(listCalls().pop()[1].params.q).toBe("amox"));
  const counts = api.get.mock.calls.filter((c) => c[0] === "/rx/queues/").pop();
  expect(counts[1].params).toMatchObject({ prescriber: "me", q: "amox" });
  expect(counts[1].params.queue).toBeUndefined();
});

test("another doctor can be chosen as the prescriber", async () => {
  render(<PrescriptionWorklist me={ME} />);
  await screen.findByTestId("rx-row-11");
  await choose("Prescriber", "Dr Grey");
  await waitFor(() => expect(listCalls().pop()[1].params.prescriber).toBe("6"));
});

test("an empty queue says so", async () => {
  list = [];
  render(<PrescriptionWorklist me={ME} />);
  expect(await screen.findByTestId("rx-empty")).toHaveTextContent("No prescriptions in this list.");
});

test("opening a row shows the prescription with the steps the server allows", async () => {
  render(<PrescriptionWorklist me={ME} />);
  fireEvent.click(await screen.findByTestId("rx-row-11"));
  expect(await screen.findByTestId("rx-sign")).toBeInTheDocument();
});

test("New prescription asks who it is for, then opens the writer for that patient", async () => {
  render(<PrescriptionWorklist me={ME} />);
  await screen.findByTestId("rx-row-11");
  fireEvent.click(screen.getByTestId("rx-new"));
  fireEvent.change(await screen.findByTestId("rx-patient-search"), { target: { value: "Ann" } });
  fireEvent.keyDown(screen.getByTestId("rx-patient-search"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: /Ann Lee/ }));
  fireEvent.click(screen.getByTestId("rx-patient-continue"));
  expect(await screen.findByText(/New prescription — Ann Lee/)).toBeInTheDocument();
});

test("a nurse can write but the doctor-only button is hidden; a registrar is turned away", async () => {
  const { unmount } = render(<PrescriptionWorklist me={{ role: "nurse", id: 8 }} />);
  await screen.findByTestId("rx-row-11");
  expect(screen.getByTestId("rx-new")).toBeInTheDocument();
  expect(screen.queryByTestId("rx-my-details")).not.toBeInTheDocument();
  unmount();
  api.get.mockReset();
  api.get.mockRejectedValue({ response: { status: 403, data: { detail: "Not allowed." } } });
  render(<PrescriptionWorklist me={{ role: "registrar", id: 9 }} />);
  expect(await screen.findByTestId("rx-denied")).toBeInTheDocument();
});

test("a failed load shows the server's message", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/rx-meta/") return Promise.resolve({ data: META });
    if (url === "/rx/queues/") return Promise.resolve({ data: { counts: COUNTS } });
    return Promise.reject({ response: { status: 500, data: { detail: "Server hiccup." } } });
  });
  render(<PrescriptionWorklist me={ME} />);
  expect(await screen.findByTestId("rx-list-error")).toHaveTextContent("Server hiccup.");
});

describe("patient banner and Patients filter (like the Task and Referral Managers)", () => {
  test("with a patient last selected, the banner and that patient's prescriptions show first", async () => {
    remember({ id: 3, name: "Ann Lee" });
    render(<PrescriptionWorklist me={ME} />);
    const banner = await screen.findByTestId("rx-patient-banner");
    await waitFor(() => expect(banner).toHaveTextContent("LEE, ANN"));
    expect(banner).toHaveTextContent("Penicillin");
    await waitFor(() => expect(listCalls().pop()[1].params.patient).toBe(3));
    expect(screen.getByTestId("rx-filter-patients")).toHaveValue("patient");
    expect(api.get.mock.calls.filter((c) => c[0] === "/rx/queues/").pop()[1].params.patient).toBe(3);
  });

  test("choosing All patients removes the banner and the patient can be chosen again", async () => {
    remember({ id: 3, name: "Ann Lee" });
    render(<PrescriptionWorklist me={ME} />);
    await screen.findByTestId("rx-patient-banner");
    await choose("Patients", "All patients");
    await waitFor(() => expect(screen.queryByTestId("rx-patient-banner")).not.toBeInTheDocument());
    await waitFor(() => expect(listCalls().pop()[1].params.patient).toBeUndefined());
    await choose("Patients", "Ann Lee");
    await screen.findByTestId("rx-patient-banner");
  });

  test("with nobody selected there is no banner, and the writer starts with the patient picker", async () => {
    render(<PrescriptionWorklist me={ME} />);
    await screen.findByTestId("rx-row-11");
    expect(screen.queryByTestId("rx-patient-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("rx-filter-patients")).toHaveValue("");
  });

  test("with a patient selected, New prescription goes straight to the writer", async () => {
    remember({ id: 3, name: "Ann Lee" });
    render(<PrescriptionWorklist me={ME} />);
    await screen.findByTestId("rx-row-11");
    fireEvent.click(screen.getByTestId("rx-new"));
    expect(await screen.findByText(/New prescription — Ann Lee/)).toBeInTheDocument();
    expect(screen.queryByTestId("rx-patient-picker")).not.toBeInTheDocument();
  });

  test("the banner sits above the heading", async () => {
    remember({ id: 3, name: "Ann Lee" });
    render(<PrescriptionWorklist me={ME} />);
    const banner = await screen.findByTestId("rx-patient-banner");
    expect(banner.compareDocumentPosition(screen.getByText("Prescription Manager")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
