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

beforeEach(() => {
  api.get.mockReset();
  api.get.mockResolvedValue({ data: { results: [] } });
  window.history.replaceState(null, "", "/patients/3/orders");
});

const visible = (text) => screen.getByText(text).closest("div[id='lab-results']") || screen.getByText(text);

test("opens on the Orders tab with the lab panel hidden", async () => {
  render(<OrdersPanel patientId={3} />);
  await waitFor(() => expect(screen.getByTestId("orders-section-tab")).toBeInTheDocument());
  expect(screen.getByText("Place orders")).toBeVisible();
  expect(screen.getByText("LAB PANEL BODY")).not.toBeVisible();
});

test("#lab-results opens the Lab Results tab", async () => {
  window.history.replaceState(null, "", "/patients/3/orders#lab-results");
  render(<OrdersPanel patientId={3} />);
  await waitFor(() => expect(screen.getByTestId("lab-results-section-tab")).toBeInTheDocument());
  expect(screen.getByText("LAB PANEL BODY")).toBeVisible();
  expect(screen.getByText("Place orders")).not.toBeVisible();
});

test("switching tabs swaps the sections and updates the address", async () => {
  render(<OrdersPanel patientId={3} />);
  await waitFor(() => expect(screen.getByTestId("lab-results-section-tab")).toBeInTheDocument());
  fireEvent.click(screen.getByTestId("lab-results-section-tab"));
  expect(screen.getByText("LAB PANEL BODY")).toBeVisible();
  expect(window.location.hash).toBe("#lab-results");
  fireEvent.click(screen.getByTestId("orders-section-tab"));
  expect(screen.getByText("Place orders")).toBeVisible();
  expect(window.location.hash).toBe("");
});

test("when the chart tab strip drives it, the inner tabs are hidden and the section follows", async () => {
  const { rerender } = render(<OrdersPanel patientId={3} forcedSection="orders" />);
  await waitFor(() => expect(screen.getByText("Place orders")).toBeInTheDocument());
  expect(screen.queryByTestId("orders-section-tab")).toBeNull();
  expect(screen.getByText("LAB PANEL BODY")).not.toBeVisible();
  rerender(<OrdersPanel patientId={3} forcedSection="labs" />);
  expect(screen.getByText("LAB PANEL BODY")).toBeVisible();
  expect(screen.getByText("Place orders")).not.toBeVisible();
  expect(window.location.hash).toBe("");
});

test("on the chart's Results tab the lab block has no top gap (the Stack gap is cancelled)", async () => {
  render(<OrdersPanel patientId={3} forcedSection="labs" />);
  await waitFor(() => expect(screen.getByText("LAB PANEL BODY")).toBeVisible());
  const block = document.getElementById("lab-results");
  expect(getComputedStyle(block).marginTop).toBe("0px");
});

test("with its own inner tabs the Orders page keeps the normal gap above lab results", async () => {
  render(<OrdersPanel patientId={3} />);
  await waitFor(() => expect(screen.getByTestId("lab-results-section-tab")).toBeInTheDocument());
  expect(getComputedStyle(document.getElementById("lab-results")).marginTop).toBe("24px");
});

test("with the header's visit (chartVisit) there is no visit picker, and the title is plain", async () => {
  render(<OrdersPanel patientId={3} forcedSection="orders" chartVisit={{ loading: false, appointmentId: 55 }} />);
  await waitFor(() => expect(screen.getByText("Place orders")).toBeInTheDocument());
  expect(screen.queryByText("Visit / Registration")).toBeNull();
  expect(screen.queryByText(/no visit yet/)).toBeNull();
});

test("without chartVisit the standalone page still has its visit picker", async () => {
  render(<OrdersPanel patientId={3} forcedSection="orders" />);
  await waitFor(() => expect(screen.getByText("Place orders")).toBeInTheDocument());
  expect(screen.getAllByText("Visit / Registration").length).toBeGreaterThan(0);
});

test("a patient with no visit sees a short message instead of a picker", async () => {
  render(<OrdersPanel patientId={3} forcedSection="orders" chartVisit={{ loading: false, appointmentId: null }} />);
  await waitFor(() => expect(screen.getByText(/no visit yet/)).toBeInTheDocument());
});

describe("allergy alerts on medication orders", () => {
  const draft = { id: 7, status: "draft", orderable_name: "Amoxicillin 500 mg capsule", orderable_category: "medication", priority: "routine", code_system: "", external_code: "", placer_order_number: "ORD-7", detail_template_snapshot: null };
  const alert = { allergy_id: 1, level: "class", message: "Same drug class as the allergy: patient is allergic to Penicillin.", severity: "severe" };

  const setup = () => {
    api.get.mockImplementation(async (url) => {
      if (url === "/o") return { data: { results: [draft] } };
      if (String(url).includes("allergy-check")) return { data: { alerts: [alert] } };
      return { data: { results: [] } };
    });
  };

  test("a medication draft shows the allergy alert before signing", async () => {
    setup();
    render(<OrdersPanel patientId={3} chartVisit={{ id: 1 }} />);
    expect(await screen.findByTestId("allergy-alert-7")).toHaveTextContent("allergic to Penicillin");
  });

  test("a 409 on sign asks for a reason and retries with it", async () => {
    setup();
    api.post.mockReset();
    api.post
      .mockRejectedValueOnce({ response: { status: 409, data: { errors: [{ order: 7, name: draft.orderable_name, allergy_alerts: [alert] }] } } })
      .mockResolvedValueOnce({ data: [{ ...draft, status: "active" }] });
    render(<OrdersPanel patientId={3} chartVisit={{ id: 1 }} />);
    await screen.findByTestId("allergy-alert-7");
    fireEvent.click(screen.getByRole("button", { name: /^sign$/i }));
    const stop = await screen.findByTestId("allergy-stop-item");
    expect(stop).toHaveTextContent("Amoxicillin");
    const sign = screen.getByRole("button", { name: "Sign anyway" });
    expect(sign).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason for signing anyway/), { target: { value: "Tolerated before" } });
    fireEvent.click(sign);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[0][1]).toEqual({ ids: [7] });
    expect(api.post.mock.calls[1][1]).toEqual({ ids: [7], allergy_override_reason: "Tolerated before" });
  });
});
