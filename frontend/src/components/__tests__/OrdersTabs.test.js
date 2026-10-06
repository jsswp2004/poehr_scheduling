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
