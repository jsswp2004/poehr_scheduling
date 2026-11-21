import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockNavigate = jest.fn();
let mockPath = "/patients";
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPath }),
  Navigate: ({ to }) => <div data-testid="navigate">{to}</div>,
  Link: ({ children }) => <a href="/">{children}</a>,
}), { virtual: true });
jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
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
    fireEvent.click(screen.getByTestId("claim-submit"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/portal/claim/", { code: "K7PQ2M9X", birthdate: "1958-03-14" }, expect.anything()));
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
  fireEvent.click(screen.getByTestId("reg-submit"));
  expect(await screen.findByTestId("reg-done")).toHaveTextContent("Botica Boie Davao is registered");
  expect(api.post.mock.calls[0][1]).toMatchObject({ fda_lto_number: "LTO-3000033333", lto_expiry: "2027-11-21", pharmacists: [{ full_name: "Juan Dela Cruz", prc_number: "0033445" }] });
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
