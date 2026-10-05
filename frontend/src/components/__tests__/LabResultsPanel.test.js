import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      labReports: "/lr",
      labReport: (id) => `/lr/${id}`,
      labReportAction: (id, action) => `/lr/${id}/${action}`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import LabResultsPanel, { toLocalInput, fromLocalInput, QUICK_PANELS } from "../LabResultsPanel";

const item = (id, over = {}) => ({
  id,
  sort_order: id,
  test_name: "Sodium",
  loinc_code: "",
  value: "140",
  value_numeric: "140",
  units: "mmol/L",
  reference_range: "135-145",
  ref_low: "135",
  ref_high: "145",
  abnormal_flag: "",
  comment: "",
  ...over,
});

const report = (id, over = {}) => ({
  id,
  patient: 3,
  title: "Basic metabolic panel",
  order: null,
  order_name: "",
  placer_order_number: "",
  source: "manual",
  status: "final",
  status_display: "Final",
  performing_lab: "Quest Diagnostics",
  accession_number: "",
  collected_at: null,
  resulted_at: "2026-10-01T15:00:00Z",
  comment: "",
  items: [item(id * 10 + 1), item(id * 10 + 2, { test_name: "Potassium", value: "5.4", reference_range: "3.5-5.0", abnormal_flag: "H" })],
  has_abnormal: true,
  has_critical: false,
  review_status: "unreviewed",
  reviewed_by: null,
  reviewed_by_name: null,
  reviewed_at: null,
  review_comment: "",
  error_reason: "",
  events: [{ id: 1, event_type: "entered", user_name: "Dr Who", created_at: "2026-10-01T15:00:00Z" }],
  ...over,
});

const load = (reports) =>
  api.get.mockImplementation(async (url) => {
    if (url === "/lr") return { data: reports };
    return { data: [] };
  });

beforeEach(() => {
  jest.clearAllMocks();
});

const renderPanel = (props = {}) =>
  render(<LabResultsPanel patientId={3} orders={[]} me={{ role: "nurse", id: 9 }} {...props} />);

test("abnormal values are called out with a symbol, a word on hover and a row highlight", async () => {
  load([report(1, { items: [item(11), item(12, { test_name: "Potassium", value: "6.9", abnormal_flag: "HH" }), item(13, { test_name: "Glucose", value: "55", abnormal_flag: "L" })], has_critical: true })]);
  renderPanel();
  await screen.findByText("Basic metabolic panel");
  expect(screen.getByText("HH ▲▲")).toBeInTheDocument();
  expect(screen.getByText("L ▼")).toBeInTheDocument();
  expect(screen.getByText("Critical value")).toBeInTheDocument();
  expect(screen.getByText("Needs review")).toBeInTheDocument();
  expect(screen.getByText(/A critical result is waiting for review/)).toBeInTheDocument();
  // the normal row has no flag symbol
  const normalRow = screen.getByTestId("lab-item-11");
  expect(within(normalRow).queryByText(/▲|▼/)).toBeNull();
});

test("a reviewed report shows who reviewed it and no review button", async () => {
  load([report(1, { review_status: "reviewed", reviewed_by_name: "Nora Nurse", reviewed_at: "2026-10-02T10:00:00Z", review_comment: "Patient called" })]);
  renderPanel();
  await screen.findByText(/Reviewed by Nora Nurse/);
  expect(screen.queryByRole("button", { name: "Mark reviewed" })).toBeNull();
  expect(screen.getByText(/Review note: Patient called/)).toBeInTheDocument();
});

test("a nurse can review: optional note is sent to the review endpoint", async () => {
  load([report(1)]);
  api.post.mockResolvedValue({ data: report(1, { review_status: "reviewed" }) });
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Mark reviewed" }));
  fireEvent.change(await screen.findByLabelText(/Note \(optional\)/), { target: { value: "Repeat in 2 weeks" } });
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Mark reviewed" }));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][0]).toBe("/lr/1/review");
  expect(api.post.mock.calls[0][1]).toEqual({ comment: "Repeat in 2 weeks" });
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Marked as reviewed."));
});

test("an admin can enter and edit but is not offered review (the server also refuses it)", async () => {
  load([report(1)]);
  renderPanel({ me: { role: "admin", id: 2 } });
  await screen.findByText("Basic metabolic panel");
  expect(screen.queryByRole("button", { name: "Mark reviewed" })).toBeNull();
  expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enter results" })).toBeInTheDocument();
});

test("a role that cannot enter sees results but no entry or edit buttons", async () => {
  load([report(1)]);
  renderPanel({ me: { role: "receptionist", id: 2 } });
  await screen.findByText("Basic metabolic panel");
  expect(screen.queryByRole("button", { name: "Enter results" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
});

test("a user with no right to view lab results sees nothing at all", async () => {
  api.get.mockRejectedValue({ response: { status: 403, data: { detail: "no" } } });
  const { container } = renderPanel();
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  await waitFor(() => expect(container.querySelector("[data-testid=lab-results-panel]")).toBeNull());
  expect(toast.error).not.toHaveBeenCalled();
});

test("'Needs review only' hides reviewed and in-error reports", async () => {
  load([
    report(1, { title: "Waiting panel" }),
    report(2, { title: "Done panel", review_status: "reviewed", reviewed_by_name: "X" }),
    report(3, { title: "Wrong panel", status: "entered_in_error", status_display: "Entered in error", error_reason: "Wrong patient" }),
  ]);
  renderPanel();
  await screen.findByText("Waiting panel");
  expect(screen.getByText("Done panel")).toBeInTheDocument();
  expect(screen.getByText("Wrong panel")).toBeInTheDocument();
  expect(screen.getByText(/Entered in error: Wrong patient/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Needs review only"));
  expect(screen.getByText("Waiting panel")).toBeInTheDocument();
  expect(screen.queryByText("Done panel")).toBeNull();
  expect(screen.queryByText("Wrong panel")).toBeNull();
  expect(screen.getByText("1 to review")).toBeInTheDocument();
});

test("entering a result needs a name and a value, then posts the patient and lines", async () => {
  load([]);
  api.post.mockResolvedValue({ data: report(5) });
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Enter results" }));
  const dialog = await screen.findByRole("dialog");

  fireEvent.click(within(dialog).getByRole("button", { name: "Save result" }));
  expect(toast.error).toHaveBeenCalledWith("Enter the panel or test name.");
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.change(within(dialog).getByLabelText(/Panel or test name/), { target: { value: "Potassium" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save result" }));
  expect(toast.error).toHaveBeenLastCalledWith("Add at least one result.");

  fireEvent.change(within(dialog).getByLabelText("Test 1"), { target: { value: "Potassium" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save result" }));
  expect(toast.error).toHaveBeenLastCalledWith("Each result needs a test name and a value.");

  fireEvent.change(within(dialog).getByLabelText("Value 1"), { target: { value: "5.4" } });
  fireEvent.change(within(dialog).getByLabelText("Units 1"), { target: { value: "mmol/L" } });
  fireEvent.change(within(dialog).getByLabelText("Reference range 1"), { target: { value: "3.5-5.0" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save result" }));

  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const [url, body] = api.post.mock.calls[0];
  expect(url).toBe("/lr");
  expect(body.patient).toBe(3);
  expect(body.title).toBe("Potassium");
  expect(body.status).toBe("final");
  expect(body.order).toBeNull();
  expect(body.resulted_at).toMatch(/Z$/);
  expect(body.items).toEqual([
    { test_name: "Potassium", value: "5.4", units: "mmol/L", reference_range: "3.5-5.0", abnormal_flag: "", loinc_code: "" },
  ]);
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Lab result saved."));
});

test("a server message is shown when saving fails and the form stays open", async () => {
  load([]);
  api.post.mockRejectedValue({ response: { data: { detail: "Result line 1 (Na): unknown flag 'zzz'." } } });
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Enter results" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/Panel or test name/), { target: { value: "Na" } });
  fireEvent.change(within(dialog).getByLabelText("Test 1"), { target: { value: "Na" } });
  fireEvent.change(within(dialog).getByLabelText("Value 1"), { target: { value: "1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save result" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Result line 1 (Na): unknown flag 'zzz'."));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("quick start fills a panel's tests and units but leaves reference ranges to be typed", async () => {
  load([]);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Enter results" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByText("Basic metabolic panel"));
  const bmp = QUICK_PANELS.find((p) => p.title === "Basic metabolic panel");
  expect(bmp.items).toHaveLength(8);
  expect(within(dialog).getByLabelText("Test 8")).toHaveValue("Calcium");
  expect(within(dialog).getByLabelText("Units 2")).toHaveValue("mmol/L");
  expect(within(dialog).getByLabelText("Reference range 2")).toHaveValue("");
  expect(within(dialog).getByLabelText(/Panel or test name/)).toHaveValue("Basic metabolic panel");
});

test("result lines can be removed but never the last one", async () => {
  load([]);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Enter results" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "Remove result 1" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Add result line" }));
  expect(within(dialog).getByLabelText("Test 2")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Remove result 2" }));
  expect(within(dialog).queryByLabelText("Test 2")).toBeNull();
});

test("editing a report loads its values and patches it", async () => {
  load([report(1)]);
  api.patch.mockResolvedValue({ data: report(1) });
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByLabelText("Value 2")).toHaveValue("5.4");
  expect(within(dialog).getByText(/sends this report back to “needs review”/)).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText("Value 2"), { target: { value: "4.1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalled());
  const [url, body] = api.patch.mock.calls[0];
  expect(url).toBe("/lr/1");
  expect(body.patient).toBeUndefined();
  expect(body.items[1]).toMatchObject({ test_name: "Potassium", value: "4.1", abnormal_flag: "H" });
});

test("entered in error needs a reason", async () => {
  load([report(1)]);
  api.post.mockResolvedValue({ data: report(1, { status: "entered_in_error" }) });
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Entered in error" }));
  const dialog = await screen.findByRole("dialog");
  const confirm = within(dialog).getByRole("button", { name: "Mark entered in error" });
  expect(confirm).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText(/Reason \(required\)/), { target: { value: "Wrong patient" } });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/lr/1/mark-error", { reason: "Wrong patient" }, expect.anything()));
});

test("history lists what happened and who did it", async () => {
  load([report(1, { events: [{ id: 1, event_type: "entered", user_name: "Dr Who", created_at: "2026-10-01T15:00:00Z" }, { id: 2, event_type: "review_reset", user_name: "", created_at: "2026-10-02T15:00:00Z" }] })]);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "History" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Entered")).toBeInTheDocument();
  expect(within(dialog).getByText(/Dr Who/)).toBeInTheDocument();
  expect(within(dialog).getByText("Review cleared (result changed)")).toBeInTheDocument();
});

test("pressing Enter results on an order opens the form linked to that order", async () => {
  load([]);
  const orders = [
    { id: 77, orderable_name: "BMP", placer_order_number: "ORD-00000077", orderable_category: "laboratory", status: "active" },
    { id: 78, orderable_name: "Chest X-ray", placer_order_number: "ORD-00000078", orderable_category: "imaging", status: "active" },
  ];
  const { rerender } = render(<LabResultsPanel patientId={3} orders={orders} me={{ role: "doctor" }} entryRequest={null} />);
  await screen.findByText("No lab results yet.");
  rerender(<LabResultsPanel patientId={3} orders={orders} me={{ role: "doctor" }} entryRequest={{ orderId: 77, nonce: 1 }} />);
  const dialog = await screen.findByRole("dialog");
  api.post.mockResolvedValue({ data: report(9) });
  fireEvent.change(within(dialog).getByLabelText(/Panel or test name/), { target: { value: "BMP" } });
  fireEvent.change(within(dialog).getByLabelText("Test 1"), { target: { value: "Na" } });
  fireEvent.change(within(dialog).getByLabelText("Value 1"), { target: { value: "140" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save result" }));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][1].order).toBe(77);
});

test("date helpers round-trip through the local datetime input", () => {
  const iso = "2026-10-01T15:30:00.000Z";
  expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  expect(toLocalInput(null)).toBe("");
  expect(fromLocalInput("")).toBeNull();
});
