import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const mockNavigate = jest.fn();
let mockPath = "/patients";
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPath, search: "" }),
  Navigate: ({ to }) => <div data-testid="navigate">{to}</div>,
  Link: ({ children }) => <a href="/">{children}</a>,
}), { virtual: true });
jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({
  apiEndpoints: {
    labPortalMe: "/lab/me/",
    labPortalRequests: "/lab/requests/",
    labPortalRequest: (id) => `/lab/requests/${id}/`,
    labPortalAction: (id) => `/lab/requests/${id}/action/`,
    labPortalResults: (id) => `/lab/requests/${id}/results/`,
    labPortalReportFile: (id) => `/lab/requests/${id}/report-file/`,
    labPortalReportFileView: (id) => `/lab/requests/${id}/report-file/view/`,
    labPortalCriticalCall: (id) => `/lab/requests/${id}/critical-call/`,
    labPortalRelease: (id) => `/lab/requests/${id}/release/`,
    labPortalClaim: "/lab/claim/",
    labPortalNotices: "/lab/notices/",
    labPortalNoticeRead: (id) => `/lab/notices/${id}/read/`,
    labPortalStaff: "/lab/staff/",
    labPortalStaffDetail: (id) => `/lab/staff/${id}/`,
    labPortalRegister: "/lab/register/",
    labRequests: "/lab-requests/",
    labRequestCancel: (id) => `/lab-requests/${id}/cancel/`,
    clinicLabs: "/lab-requests/clinic-labs/",
  },
}), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("jwt-decode", () => ({ jwtDecode: jest.fn() }));
jest.mock("../pharmacyPortal/ClaimCameraScanner", () => () => null);

import { jwtDecode } from "jwt-decode";
import { api } from "../../api/client";
import PrivateRoute from "../PrivateRoute";
import LabPortalPage, { LabClaimDialog } from "../../pages/LabPortalPage";
import LabPortalRegisterPage from "../../pages/LabPortalRegisterPage";
import LabRequestDialog from "../labPortal/LabRequestDialog";
import SendToLabDialog, { sendableLabOrders } from "../labRequests/SendToLabDialog";
import LabRequestsTracker from "../labRequests/LabRequestsTracker";
import { landingPath } from "../../utils/landing";

const signIn = (role) => {
  window.localStorage.setItem("access_token", "t");
  jwtDecode.mockReturnValue({ role });
};

const ME = {
  user: { name: "Liza Aquino", role: "ext_lab_tech", license_number: "0098765", can_release: true, is_pathologist: false, is_admin: false },
  lab: { name: "Bayanihan Diagnostic Laboratory", country: "PH", license_number: "13-0456", license_expiry: "2027-11-21" },
  problem: "",
  unread_notices: 1,
};
const ROW = {
  id: 4, number: "LR-000004", status: "new", status_label: "New", how: "routed", priority: "stat", care_setting: "outpatient",
  collection: "at_lab", collection_label: "Patient goes to the lab", location: "",
  patient: { name: "Santos, Maria", birthdate: "1972-03-14", age: 54, sex: "F" },
  tests: [{ item: 7, name: "Complete blood count", status: "pending", has_draft: false }],
  clinic: "Klinika POWER", provider: "Cruz, Ana", updated_at: "2026-11-23T01:00:00Z", created_at: "2026-11-23T01:00:00Z",
};
const DETAIL = {
  ...ROW, country: "PH", fasting_required: false, note_to_lab: "", collect_by: null, provider_license: "PRC 0123456", clinic_phone: "",
  decline_reason: "", cancel_reason: "", collected_at: null, collected_by_name: "", accession_number: "", specimen_note: "",
  released_at: null, released_by_name: "", has_critical: false, critical_calls: [], report_file: null, events: [],
  items: [{ id: 7, order_number: "ORD-00000011", name: "Complete blood count", code: "", code_system: "", priority: "stat", indication: "", diagnoses: [], status: "pending", draft: {}, draft_saved_at: null, report_status: null }],
};

beforeEach(() => {
  window.localStorage.clear();
  jwtDecode.mockReset();
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
  mockNavigate.mockReset();
  mockPath = "/patients";
});

describe("lab portal accounts are locked to the lab portal", () => {
  test("a medical technologist opening an internal page is sent to the lab portal", () => {
    signIn("ext_lab_tech");
    render(<PrivateRoute><div>PATIENT LIST</div></PrivateRoute>);
    expect(screen.queryByText("PATIENT LIST")).toBeNull();
    expect(screen.getByTestId("navigate")).toHaveTextContent("/lab-portal");
  });

  test("they can't open the pharmacy portal either, and land on the lab portal", () => {
    signIn("ext_lab_pathologist");
    mockPath = "/pharmacy-portal";
    render(<PrivateRoute><div>PHARMACY</div></PrivateRoute>);
    expect(screen.getByTestId("navigate")).toHaveTextContent("/lab-portal");
    expect(landingPath("ext_lab_admin", null)).toBe("/lab-portal");
    expect(landingPath("ext_pharmacist", null)).toBe("/pharmacy-portal");
  });

  test("clinic staff opening the lab portal are sent away", () => {
    signIn("doctor");
    render(<LabPortalPage />);
    expect(mockNavigate).toHaveBeenCalledWith("/solutions", { replace: true });
  });
});

describe("lab portal page", () => {
  test("six tabs with counts and the lab's requests", async () => {
    signIn("ext_lab_tech");
    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url === "/lab/me/" ? ME : { counts: { new: 1, waiting: 2, collected: 0, in_process: 3, to_release: 1, history: 9 }, results: [ROW] } })
    );
    render(<LabPortalPage />);
    const row = await screen.findByTestId("lab-row-4");
    expect(within(row).getByText("Santos, Maria")).toBeInTheDocument();
    expect(within(row).getByText("STAT")).toBeInTheDocument();
    expect(screen.getByTestId("lab-portal-name")).toHaveTextContent("Bayanihan Diagnostic Laboratory · DOH LTO 13-0456");
    expect(screen.getByTestId("lab-tab-in_process")).toHaveTextContent("In process (3)");
    expect(screen.getByTestId("lab-tab-to_release")).toHaveTextContent("To release (1)");
  });

  test("a suspended lab sees why and no worklist", async () => {
    signIn("ext_lab_tech");
    api.get.mockResolvedValue({ data: { ...ME, problem: "Your laboratory is suspended." } });
    render(<LabPortalPage />);
    expect(await screen.findByTestId("lab-portal-problem")).toHaveTextContent("suspended");
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("lab-portal-claim")).toBeDisabled();
  });

  test("check-in sends the code, birthdate and last 4 digits", async () => {
    api.post.mockResolvedValue({ data: { id: 4 } });
    const onClaimed = jest.fn();
    render(<LabClaimDialog open onClose={() => {}} onClaimed={onClaimed} />);
    fireEvent.change(screen.getByTestId("lab-claim-code"), { target: { value: "abcd-2345" } });
    fireEvent.change(screen.getByTestId("lab-claim-birthdate"), { target: { value: "1972-03-14" } });
    fireEvent.change(screen.getByTestId("lab-claim-mobile"), { target: { value: "0199x" } });
    fireEvent.click(screen.getByTestId("lab-claim-submit"));
    await waitFor(() => expect(onClaimed).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toEqual({ code: "ABCD2345", birthdate: "1972-03-14", mobile_last4: "0199" });
  });
});

describe("a lab request", () => {
  test("a new request can be accepted, collected or declined", async () => {
    api.get.mockResolvedValue({ data: DETAIL });
    api.post.mockResolvedValue({ data: { ...DETAIL, status: "accepted", status_label: "Accepted" } });
    render(<LabRequestDialog open requestId={4} me={ME} onClose={() => {}} onChanged={() => {}} />);
    await screen.findByTestId("lab-accept");
    expect(screen.getByTestId("lab-collect")).toBeInTheDocument();
    expect(screen.queryByTestId("lab-save-results")).toBeNull();
    fireEvent.click(screen.getByTestId("lab-accept"));
    await waitFor(() => expect(screen.getByTestId("lab-request-status")).toHaveTextContent("Accepted"));
    expect(api.post).toHaveBeenCalledWith("/lab/requests/4/action/", { action: "accept" }, expect.anything());
  });

  test("results are saved per test, and a critical value asks for the call before release", async () => {
    const inProcess = {
      ...DETAIL, status: "in_process", status_label: "In process", has_critical: true,
      items: [{ ...DETAIL.items[0], draft: { items: [{ test_name: "Potassium", value: "6.9", units: "mmol/L", reference_range: "3.5-5.1", abnormal_flag: "HH" }] }, draft_saved_at: "2026-11-23T02:00:00Z" }],
    };
    api.get.mockResolvedValue({ data: inProcess });
    api.post.mockResolvedValue({ data: inProcess });
    render(<LabRequestDialog open requestId={4} me={ME} onClose={() => {}} onChanged={() => {}} />);
    expect(await screen.findByTestId("lab-critical")).toHaveTextContent("pathologist");
    expect(screen.getByTestId("call-log")).toBeDisabled();
    fireEvent.change(screen.getByTestId("line-value-7-0"), { target: { value: "7.0" } });
    fireEvent.click(screen.getByTestId("lab-save-results"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/lab/requests/4/results/");
    expect(body.items[0].item).toBe(7);
    expect(body.items[0].results[0]).toMatchObject({ test_name: "Potassium", value: "7.0", abnormal_flag: "HH" });
    expect(screen.getByTestId("lab-release-final")).not.toBeDisabled();
  });

  test("a test with no value yet is left out, so the ready tests can be saved", async () => {
    const two = {
      ...DETAIL, status: "in_process", status_label: "In process",
      items: [DETAIL.items[0], { ...DETAIL.items[0], id: 8, name: "Lipid panel", order_number: "ORD-00000012" }],
    };
    api.get.mockResolvedValue({ data: two });
    api.post.mockResolvedValue({ data: two });
    render(<LabRequestDialog open requestId={4} me={ME} onClose={() => {}} onChanged={() => {}} />);
    fireEvent.change(await screen.findByTestId("line-value-7-0"), { target: { value: "7.2" } });
    fireEvent.click(screen.getByTestId("lab-save-results"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1].items).toEqual([
      { item: 7, results: [expect.objectContaining({ test_name: "Complete blood count", value: "7.2" })] },
    ]);
  });

  test("someone who may not release sees the release buttons off", async () => {
    api.get.mockResolvedValue({ data: { ...DETAIL, status: "in_process", status_label: "In process" } });
    render(<LabRequestDialog open requestId={4} me={{ ...ME, user: { ...ME.user, can_release: false } }} onClose={() => {}} />);
    expect(await screen.findByTestId("lab-release-final")).toBeDisabled();
    expect(screen.getByTestId("lab-release-prelim")).toBeDisabled();
  });
});

describe("registration", () => {
  test("a Philippine lab gives its DOH license and waits for approval", async () => {
    render(<LabPortalRegisterPage />);
    expect(screen.getAllByText("DOH License to Operate number").length).toBeGreaterThan(0);
    api.post.mockResolvedValue({ data: { lab: { name: "Acme Labs" }, username: "acme" } });
    fireEvent.change(screen.getByTestId("labreg-name"), { target: { value: "Acme Labs" } });
    fireEvent.click(screen.getByTestId("labreg-submit"));
    expect(await screen.findByTestId("labreg-done")).toHaveTextContent("Acme Labs is registered");
    expect(api.post.mock.calls[0][1]).toMatchObject({ name: "Acme Labs", country: "PH", staff: [] });
  });
});

describe("the clinic side", () => {
  const ORDERS = [
    { id: 11, orderable_name: "Complete blood count", orderable_category: "laboratory", status: "active", interface_status: "not_sent" },
    { id: 12, orderable_name: "Lipid panel", orderable_category: "laboratory", status: "active", interface_status: "not_sent" },
    { id: 13, orderable_name: "Basic metabolic panel", orderable_category: "laboratory", status: "active", interface_status: "sent" },
    { id: 14, orderable_name: "Chest x-ray", orderable_category: "imaging", status: "active", interface_status: "not_sent" },
    { id: 15, orderable_name: "TSH", orderable_category: "laboratory", status: "draft", interface_status: "not_sent" },
  ];
  const LABS = { country: "PH", results: [{ id: 2, name: "Bayanihan", mode: "partner_portal", is_default: true, accepts_inpatient: true, partner: { id: 1, name: "Bayanihan Diagnostic Laboratory", hours: "", offers_bedside: true, offers_courier: false, problem: "" } }] };

  test("only signed lab orders not already sent can go to a lab", () => {
    expect(sendableLabOrders(ORDERS).map((o) => o.id)).toEqual([11, 12]);
  });

  test("one request per test by default, to the default lab", async () => {
    api.get.mockResolvedValue({ data: LABS });
    api.post.mockResolvedValue({ data: [{ number: "LR-000001" }, { number: "LR-000002" }] });
    const onSent = jest.fn();
    render(<SendToLabDialog open orders={ORDERS} onClose={() => {}} onSent={onSent} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/lab-requests/clinic-labs/", expect.anything()));
    await waitFor(() => expect(screen.getByTestId("send-to-lab-submit")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("send-to-lab-submit"));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toMatchObject({ orders: [11, 12], clinic_lab: "2", combine: false, care_setting: "outpatient", collection: "at_lab" });
  });

  test("the tracker shows the patient's code and lets the clinic cancel", async () => {
    api.get.mockResolvedValue({ data: [{
      id: 5, number: "LR-000005", status: "new", status_label: "New", lab: "Bayanihan Diagnostic Laboratory", claim_code: "ABCD2345",
      priority: "routine", care_setting: "outpatient", location: "", decline_reason: "", cancel_reason: "", updated_at: "2026-11-23T01:00:00Z",
      tests: [{ order: 11, name: "Complete blood count", status: "pending" }],
    }] });
    api.post.mockResolvedValue({ data: {} });
    render(<LabRequestsTracker patientId={3} canCancel />);
    expect(await screen.findByText("ABCD2345")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lab-request-cancel-5"));
    fireEvent.change(screen.getByTestId("lab-request-cancel-reason"), { target: { value: "Wrong test" } });
    fireEvent.click(screen.getByTestId("lab-request-cancel-confirm"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/lab-requests/5/cancel/", { reason: "Wrong test" }, expect.anything()));
  });
});
