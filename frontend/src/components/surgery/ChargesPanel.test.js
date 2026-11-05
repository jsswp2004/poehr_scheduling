import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ChargesPanel from "./ChargesPanel";
import CloseCaseDialog from "./CloseCaseDialog";
import HistoryDialog from "./HistoryDialog";
import { surgeryApi } from "./surgeryApi";
import { toast } from "../SimpleToast";

jest.mock("./surgeryApi", () => ({
  surgeryApi: {
    charges: jest.fn(), addCharge: jest.fn(), generateCharges: jest.fn(), postCharges: jest.fn(), updateCharge: jest.fn(),
    removeCharge: jest.fn(), setStatus: jest.fn(), history: jest.fn(),
  },
}));
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("../patientHeader/headerApi", () => ({ errorText: (e, f) => e?.response?.data?.detail || f }));

const charge = (over = {}) => ({
  id: 1, charge_code: "UOORL115", description: "OR time", policy: "SUNY OR Time", policy_type: "case_time", policy_type_label: "Case Time based",
  quantity: 9, item_charge: null, total_charge: null, status: "pending", status_label: "Pending Post", date: "2026-11-03", is_auto: true, ...over,
});
const payload = (charges, extra = {}) => ({ charge_status: charges.length ? "Pending Post" : "No charges", charges, warnings: [], ...extra });

test("lists the charges with the overall status", async () => {
  surgeryApi.charges.mockResolvedValue(payload([charge(), charge({ id: 2, charge_code: "OOR1", policy_type_label: "Usage based", quantity: 1, item_charge: "12.50", total_charge: "12.50" })]));
  render(<ChargesPanel caseId={1} canEdit started />);
  expect(await screen.findByText("UOORL115")).toBeInTheDocument();
  expect(screen.getByText("Pending Post", { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByText("Case Time based")).toBeInTheDocument();
  expect(screen.getAllByText("12.50")).toHaveLength(2);
});

test("Generate Charges shows what the server made, with warnings", async () => {
  surgeryApi.charges.mockResolvedValue(payload([]));
  surgeryApi.generateCharges.mockResolvedValue(payload([charge()], { warnings: ["Anes: no times recorded, so no time charge was made."] }));
  render(<ChargesPanel caseId={1} canEdit started />);
  fireEvent.click(await screen.findByRole("button", { name: "Generate Charges" }));
  expect(await screen.findByText("UOORL115")).toBeInTheDocument();
  expect(screen.getByText(/no time charge was made/)).toBeInTheDocument();
});

test("Generate Charges is off until the case has started", async () => {
  surgeryApi.charges.mockResolvedValue(payload([]));
  render(<ChargesPanel caseId={1} canEdit started={false} />);
  expect(await screen.findByRole("button", { name: "Generate Charges" })).toBeDisabled();
  expect(screen.getByText(/once the case has started/)).toBeInTheDocument();
});

test("Post Selected posts only the ticked charges", async () => {
  surgeryApi.charges.mockResolvedValue(payload([charge(), charge({ id: 2, charge_code: "OOR1" })]));
  surgeryApi.postCharges.mockResolvedValue(payload([charge({ status: "pending" }), charge({ id: 2, charge_code: "OOR1", status: "posted", status_label: "Posted" })]));
  render(<ChargesPanel caseId={1} canEdit started />);
  fireEvent.click(await screen.findByLabelText("Select UOORL115")); // untick the first
  fireEvent.click(screen.getByRole("button", { name: "Post Selected" }));
  await waitFor(() => expect(surgeryApi.postCharges).toHaveBeenCalledWith(1, [2]));
  expect(await screen.findByText("Posted")).toBeInTheDocument();
});

test("posted charges are locked and cannot be removed", async () => {
  surgeryApi.charges.mockResolvedValue(payload([charge({ status: "posted", status_label: "Posted" })], { charge_status: "Posted" }));
  render(<ChargesPanel caseId={1} canEdit started />);
  await screen.findByText("UOORL115");
  expect(screen.getByLabelText("UOORL115 quantity")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Remove UOORL115" })).toBeNull();
  expect(screen.getByRole("button", { name: "Post Selected" })).toBeDisabled();
});

test("editing a quantity saves it; a rejected one is reported", async () => {
  surgeryApi.charges.mockResolvedValue(payload([charge()]));
  surgeryApi.updateCharge.mockResolvedValueOnce(charge({ quantity: 5 }));
  render(<ChargesPanel caseId={1} canEdit started />);
  const qty = await screen.findByLabelText("UOORL115 quantity");
  fireEvent.change(qty, { target: { value: "5" } });
  fireEvent.blur(qty);
  await waitFor(() => expect(surgeryApi.updateCharge).toHaveBeenCalledWith(1, 1, { quantity: 5 }));
  surgeryApi.updateCharge.mockRejectedValueOnce({ response: { data: { detail: "A posted charge cannot be changed." } } });
  const again = screen.getByLabelText("UOORL115 quantity");
  fireEvent.change(again, { target: { value: "7" } });
  fireEvent.blur(again);
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A posted charge cannot be changed."));
});

test("adds a manual charge and removes a pending one", async () => {
  surgeryApi.charges
    .mockResolvedValueOnce(payload([charge()]))
    .mockResolvedValueOnce(payload([charge(), charge({ id: 5, charge_code: "MISC1", is_auto: false })]))
    .mockResolvedValue(payload([]));
  surgeryApi.addCharge.mockResolvedValue(charge({ id: 5, charge_code: "MISC1", is_auto: false }));
  surgeryApi.removeCharge.mockResolvedValue();
  render(<ChargesPanel caseId={1} canEdit started />);
  fireEvent.click(await screen.findByRole("button", { name: "Add Charge" }));
  const dialog = await screen.findByRole("dialog");
  const add = within(dialog).getByRole("button", { name: "Add" });
  expect(add).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Charge code"), { target: { value: "MISC1" } });
  fireEvent.click(add);
  await waitFor(() => expect(surgeryApi.addCharge).toHaveBeenCalledWith(1, expect.objectContaining({ charge_code: "MISC1", quantity: 1 })));
  fireEvent.click(await screen.findByRole("button", { name: "Remove UOORL115" }));
  await waitFor(() => expect(surgeryApi.removeCharge).toHaveBeenCalledWith(1, 1));
});

const row = (over = {}) => ({ id: 1, case_number: 1001, status: "pacu", status_label: "In PACU", next_statuses: ["discharged", "transferred"], ...over });

test("Close Case offers only the closing statuses and closes with the pick", async () => {
  const onClosed = jest.fn();
  surgeryApi.setStatus.mockResolvedValue({ ...row(), status: "transferred", status_label: "Transferred to Inpatient", next_statuses: [] });
  render(<CloseCaseDialog open row={row()} onClose={jest.fn()} onClosed={onClosed} />);
  fireEvent.mouseDown(screen.getByLabelText("Closed status"));
  fireEvent.click(await screen.findByRole("option", { name: "Transferred to Inpatient" }));
  fireEvent.click(screen.getByRole("button", { name: "Close Case" }));
  await waitFor(() => expect(surgeryApi.setStatus).toHaveBeenCalledWith(1, "transferred", ""));
  expect(onClosed).toHaveBeenCalled();
});

test("cancelling needs a reason", async () => {
  surgeryApi.setStatus.mockResolvedValue({ ...row({ next_statuses: [] }), status: "cancelled", status_label: "Procedure Cancelled" });
  render(<CloseCaseDialog open row={row({ status: "preop", status_label: "In PreOp", next_statuses: ["or", "cancelled"] })} onClose={jest.fn()} onClosed={jest.fn()} />);
  expect(screen.getByLabelText("Closed status")).toHaveTextContent("Procedure Cancelled");
  const close = screen.getByRole("button", { name: "Close Case" });
  expect(close).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Cancellation reason"), { target: { value: "Patient ill" } });
  fireEvent.click(close);
  await waitFor(() => expect(surgeryApi.setStatus).toHaveBeenCalledWith(1, "cancelled", "Patient ill"));
});

test("Modification History groups changes by who and when", async () => {
  surgeryApi.history.mockResolvedValue([
    { id: 2, action: "status", user: "Joseph, Marie", at: "2026-11-03T10:50:00-05:00", changes: [{ field: "status", previous: "or", new: "pacu" }] },
    { id: 1, action: "created", user: "Joseph, Marie", at: "2026-11-02T09:00:00-05:00", changes: [{ field: "service", previous: "", new: "Urology" }] },
  ]);
  render(<HistoryDialog open caseId={1} onClose={jest.fn()} />);
  expect(await screen.findByText(/\[11-03-2026 10:50\] by Joseph, Marie/)).toBeInTheDocument();
  expect(screen.getAllByText("Status", { selector: "td" })).toHaveLength(2); // the area and the field
  expect(screen.getByText("Added")).toBeInTheDocument();
  expect(screen.getByText("Changed")).toBeInTheDocument();
});
