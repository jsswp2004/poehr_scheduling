import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({
  apiEndpoints: {
    portalPharmacy: "/portal/pharmacy/",
    pharmacyNetworkChanges: (id) => `/network/${id}/changes/`,
    pharmacyNetworkChangeReview: (id, cid) => `/network/${id}/changes/${cid}/review/`,
  },
}), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { api } from "../../api/client";
import PortalPharmacyDetailsDialog from "../pharmacyPortal/PortalPharmacyDetailsDialog";
import PartnerChangesDialog from "../pharmacy/PartnerChangesDialog";

const LABELS = {
  address: "Street address", barangay: "Barangay", city: "City / municipality", province: "Province", phone: "Phone (landline)",
  email: "Contact email", sms_mobile: "Mobile number for SMS", name: "Registered pharmacy name", fda_lto_number: "FDA LTO number", lto_expiry: "LTO valid until",
};
const PHARMACY = {
  address: "1245 Aurora Boulevard", barangay: "Pansol", city: "Quezon City", province: "Metro Manila", phone: "(02) 8555 0142",
  email: "botika.alingnena.demo@example.ph", sms_mobile: "", name: "Botika ni Aling Nena (DEMO)", fda_lto_number: "DEMO-LTO-3000012345",
  lto_expiry: "2027-11-21", status: "approved", status_label: "Approved", problem: "",
};
const DATA = (over = {}) => ({
  pharmacy: PHARMACY, labels: LABELS, can_edit: true, pending: null, history: [],
  contact_fields: ["address", "barangay", "city", "province", "phone", "email", "sms_mobile"], regulatory_fields: ["name", "fda_lto_number", "lto_expiry"],
  ...over,
});
const PENDING = {
  id: 7, kind: "regulatory", status: "pending", status_label: "Pending POWER review", at: "2026-11-22T09:00:00Z", user: "Nena Dizon (DEMO)",
  changes: { fda_lto_number: ["DEMO-LTO-3000012345", "DEMO-LTO-3000099999"] }, labels: { fda_lto_number: "FDA LTO number" },
  reviewed_by: "", reviewed_at: null, review_note: "",
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
});

test("the pharmacy administrator edits contact details; only changed fields are sent", async () => {
  api.get.mockResolvedValue({ data: DATA() });
  api.patch.mockResolvedValue({ data: DATA({ pharmacy: { ...PHARMACY, sms_mobile: "+639175550101" } }) });
  render(<PortalPharmacyDetailsDialog open onClose={() => {}} />);
  expect(await screen.findByTestId("details-address")).toHaveValue("1245 Aurora Boulevard");
  expect(screen.getByTestId("details-save")).toBeDisabled(); // nothing changed yet
  fireEvent.change(screen.getByTestId("details-sms_mobile"), { target: { value: "0917 555 0101" } });
  fireEvent.click(screen.getByTestId("details-save"));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/portal/pharmacy/", { sms_mobile: "0917 555 0101" }, expect.anything()));
});

test("a pharmacist sees the details read-only", async () => {
  api.get.mockResolvedValue({ data: DATA({ can_edit: false }) });
  render(<PortalPharmacyDetailsDialog open onClose={() => {}} />);
  expect(await screen.findByTestId("details-readonly")).toHaveTextContent("Only your pharmacy's administrator");
  expect(screen.getByTestId("details-city")).toBeDisabled();
  expect(screen.queryByTestId("details-save")).toBeNull();
});

test("a pending registered name / LTO change shows the Pending POWER review banner and locks those fields", async () => {
  api.get.mockResolvedValue({ data: DATA({ pending: PENDING, history: [PENDING] }) });
  render(<PortalPharmacyDetailsDialog open onClose={() => {}} />);
  const banner = await screen.findByTestId("details-pending");
  expect(banner).toHaveTextContent("Pending POWER review");
  expect(banner).toHaveTextContent("FDA LTO number: DEMO-LTO-3000012345 → DEMO-LTO-3000099999");
  expect(screen.getByTestId("details-fda_lto_number")).toBeDisabled();
  expect(screen.getByTestId("details-city")).not.toBeDisabled();
  expect(screen.getByTestId("details-history")).toHaveTextContent("Nena Dizon (DEMO)");
});

test("eRx Routing: a System Admin approves or rejects (with a reason) the pending change", async () => {
  api.get.mockResolvedValue({ data: { results: [PENDING] } });
  api.post.mockResolvedValue({ data: {} });
  const onReviewed = jest.fn();
  render(<PartnerChangesDialog partner={{ id: 3, name: "Botika ni Aling Nena (DEMO)", pending_change: PENDING }} onClose={() => {}} onReviewed={onReviewed} />);
  expect(await screen.findByTestId("partner-pending")).toHaveTextContent("DEMO-LTO-3000099999");
  expect(screen.getByTestId("partner-review-reject")).toBeDisabled(); // a reason is needed to reject
  fireEvent.click(screen.getByTestId("partner-review-approve"));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/network/3/changes/7/review/", { decision: "approve", note: "" }, expect.anything()));
  await waitFor(() => expect(onReviewed).toHaveBeenCalled());
  expect(await screen.findByTestId("partner-history")).toHaveTextContent("Pending POWER review");
});
