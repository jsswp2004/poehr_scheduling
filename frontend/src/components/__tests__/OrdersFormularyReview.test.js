import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { orders: "/o", orderables: "/orderables", orderSets: "/os", ordersSign: "/o/sign", order: (id) => `/o/${id}`, orderAllergyCheck: (id) => `/o/${id}/allergy-check` } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "doctor", user_id: 1 }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }), { virtual: true });
jest.mock("../DynamicNoteForm", () => () => null, { virtual: true });
jest.mock("../IcdCodePicker", () => ({ __esModule: true, default: () => null, dxLabel: () => "" }), { virtual: true });
jest.mock("../LabResultsPanel", () => ({ __esModule: true, default: () => null }));

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import OrdersPanel from "../OrdersPanel";

const AMOX = { id: 11, code: "pnf_amoxicillin_500_mg_capsule", name: "Amoxicillin 500 mg capsule", category: "medication", category_display: "Medication", external_code: "", needs_review: true };
const CBC = { id: 12, code: "cbc", name: "CBC", category: "laboratory", category_display: "Laboratory", external_code: "", needs_review: false };

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/orderables" ? [AMOX, CBC] : [] }));
  window.history.replaceState(null, "", "/patients/3/orders");
});

test("inpatient ordering warns about a formulary item not yet reviewed by a pharmacist, without blocking", async () => {
  api.post.mockResolvedValue({ data: { id: 99, orderable_name: AMOX.name, orderable_category: "medication", status: "draft", status_display: "Draft", priority: "routine", priority_display: "Routine", schedule: {}, diagnosis_codes: [], events: [] } });
  render(<OrdersPanel patientId={3} forcedSection="orders" chartVisit={{ loading: false, appointmentId: 55 }} />);
  fireEvent.change(await screen.findByLabelText(/Search orderables/), { target: { value: "amox" } });
  const option = await screen.findByRole("option", { name: /Amoxicillin/ }, { timeout: 3000 });
  expect(option).toHaveTextContent("Not yet reviewed by a pharmacist");
  expect(screen.getByRole("option", { name: /CBC/ })).not.toHaveTextContent("Not yet reviewed");
  fireEvent.click(option);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/o", { appointment: 55, orderable: 11 }, expect.anything()));
  await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("not yet reviewed by a pharmacist")));
});
