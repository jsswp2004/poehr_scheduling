import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { orders: "/o", orderSets: "/os", ordersSign: "/o/sign", order: (id) => `/o/${id}`, orderAllergyCheck: (id) => `/o/${id}/allergy-check` } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "doctor", user_id: 1 }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });
jest.mock("../DynamicNoteForm", () => () => null, { virtual: true });
jest.mock("../IcdCodePicker", () => ({ __esModule: true, default: () => null, dxLabel: () => "" }), { virtual: true });
jest.mock("../LabResultsPanel", () => ({ __esModule: true, default: () => null }));

import { api } from "../../api/client";
import OrdersPanel from "../OrdersPanel";

const base = {
  orderable_category: "medication", priority: "routine", priority_display: "Routine", schedule: { dose: "2.25 g", route: "IV", frequency: "q6h" },
  diagnosis_codes: [], events: [], appointment: 55, ordering_provider: 1, ordering_provider_name: "Jose Rizal", created_at: "2026-11-20T08:00:00Z",
};
const ORDERS = [
  { ...base, id: 1, orderable_name: "Piperacillin-tazobactam 4.5 g IV", status: "active", status_display: "Active", pharmacy_status: "verified", pharmacy_status_display: "Verified", verified_by_name: "Andres Bonifacio", pharmacy_note: "Renal dose adjustment" },
  { ...base, id: 2, orderable_name: "Ketorolac 30 mg IV", status: "cancelled", status_display: "Cancelled", pharmacy_status: "rejected", pharmacy_status_display: "Rejected", verified_by_name: "", pharmacy_note: "Duplicate therapy" },
];

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/o" ? ORDERS : [] }));
  window.history.replaceState(null, "", "/patients/3/orders");
});

test("the prescriber sees what pharmacy did on each medication order", async () => {
  render(<OrdersPanel patientId={3} forcedSection="orders" chartVisit={{ loading: false, appointmentId: 55 }} />);
  fireEvent.click(await screen.findByText(/All \(2\)/));
  expect(await screen.findByTestId("order-pharmacy-1")).toHaveTextContent("Pharmacy: Verified by Andres Bonifacio · Renal dose adjustment");
  expect(screen.getByTestId("order-pharmacy-2")).toHaveTextContent("Pharmacy: Rejected · Duplicate therapy");
});

test("a cancelled (rejected) order is listed with the closed orders", async () => {
  render(<OrdersPanel patientId={3} forcedSection="orders" chartVisit={{ loading: false, appointmentId: 55 }} />);
  expect(await screen.findByText(/Completed \/ Discontinued \(1\)/)).toBeInTheDocument();
});
