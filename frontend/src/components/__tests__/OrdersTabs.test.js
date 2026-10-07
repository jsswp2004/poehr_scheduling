import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { orders: "/o", orderSets: "/os" } }), { virtual: true });
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
