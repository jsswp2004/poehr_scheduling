import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { orders: "/o", orderSets: "/os", ordersSign: "/o/sign", order: (id) => `/o/${id}`, orderAllergyCheck: (id) => `/o/${id}/allergy-check` } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "doctor", user_id: 1 }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });
jest.mock("../DynamicNoteForm", () => () => null, { virtual: true });
jest.mock("../IcdCodePicker", () => ({ __esModule: true, default: () => null, dxLabel: () => "" }), { virtual: true });
jest.mock("../LabResultsPanel", () => ({ __esModule: true, default: () => <div>LAB PANEL BODY</div> }));

import { api } from "../../api/client";
import OrdersPanel from "../OrdersPanel";

const base = { status: "draft", priority: "routine", code_system: "", external_code: "", detail_template_snapshot: null, schedule: {} };
const med = { ...base, id: 7, orderable_name: "Amoxicillin 500 mg capsule", orderable_category: "medication", task_mode: "required", placer_order_number: "ORD-7" };
const lab = { ...base, id: 8, orderable_name: "CBC", orderable_category: "laboratory", task_mode: "none", placer_order_number: "ORD-8" };
const signed = { ...med, status: "active", status_display: "Active", priority_display: "Routine", interface_status: "not_sent", schedule: { frequency: "bid", dose: "500 mg", route: "PO", duration_days: 5 } };

beforeEach(() => {
  [api.get, api.post, api.patch].forEach((f) => f.mockReset());
  window.history.replaceState(null, "", "/patients/3/orders");
});

const serve = (orders) =>
  api.get.mockImplementation(async (url) => {
    if (url === "/o") return { data: { results: orders } };
    if (String(url).includes("allergy-check")) return { data: { alerts: [] } };
    return { data: { results: [] } };
  });

test("a medication draft asks for its dose and schedule; a lab draft does not", async () => {
  serve([med, lab]);
  render(<OrdersPanel patientId={3} chartVisit={{ id: 1 }} />);
  expect(await screen.findByTestId("schedule-7")).toHaveTextContent("Dose and schedule");
  expect(screen.getByTestId("schedule-missing-7")).toHaveTextContent("frequency, dose, route");
  expect(screen.queryByTestId("schedule-8")).not.toBeInTheDocument();
});

test("signing a medication sends the schedule with the draft first, then signs it", async () => {
  serve([med]);
  api.patch.mockResolvedValue({ data: { ...med, schedule: { frequency: "bid", dose: "500 mg", route: "PO" } } });
  api.post.mockResolvedValue({ data: [{ ...signed }] });
  render(<OrdersPanel patientId={3} chartVisit={{ id: 1 }} />);
  await screen.findByTestId("schedule-7");
  fireEvent.change(screen.getByTestId("schedule-dose-7"), { target: { value: "500 mg" } });
  fireEvent.change(screen.getByTestId("schedule-frequency-7"), { target: { value: "bid" } });
  fireEvent.change(screen.getByTestId("schedule-route-7"), { target: { value: "PO" } });
  expect(screen.queryByTestId("schedule-missing-7")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^sign$/i }));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.patch.mock.calls[0][0]).toBe("/o/7");
  expect(api.patch.mock.calls[0][1].schedule).toEqual({ frequency: "bid", dose: "500 mg", route: "PO" });
  expect(api.post.mock.calls[0][1]).toEqual({ ids: [7] });
});

test("a signed medication shows its schedule on one line", async () => {
  serve([signed]);
  render(<OrdersPanel patientId={3} chartVisit={{ id: 1 }} />);
  fireEvent.click(await screen.findByRole("tab", { name: /active/i }));
  expect(await screen.findByTestId("schedule-summary-7")).toHaveTextContent("500 mg · PO · Twice a day (BID) · for 5 days");
});
