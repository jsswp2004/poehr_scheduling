import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockNavigate = jest.fn();
let mockPath = "/patients";
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPath }),
  Navigate: ({ to }) => <div data-testid="navigate">{to}</div>,
  Link: ({ children }) => <a href="/">{children}</a>,
}), { virtual: true });
jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({
  apiEndpoints: {
    portalMe: "/portal/me/",
    portalRx: "/portal/rx/",
    portalRxDetail: (id) => `/portal/rx/${id}/`,
    portalRxAction: (id) => `/portal/rx/${id}/action/`,
    portalRxRequests: (id) => `/portal/rx/${id}/requests/`,
    portalClaim: "/portal/claim/",
    portalNotices: "/portal/notices/",
    portalRegister: "/portal/register/",
    pharmacyNetwork: "/network/",
    pharmacyNetworkStatus: (id) => `/network/${id}/status/`,
    pharmacyNetworkAdd: (id) => `/network/${id}/add/`,
    pharmacyPortalRespond: (id) => `/portal-requests/${id}/respond/`,
    pharmacyPortalReroute: (id) => `/portal-reroute/${id}/`,
    pharmacyPortalAccessLog: "/portal-access-log/",
    portalStaff: "/portal/staff/",
    portalStaffDetail: (id) => `/portal/staff/${id}/`,
  },
}), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: jest.fn() }));

import { jwtDecode } from "jwt-decode";
import { api } from "../../api/client";
import PrivateRoute from "../PrivateRoute";
import PharmacyPortalPage, { ClaimDialog } from "../../pages/PharmacyPortalPage";
import PharmacyPortalRegisterPage from "../../pages/PharmacyPortalRegisterPage";
import PortalRxDialog from "../pharmacyPortal/PortalRxDialog";
import PortalPharmaciesPanel from "../pharmacy/PortalPharmaciesPanel";
import PortalSection from "../prescriptions/PortalSection";
import PortalStaffDialog from "../pharmacyPortal/PortalStaffDialog";
import PortalAccessLogDialog from "../pharmacy/PortalAccessLogDialog";
import { landingPath, postLoginPath } from "../../utils/landing";

const signIn = (role) => {
  window.localStorage.setItem("access_token", "t");
  jwtDecode.mockReturnValue({ role });
};

const ME = {
  user: { name: "Andres Bonifacio", role: "ext_pharmacist", prc_number: "0045678", can_dispense: true },
  pharmacy: { name: "Mercury Drug Cubao", fda_lto_number: "LTO-3000011111", lto_expiry: "2027-11-21" },
  problem: "",
  unread_notices: 2,
};
const ROW = {
  id: 9, rx_number: "RX-000042", status: "new", status_label: "New", how: "routed",
  patient: { name: "Reyes, Corazon", birthdate: "1958-03-14", age: 68 },
  drug: { generic: "Losartan potassium", brand: "Cozaar", display: "Losartan potassium (Cozaar)" },
  strength: "50 mg", form: "tablet", sig: "Take 1 tablet by mouth once daily.", quantity: "30", quantity_unit: "tablets",
  balance: "30", refills: 1, fill_number: 1, dangerous_drug: false, prescriber: "Rizal, Jose", clinic: "Klinika ng Bayan",
  signed_at: "2026-11-21T01:00:00Z", pending_requests: [], updated_at: "2026-11-21T01:00:00Z",
};
const DETAIL = {
  ...ROW, allergies: [{ substance: "Penicillin", reaction: "Hives", severity: "severe" }], no_known_allergies: false,
  dispense_as_written: false, note_to_pharmacist: "", prescriber_license: "0123456", clinic_phone: "", is_yellow_rx: false,
  yellow_rx_serial: "", s2_number: "", decline_reason: "", rx_cancelled: false, cancel_reason: "", dispenses: [], requests: [],
};

beforeEach(() => {
  window.localStorage.clear();
  jwtDecode.mockReset();
  api.get.mockReset();
  api.post.mockReset();
  mockNavigate.mockReset();
  mockPath = "/patients";
});

describe("portal accounts are locked to the portal", () => {
  test("an external pharmacist opening an internal page is sent to the portal", () => {
    signIn("ext_pharmacist");
    render(<PrivateRoute><div>PATIENT LIST</div></PrivateRoute>);
    expect(screen.queryByText("PATIENT LIST")).toBeNull();
    expect(screen.getByTestId("navigate")).toHaveTextContent("/pharmacy-portal");
  });

  test("the portal itself opens for them, and clinic staff keep their pages", () => {
    signIn("ext_pharmacy_admin");
    mockPath = "/pharmacy-portal";
    const { unmount } = render(<PrivateRoute><div>PORTAL</div></PrivateRoute>);
    expect(screen.getByText("PORTAL")).toBeInTheDocument();
    unmount();
    signIn("doctor");
    mockPath = "/patients";
    render(<PrivateRoute><div>PATIENT LIST</div></PrivateRoute>);
    expect(screen.getByText("PATIENT LIST")).toBeInTheDocument();
  });

  test("they land on the portal after signing in", () => {
    expect(postLoginPath("ext_pharmacist", [])).toBe("/pharmacy-portal");
    expect(landingPath("ext_pharmacy_admin", null)).toBe("/pharmacy-portal");
  });

  test("clinic staff opening the portal page are sent away", () => {
    signIn("doctor");
    render(<PharmacyPortalPage />);
    expect(mockNavigate).toHaveBeenCalledWith("/solutions", { replace: true });
  });
});

describe("portal page", () => {
  test("six tabs with counts and the pharmacy's prescriptions", async () => {
    signIn("ext_pharmacist");
    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url === "/portal/me/" ? ME : { counts: { new: 1, in_progress: 2, ready: 0, changes: 1, renewals: 0, history: 7 }, results: [ROW] } })
    );
    render(<PharmacyPortalPage />);
    await screen.findByTestId("portal-row-9");
    expect(screen.getByTestId("portal-pharmacy-name")).toHaveTextContent("Mercury Drug Cubao · FDA LTO LTO-3000011111");
    ["New (1)", "In progress (2)", "Ready (0)", "Changes (1)", "Renewals (0)", "History (7)"].forEach((label, i) =>
      expect(screen.getByTestId(`portal-tab-${["new", "in_progress", "ready", "changes", "renewals", "history"][i]}`)).toHaveTextContent(label)
    );
    const drug = screen.getByTestId("portal-drug-9").textContent;
    expect(drug.indexOf("Losartan potassium")).toBeLessThan(drug.indexOf("(Cozaar)"));
  });

  test("a pending pharmacy sees why it can't work yet", async () => {
    signIn("ext_pharmacy_admin");
    api.get.mockResolvedValue({ data: { ...ME, problem: "Your pharmacy is waiting for approval by POWER." } });
    render(<PharmacyPortalPage />);
    expect(await screen.findByTestId("portal-problem")).toHaveTextContent("waiting for approval");
    expect(screen.getByTestId("portal-claim")).toBeDisabled();
  });

  test("claim sends the code and the patient's birthdate", async () => {
    api.post.mockResolvedValue({ data: DETAIL });
    const onClaimed = jest.fn();
    render(<ClaimDialog open onClose={() => {}} onClaimed={onClaimed} />);
    fireEvent.change(screen.getByTestId("claim-code"), { target: { value: "K7PQ2M9X" } });
    fireEvent.change(screen.getByTestId("claim-birthdate"), { target: { value: "1958-03-14" } });
    expect(screen.getByTestId("claim-submit")).toBeDisabled(); // the last 4 digits of the mobile number are needed too
    fireEvent.change(screen.getByTestId("claim-mobile"), { target: { value: "0917-4567" } });
    expect(screen.getByTestId("claim-mobile")).toHaveValue("0917");
    fireEvent.change(screen.getByTestId("claim-mobile"), { target: { value: "4567" } });
    fireEvent.click(screen.getByTestId("claim-submit"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/portal/claim/", { code: "K7PQ2M9X", birthdate: "1958-03-14", mobile_last4: "4567" }, expect.anything()));
    await waitFor(() => expect(onClaimed).toHaveBeenCalled());
  });
});

describe("one prescription", () => {
  test("minimum patient data, accept, and decline with a reason", async () => {
    api.get.mockResolvedValue({ data: DETAIL });
    api.post.mockResolvedValue({ data: { ...DETAIL, status: "in_progress" } });
    render(<PortalRxDialog open rxId={9} me={ME} onClose={() => {}} />);
    expect(await screen.findByTestId("portal-patient")).toHaveTextContent("Reyes, Corazon");
    expect(screen.getByTestId("portal-patient")).toHaveTextContent("Born 1958-03-14 · 68 y");
    expect(screen.getByTestId("portal-allergies")).toHaveTextContent("Penicillin: Hives");
    fireEvent.click(screen.getByTestId("portal-decline"));
    expect(screen.getByTestId("portal-decline-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("portal-reason"), { target: { value: "Not stocked" } });
    fireEvent.click(screen.getByTestId("portal-decline-confirm"));
    await waitFor(() => expect(api.post.mock.calls[0][1]).toEqual({ action: "decline", reason: "Not stocked" }));
  });

  test("Filled sits beside Accept: accept and mark ready for pickup in one click", async () => {
    api.get.mockResolvedValue({ data: DETAIL });
    api.post.mockResolvedValue({ data: { ...DETAIL, status: "ready" } });
    render(<PortalRxDialog open rxId={9} me={ME} onClose={() => {}} />);
    const filled = await screen.findByTestId("portal-filled");
    expect(screen.getByTestId("portal-accept")).toBeInTheDocument();
    expect(filled).toHaveTextContent("Filled");
    fireEvent.click(filled);
    await waitFor(() => expect(api.post.mock.calls[0][1]).toEqual({ action: "filled" }));
  });

  test("dispense records the actual product (generic substitution) and the senior ID", async () => {
    api.get.mockResolvedValue({ data: { ...DETAIL, status: "ready", status_label: "Ready for pickup" } });
    api.post.mockResolvedValue({ data: { ...DETAIL, status: "dispensed" } });
    render(<PortalRxDialog open rxId={9} me={ME} onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("portal-open-dispense"));
    fireEvent.change(screen.getByTestId("portal-brand_name"), { target: { value: "Lifezar" } });
    fireEvent.change(screen.getByTestId("portal-manufacturer"), { target: { value: "Unilab" } });
    fireEvent.change(screen.getByTestId("portal-discount_id_type"), { target: { value: "senior" } });
    expect(screen.getByTestId("portal-dispense-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("portal-discount_id_number"), { target: { value: "QC-SC-2019-004512" } });
    fireEvent.click(screen.getByTestId("portal-dispense-confirm"));
    await waitFor(() => expect(api.post.mock.calls[0][1]).toMatchObject({
      action: "dispense", quantity: "30", generic_name: "Losartan potassium", brand_name: "Lifezar", manufacturer: "Unilab",
      discount_id_type: "senior", discount_id_number: "QC-SC-2019-004512",
    }));
  });

  test("a dangerous drug needs the yellow Rx serial and the original in hand, and offers no refill", async () => {
    api.get.mockResolvedValue({ data: { ...DETAIL, status: "in_progress", dangerous_drug: true, refills: 0, drug: { generic: "Morphine sulfate", brand: "", display: "Morphine sulfate" } } });
    api.post.mockResolvedValue({ data: DETAIL });
    render(<PortalRxDialog open rxId={9} me={ME} onClose={() => {}} />);
    expect(await screen.findByTestId("portal-dangerous")).toHaveTextContent("original prescription in hand");
    fireEvent.click(screen.getByTestId("portal-open-dispense"));
    fireEvent.change(screen.getByTestId("portal-yellow_rx_serial"), { target: { value: "DDB-2026-0007777" } });
    expect(screen.getByTestId("portal-dispense-confirm")).toBeDisabled();
    fireEvent.click(screen.getByTestId("portal-original_in_hand"));
    fireEvent.click(screen.getByTestId("portal-dispense-confirm"));
    await waitFor(() => expect(api.post.mock.calls[0][1]).toMatchObject({ yellow_rx_serial: "DDB-2026-0007777", original_in_hand: true }));
  });

  test("only a pharmacist with a PRC number sees Dispense", async () => {
    api.get.mockResolvedValue({ data: { ...DETAIL, status: "ready" } });
    render(<PortalRxDialog open rxId={9} me={{ ...ME, user: { ...ME.user, can_dispense: false } }} onClose={() => {}} />);
    await screen.findByTestId("portal-status");
    expect(screen.queryByTestId("portal-open-dispense")).toBeNull();
  });

  test("a cancelled prescription shows the warning and no actions", async () => {
    api.get.mockResolvedValue({ data: { ...DETAIL, status: "cancelled", rx_cancelled: true, cancel_reason: "Wrong patient" } });
    render(<PortalRxDialog open rxId={9} me={ME} onClose={() => {}} />);
    expect(await screen.findByTestId("portal-cancelled")).toHaveTextContent("do not dispense");
    expect(screen.queryByTestId("portal-open-dispense")).toBeNull();
    expect(screen.queryByTestId("portal-accept")).toBeNull();
  });

  test("change request to the prescriber", async () => {
    api.get.mockResolvedValue({ data: { ...DETAIL, status: "in_progress" } });
    api.post.mockResolvedValue({ data: {} });
    render(<PortalRxDialog open rxId={9} me={ME} onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("portal-open-request"));
    fireEvent.change(screen.getByTestId("portal-kind"), { target: { value: "strength_form" } });
    fireEvent.change(screen.getByTestId("portal-message"), { target: { value: "We only have 100 mg tablets" } });
    fireEvent.click(screen.getByTestId("portal-send-request"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/portal/rx/9/requests/", { kind: "strength_form", message: "We only have 100 mg tablets", proposed: "" }, expect.anything()));
  });
});

test("registration sends the LTO and the pharmacists' PRC numbers", async () => {
  api.post.mockResolvedValue({ data: { pharmacy: { name: "Botica Boie Davao" }, username: "boie_admin" } });
  render(<PharmacyPortalRegisterPage />);
  const type = (id, value) => fireEvent.change(screen.getByTestId(id), { target: { value } });
  type("reg-name", "Botica Boie Davao");
  type("reg-fda_lto_number", "LTO-3000033333");
  type("reg-lto_expiry", "2027-11-21");
  type("reg-email", "boie@example.ph");
  type("reg-username", "boie_admin");
  type("reg-password", "a-long-password-1");
  type("reg-ph-name-0", "Juan Dela Cruz");
  type("reg-ph-prc-0", "0033445");
  type("reg-sms_mobile", "0917 555 0101");
  type("reg-ph-mobile-0", "0919 555 0103");
  fireEvent.click(screen.getByTestId("reg-submit"));
  expect(await screen.findByTestId("reg-done")).toHaveTextContent("Botica Boie Davao is registered");
  expect(api.post.mock.calls[0][1]).toMatchObject({ fda_lto_number: "LTO-3000033333", lto_expiry: "2027-11-21", pharmacists: [{ full_name: "Juan Dela Cruz", prc_number: "0033445", mobile: "0919 555 0103" }], sms_mobile: "0917 555 0101" });
});

describe("clinic side", () => {
  const PARTNER = { id: 3, name: "Botica Boie Davao", city: "Davao City", province: "Davao del Sur", fda_lto_number: "LTO-3000033333", lto_expiry: "2027-11-21", lto_expired: false, status: "pending", status_label: "Pending approval", status_reason: "", can_receive: false, in_directory: false, pharmacists: [{ full_name: "Juan Dela Cruz", prc_number: "0033445" }] };

  test("a POWER administrator approves a pending pharmacy", async () => {
    api.get.mockResolvedValue({ data: { results: [PARTNER], can_approve: true } });
    api.post.mockResolvedValue({ data: {} });
    render(<PortalPharmaciesPanel />);
    expect(await screen.findByTestId("partner-row-3")).toHaveTextContent("Juan Dela Cruz 0033445");
    fireEvent.click(screen.getByTestId("partner-approve-3"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/network/3/status/", { action: "approve", reason: "" }, expect.anything()));
  });

  test("clinic staff add an approved pharmacy to their directory", async () => {
    api.get.mockResolvedValue({ data: { results: [{ ...PARTNER, status: "approved", status_label: "Approved", can_receive: true, pharmacists: undefined }], can_approve: false } });
    api.post.mockResolvedValue({ data: {} });
    render(<PortalPharmaciesPanel />);
    fireEvent.click(await screen.findByTestId("partner-add-3"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/network/3/add/", {}, expect.anything()));
  });

  test("the prescriber sees the claim code and answers a pharmacy's request", async () => {
    api.post.mockResolvedValue({ data: {} });
    const onChanged = jest.fn();
    render(
      <PortalSection
        rx={{
          claim_code: "K7PQ2M9X",
          portal: { status: "in_progress", status_label: "In progress", pharmacy: "Mercury Drug Cubao", how: "routed", decline_reason: "", dispenses: [] },
          pharmacy_requests: [{ id: 4, kind: "strength_form", kind_label: "Different strength or form", pharmacy: "Mercury Drug Cubao", message: "Only 100 mg in stock", proposed: "100 mg, half tablet", status: "pending", created_at: "2026-11-21T02:00:00Z" }],
        }}
        onChanged={onChanged}
      />
    );
    expect(screen.getByTestId("rx-claim-code")).toHaveTextContent("K7PQ2M9X");
    expect(screen.getByTestId("rx-portal-status")).toHaveTextContent("In progress");
    expect(screen.getByTestId("rx-portal-deny-4")).toBeDisabled(); // a denial needs a reason
    fireEvent.change(screen.getByTestId("rx-portal-answer-4"), { target: { value: "OK: half a 100 mg tablet daily" } });
    fireEvent.click(screen.getByTestId("rx-portal-approve-4"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/portal-requests/4/respond/", { decision: "approved", response: "OK: half a 100 mg tablet daily" }, expect.anything()));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});


describe("Phase 3 follow-ups", () => {
  test("a pharmacy admin who is not a pharmacist can neither claim nor accept", async () => {
    signIn("ext_pharmacy_admin");
    const adminMe = { ...ME, user: { ...ME.user, role: "ext_pharmacy_admin", can_dispense: false } };
    api.get.mockImplementation((url) => Promise.resolve({ data: url === "/portal/me/" ? adminMe : url === "/portal/rx/9/" ? DETAIL : { counts: {}, results: [] } }));
    const { unmount } = render(<PharmacyPortalPage />);
    await waitFor(() => expect(screen.getByTestId("portal-claim")).toBeDisabled());
    unmount();
    render(<PortalRxDialog open rxId={9} me={adminMe} onClose={() => {}} />);
    await screen.findByTestId("portal-decline");
    expect(screen.queryByTestId("portal-accept")).toBeNull();
    expect(screen.queryByTestId("portal-filled")).toBeNull();
  });

  test("staff screen: add with PRC and email, edit, deactivate", async () => {
    api.get.mockResolvedValue({ data: { can_manage: true, results: [{ id: 2, full_name: "Andres Bonifacio", prc_number: "0045678", email: "andres@example.ph", username: "rph", is_admin: false, has_login: true, is_active: true }] } });
    api.post.mockResolvedValue({ data: {} });
    api.patch.mockResolvedValue({ data: {} });
    render(<PortalStaffDialog open onClose={() => {}} />);
    await screen.findByTestId("staff-row-2");
    fireEvent.change(screen.getByTestId("staff-full_name"), { target: { value: "Melchora Aquino" } });
    fireEvent.change(screen.getByTestId("staff-prc_number"), { target: { value: "0055667" } });
    expect(screen.getByTestId("staff-add-save")).toBeDisabled(); // an email is needed
    fireEvent.change(screen.getByTestId("staff-email"), { target: { value: "melchora@example.ph" } });
    fireEvent.click(screen.getByTestId("staff-add-save"));
    await waitFor(() => expect(api.post.mock.calls[0][1]).toMatchObject({ full_name: "Melchora Aquino", prc_number: "0055667", email: "melchora@example.ph" }));
    fireEvent.click(screen.getByTestId("staff-edit-2"));
    fireEvent.change(screen.getByTestId("staff-edit-email"), { target: { value: "a.bonifacio@example.ph" } });
    fireEvent.change(screen.getByTestId("staff-edit-mobile"), { target: { value: "0917 123 4567" } });
    fireEvent.click(screen.getByTestId("staff-edit-save"));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/portal/staff/2/", { full_name: "Andres Bonifacio", prc_number: "0045678", email: "a.bonifacio@example.ph", mobile: "0917 123 4567" }, expect.anything()));
    fireEvent.click(await screen.findByTestId("staff-toggle-2"));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/portal/staff/2/", { is_active: false }, expect.anything()));
  });

  test("POWER admins filter the access log and export CSV", async () => {
    window.URL.createObjectURL = jest.fn(() => "blob:x");
    window.URL.revokeObjectURL = jest.fn();
    api.get.mockImplementation((url, cfg) => Promise.resolve({ data: cfg.params.export ? "csv" : { results: [{ id: 1, at: "2026-11-21T03:00:00Z", user: "rph", name: "Bonifacio, Andres", pharmacy: "Mercury Drug Cubao", action: "view", prescription: "RX-000042", ip: "10.0.0.5" }] } }));
    render(<PortalAccessLogDialog open onClose={() => {}} pharmacies={[{ id: 3, name: "Mercury Drug Cubao" }]} />);
    expect(await screen.findByTestId("log-row-1")).toHaveTextContent("RX-000042");
    fireEvent.change(screen.getByTestId("log-user"), { target: { value: "rph" } });
    fireEvent.click(screen.getByTestId("log-search"));
    await waitFor(() => expect(api.get.mock.calls.some((c) => c[1].params.user === "rph")).toBe(true));
    fireEvent.click(screen.getByTestId("log-export"));
    await waitFor(() => expect(api.get.mock.calls.some((c) => c[1].params.export === "csv" && c[1].responseType === "blob")).toBe(true));
  });

  test("a declined prescription: the prescriber re-routes it or issues a new code", async () => {
    api.get.mockResolvedValue({ data: { results: [{ id: 5, name: "Watsons Iloilo", in_directory: true, can_receive: true, directory_pharmacy_id: 77 }] } });
    api.post.mockResolvedValue({ data: {} });
    render(
      <PortalSection
        rx={{ id: 42, claim_code: "K7PQ2M9X", pharmacy_requests: [], portal: { status: "declined", status_label: "Declined (back with the prescriber)", pharmacy: "", how: "", decline_reason: "Out of stock", dispenses: [] } }}
        onChanged={() => {}}
      />
    );
    expect(screen.getByTestId("rx-portal-declined")).toHaveTextContent("No other pharmacy can claim it");
    fireEvent.click(screen.getByTestId("rx-portal-new-code"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/portal-reroute/42/", { new_code: true }, expect.anything()));
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId("rx-portal-reroute-target"), { target: { value: "77" } });
    fireEvent.click(screen.getByTestId("rx-portal-reroute"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/portal-reroute/42/", { pharmacy: 77 }, expect.anything()));
  });
});
