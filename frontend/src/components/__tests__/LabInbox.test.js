import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      labReportsInbox: "/inbox",
      labReportAction: (id, action) => `/lr/${id}/${action}`,
      labReportFile: (id) => `/lr/${id}/file`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import LabInbox from "../LabInbox";

const item = (id, over = {}) => ({
  id, test_name: "Sodium", value: "140", units: "mmol/L", reference_range: "135-145", abnormal_flag: "", ...over,
});
const row = (id, over = {}) => ({
  id,
  patient: 40 + id,
  patient_name: `Pat ${id}`,
  title: "Basic metabolic panel",
  performing_lab: "Quest Diagnostics",
  resulted_at: "2026-10-01T15:00:00Z",
  collected_at: null,
  order_name: "",
  source: "manual",
  items: [item(id * 10)],
  has_abnormal: false,
  has_critical: false,
  has_file: false,
  comment: "",
  ...over,
});
const inbox = (results, over = {}) => ({
  data: { count: results.length, critical: results.filter((r) => r.has_critical).length, truncated: false, results, ...over },
});
const renderInbox = () => render(<MemoryRouter><LabInbox /></MemoryRouter>);

beforeEach(() => jest.clearAllMocks());

test("lists waiting reports in the order the server sent, critical ones flagged and a critical banner", async () => {
  api.get.mockResolvedValue(inbox([
    row(1, { title: "Critical K", has_critical: true, has_abnormal: true, items: [item(11, { test_name: "Potassium", value: "7.0", abnormal_flag: "HH" })] }),
    row(2, { title: "Normal panel" }),
  ]));
  renderInbox();
  await screen.findByText(/Critical K/);
  const rows = screen.getAllByTestId(/inbox-row-/);
  expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["inbox-row-1", "inbox-row-2"]);
  expect(within(rows[0]).getByText("Critical value")).toBeInTheDocument();
  expect(within(rows[1]).queryByText("Critical value")).toBeNull();
  expect(screen.getByText("1 critical result is waiting for review.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Pat 1" })).toHaveAttribute("href", "/patients/41/orders");
});

test("an empty inbox says nothing is waiting", async () => {
  api.get.mockResolvedValue(inbox([]));
  renderInbox();
  expect(await screen.findByText("Nothing waiting for review.")).toBeInTheDocument();
});

test("'Mine only' asks the server for just my orders", async () => {
  api.get.mockResolvedValue(inbox([row(1)]));
  renderInbox();
  await screen.findByText(/Pat 1/);
  expect(api.get.mock.calls[0][1].params).toEqual({});
  api.get.mockResolvedValue(inbox([]));
  fireEvent.click(screen.getByLabelText(/Mine only/));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  expect(api.get.mock.calls[1][1].params).toEqual({ mine: 1 });
  expect(await screen.findByText("Nothing waiting on your orders.")).toBeInTheDocument();
});

test("reviewing shows the values, sends the note, and refreshes the list", async () => {
  api.get.mockResolvedValue(inbox([row(1, { items: [item(11, { test_name: "Potassium", value: "5.4", abnormal_flag: "H" })], has_abnormal: true })]));
  api.post.mockResolvedValue({ data: {} });
  renderInbox();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Potassium")).toBeInTheDocument();
  expect(within(dialog).getByText("H ▲")).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText(/Note \(optional\)/), { target: { value: "Called patient" } });
  api.get.mockResolvedValue(inbox([]));
  fireEvent.click(within(dialog).getByRole("button", { name: "Mark reviewed" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/lr/1/review", { comment: "Called patient" }, expect.anything()));
  await waitFor(() => expect(screen.getByText("Nothing waiting for review.")).toBeInTheDocument());
  expect(toast.success).toHaveBeenCalledWith("Marked as reviewed.");
});

test("a scanned report with no typed values points to the document and can open it", async () => {
  api.get.mockResolvedValue(inbox([row(1, { source: "scan", items: [], has_file: true, title: "Quest scan" })]));
  global.URL.createObjectURL = jest.fn(() => "blob:x");
  global.URL.revokeObjectURL = jest.fn();
  window.open = jest.fn();
  renderInbox();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/No values have been typed in/)).toBeInTheDocument();
  api.get.mockResolvedValue({ data: new Blob(["%PDF"], { type: "application/pdf" }) });
  fireEvent.click(within(dialog).getByRole("button", { name: "View document" }));
  await waitFor(() => expect(window.open).toHaveBeenCalledWith("blob:x", "_blank", "noopener"));
});

test("a server refusal is shown and the report stays in the list", async () => {
  api.get.mockResolvedValue(inbox([row(1)]));
  api.post.mockRejectedValue({ response: { status: 403, data: { detail: "You do not have permission to perform this action." } } });
  renderInbox();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Mark reviewed" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You do not have permission to perform this action."));
  expect(screen.getByTestId("inbox-row-1")).toBeInTheDocument();
});

test("a user without the right sees a plain message, not an error", async () => {
  api.get.mockRejectedValue({ response: { status: 403, data: {} } });
  renderInbox();
  expect(await screen.findByText(/do not have access to the lab results inbox/)).toBeInTheDocument();
  expect(toast.error).not.toHaveBeenCalled();
});

test("when the list was cut off it says how many are shown", async () => {
  api.get.mockResolvedValue(inbox([row(1), row(2)], { count: 250, truncated: true }));
  renderInbox();
  expect(await screen.findByText(/Showing the 2 most urgent of 250/)).toBeInTheDocument();
});
