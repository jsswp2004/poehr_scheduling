import { render, screen, waitFor } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { orders: "/o", orderables: "/orderables", orderSets: "/os", ordersSign: "/o/sign", order: (id) => `/o/${id}`, orderAllergyCheck: (id) => `/o/${id}/allergy-check` } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "pharmacist", user_id: 7 }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }), { virtual: true });
jest.mock("../DynamicNoteForm", () => () => null, { virtual: true });
jest.mock("../IcdCodePicker", () => ({ __esModule: true, default: () => null, dxLabel: () => "" }), { virtual: true });
jest.mock("../LabResultsPanel", () => ({ __esModule: true, default: () => null }));

import { api } from "../../api/client";
import OrdersPanel from "../OrdersPanel";

const base = {
  priority: "routine", priority_display: "Routine", schedule: { dose: "500 mg", route: "PO", frequency: "q8h" }, diagnosis_codes: [], events: [],
  appointment: 55, ordering_provider: 1, ordering_provider_name: "Jose Rizal", created_at: "2026-11-20T08:00:00Z", interface_status: "not_sent",
};
const ORDERS = [
  { ...base, id: 1, orderable_name: "Amoxicillin 500 mg capsule", orderable_category: "medication", status: "active", status_display: "Active", pharmacy_status: "verified", pharmacy_status_display: "Verified" },
  { ...base, id: 2, orderable_name: "CBC", orderable_category: "laboratory", status: "active", status_display: "Active" },
  { ...base, id: 3, orderable_name: "Paracetamol 500 mg tablet", orderable_category: "medication", status: "draft", status_display: "Draft" },
];

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/o" ? ORDERS : [] }));
  window.history.replaceState(null, "", "/patients/3/orders");
});

test("a pharmacist reads orders with every place / sign / change control hidden, not disabled", async () => {
  render(<OrdersPanel patientId={3} forcedSection="orders" chartVisit={{ loading: false, appointmentId: 55 }} />);
  expect(await screen.findByText("Amoxicillin 500 mg capsule")).toBeInTheDocument();
  expect(screen.queryByText(/does not have access to orders/)).toBeNull();
  expect(screen.queryByText("Place orders")).toBeNull();
  expect(screen.queryByLabelText(/Search orderables/)).toBeNull();
  for (const label of ["Complete", "Replace", "Discontinue", "Enter results", "Sign", "Save draft", "Cosign"]) {
    expect(screen.queryByRole("button", { name: label })).toBeNull();
  }
  // drafts are the prescriber's workspace: no Drafts tab, and the draft is not shown
  expect(screen.queryByRole("tab", { name: /Drafts/ })).toBeNull();
  expect(screen.queryByText("Paracetamol 500 mg tablet")).toBeNull();
  await waitFor(() => expect(screen.getByRole("tab", { name: /Active \(2\)/ })).toHaveAttribute("aria-selected", "true"));
});
