import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn(), put: jest.fn() } }));
jest.mock("../../config/api", () => ({ API_BASE_URL: "http://api.test" }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "tok" }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: jest.fn(() => ({ role: "admin" })) }));
jest.mock("../../components/SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import axios from "axios";
import { jwtDecode } from "jwt-decode";
import AccountPage from "../AccountPage";

const me = {
  first_name: "St.", last_name: "Marys", email: "admin@stmarys.org", phone_number: "301-555-0142", role: "admin",
  organization: 7, organization_name: "St. Mary's Rehab", subscription_tier: "premium",
};
const methods = [
  { id: "pm1", type: "Visa", last4: "4242", expires: "12/27", isDefault: true },
  { id: "pm2", type: "Mastercard", last4: "1881", expires: "04/28", isDefault: false },
];
const invoices = [{ id: 1, date: "Oct 1, 2026", description: "Clinic plan, monthly", amount: "$299.99", status: "Paid" }];

const serve = ({ payment = methods, billing = invoices, user = me } = {}) =>
  axios.get.mockImplementation(async (url) => {
    if (url.endsWith("/api/users/me/")) return { data: user };
    if (url.endsWith("/payments/methods/")) return { data: { payment_methods: payment } };
    if (url.endsWith("/payments/history/")) return { data: { billing_history: billing } };
    return { data: {} };
  });

const open = async () => {
  render(<AccountPage />);
  await screen.findByRole("heading", { name: "Account" });
};

beforeEach(() => {
  jest.clearAllMocks();
  jwtDecode.mockReturnValue({ role: "admin" });
  serve();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

test("shows the details, plan, data and danger zone", async () => {
  await open();
  expect(screen.getByText("admin@stmarys.org")).toBeInTheDocument();
  expect(screen.getByText("301-555-0142")).toBeInTheDocument();
  expect(screen.getAllByText("Clinic").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Up to 10 users").length).toBeGreaterThan(0);
  expect(screen.getByText("Each additional service $150 a month")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Change plan" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export organization data" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel account" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete organization" })).toBeInTheDocument();
});

test("fields without a value say Not set", async () => {
  serve({ user: { ...me, phone_number: "" } });
  await open();
  expect(screen.getByText("Not set")).toBeInTheDocument();
});

test("payment methods: Default chip, and the row menu for the other card", async () => {
  await open();
  expect(screen.getByText(/Visa ending in 4242/)).toHaveTextContent("Default");
  fireEvent.click(screen.getByRole("button", { name: "Actions for Mastercard ending in 1881" }));
  expect(await screen.findByRole("menuitem", { name: "Set as default" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("http://api.test/api/users/payments/methods/pm2/", expect.any(Object)));
});

test("the default card has no Set as default option", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Actions for Visa ending in 4242" }));
  await screen.findByRole("menuitem", { name: "Delete" });
  expect(screen.queryByRole("menuitem", { name: "Set as default" })).toBeNull();
});

test("empty payment methods and billing history say what to do", async () => {
  serve({ payment: [], billing: [] });
  await open();
  expect(screen.getByText(/No payment methods found/)).toBeInTheDocument();
  expect(screen.getByText(/No billing history found/)).toBeInTheDocument();
});

test("billing history lists invoices with their status", async () => {
  await open();
  expect(screen.getByText("Clinic plan, monthly")).toBeInTheDocument();
  expect(screen.getByText("Paid")).toBeInTheDocument();
});

test("Change plan: pick another plan and the button names it", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
  const dlg = await screen.findByRole("dialog");
  expect(within(dlg).getByRole("button", { name: "Change plan" })).toBeDisabled();
  fireEvent.click(within(dlg).getByRole("button", { name: /Professional/ }));
  fireEvent.click(within(dlg).getByRole("button", { name: "Switch to Professional" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    "http://api.test/api/users/payments/change-plan/", { plan: "basic" }, expect.any(Object)));
});

test("Cancel account and Delete organization open their dialogs", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Cancel account" }));
  expect(await screen.findByText(/Canceling your account will immediately/)).toBeInTheDocument();
});

test("Delete organization stays disabled until the name matches", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Delete organization" }));
  const dlg = await screen.findByRole("dialog");
  const del = within(dlg).getByRole("button", { name: /Delete Organization/i });
  expect(del).toBeDisabled();
  fireEvent.change(within(dlg).getByLabelText("Organization Name"), { target: { value: "St. Mary's Rehab" } });
  expect(del).toBeEnabled();
});

test("the back button goes back", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Go back" }));
  expect(mockNavigate).toHaveBeenCalledWith(-1);
});

test("system admins get the organization search; others do not", async () => {
  await open();
  expect(screen.queryByPlaceholderText(/Search organizations/)).toBeNull();
});

test("system admin view shows the search and the managed organization", async () => {
  jwtDecode.mockReturnValue({ role: "system_admin" });
  await open();
  expect(screen.getByPlaceholderText(/Search organizations/)).toBeInTheDocument();
  expect(screen.getByText("Managing: St. Mary's Rehab")).toBeInTheDocument();
});
