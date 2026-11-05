import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CaseUsagePanel from "./CaseUsagePanel";
import CardNotesPanel from "./CardNotesPanel";
import { surgeryApi } from "./surgeryApi";
import { toast } from "../SimpleToast";

jest.mock("./surgeryApi", () => ({
  surgeryApi: {
    caseCards: jest.fn(), addCard: jest.fn(), makePrimary: jest.fn(), removeCard: jest.fn(), preferenceCards: jest.fn(),
    usage: jest.fn(), addUsage: jest.fn(), updateUsage: jest.fn(), removeUsage: jest.fn(),
  },
}));
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("../patientHeader/headerApi", () => ({ errorText: (e, f) => e?.response?.data?.detail || f }));

const lookups = { usage_categories: [{ value: "UNSTERILE", label: "Unsterile" }, { value: "OTHER", label: "Other" }] };
const chucks = { id: 1, category: "UNSTERILE", category_label: "Unsterile", name: "CHUCKS", catalog_number: "OOR11665", total: 2, hold: 0, wasted: 0, used: 2, notes: "", charge_code: "OOR11665", department: "SUNY Main OR" };
const cardInfo = { cards: [{ id: 4, card: 9, name: "TOMASULA, J - AV FISTULA", procedure_name: "AV FISTULA", is_primary: true, merge_status: "Primary" }], primary: "TOMASULA, J - AV FISTULA", pre_op_notes: "Pre", post_op_notes: "Clip 11.5" };

beforeEach(() => {
  surgeryApi.caseCards.mockResolvedValue(cardInfo);
  surgeryApi.usage.mockResolvedValue([chucks]);
  surgeryApi.preferenceCards.mockResolvedValue([{ id: 10, name: "SECOND CARD" }]);
});

test("shows merge management and supplies grouped by category", async () => {
  render(<CaseUsagePanel caseId={1} lookups={lookups} editable />);
  expect(await screen.findByText("Unsterile (1)")).toBeInTheDocument();
  expect(screen.getByText("CHUCKS")).toBeInTheDocument();
  expect(screen.getByText(/1 Preference Cards; 1 Primary/)).toBeInTheDocument();
  expect(screen.getByText("Primary")).toBeInTheDocument();
});

test("a count saves when the box loses focus", async () => {
  surgeryApi.updateUsage.mockResolvedValue({ ...chucks, hold: 1, used: 1 });
  render(<CaseUsagePanel caseId={1} lookups={lookups} editable />);
  const hold = await screen.findByLabelText("CHUCKS hold");
  fireEvent.change(hold, { target: { value: "1" } });
  fireEvent.blur(hold);
  await waitFor(() => expect(surgeryApi.updateUsage).toHaveBeenCalledWith(1, 1, { hold: 1 }));
  await waitFor(() => expect(screen.getByLabelText("CHUCKS hold")).toHaveValue(1));
});

test("a rejected count is reported and put back", async () => {
  surgeryApi.updateUsage.mockRejectedValue({ response: { data: { detail: "Hold plus wasted cannot be more than the total." } } });
  render(<CaseUsagePanel caseId={1} lookups={lookups} editable />);
  const hold = await screen.findByLabelText("CHUCKS hold");
  fireEvent.change(hold, { target: { value: "9" } });
  fireEvent.blur(hold);
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Hold plus wasted cannot be more than the total."));
  expect(screen.getByLabelText("CHUCKS hold")).toHaveValue(0);
});

test("merges another preference card and reloads the supplies", async () => {
  surgeryApi.addCard.mockResolvedValue({});
  render(<CaseUsagePanel caseId={1} lookups={lookups} editable />);
  const box = await screen.findByLabelText("Add preference card");
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "sec" } });
  fireEvent.click(await screen.findByText("SECOND CARD"));
  await waitFor(() => expect(surgeryApi.addCard).toHaveBeenCalledWith(1, 10));
  await waitFor(() => expect(surgeryApi.usage.mock.calls.length).toBeGreaterThan(1));
});

test("adds a supply item", async () => {
  surgeryApi.addUsage.mockResolvedValue({ ...chucks, id: 2, name: "SALINE", category: "OTHER", category_label: "Other" });
  render(<CaseUsagePanel caseId={1} lookups={lookups} editable />);
  fireEvent.click(await screen.findByRole("button", { name: "Add Item" }));
  const dialog = await screen.findByRole("dialog");
  const add = within(dialog).getByRole("button", { name: "Add" });
  expect(add).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Item name"), { target: { value: "SALINE" } });
  fireEvent.click(add);
  await waitFor(() => expect(surgeryApi.addUsage).toHaveBeenCalledWith(1, expect.objectContaining({ name: "SALINE", total: 1, category: "OTHER" })));
  expect(await screen.findByText("Other (1)")).toBeInTheDocument();
});

test("removes a supply", async () => {
  surgeryApi.removeUsage.mockResolvedValue();
  render(<CaseUsagePanel caseId={1} lookups={lookups} editable />);
  fireEvent.click(await screen.findByRole("button", { name: "Remove CHUCKS" }));
  await waitFor(() => expect(surgeryApi.removeUsage).toHaveBeenCalledWith(1, 1));
  await waitFor(() => expect(screen.queryByText("CHUCKS")).toBeNull());
});

test("read-only when the case is closed", async () => {
  render(<CaseUsagePanel caseId={1} lookups={lookups} editable={false} />);
  await screen.findByText("CHUCKS");
  expect(screen.queryByRole("button", { name: "Add Item" })).toBeNull();
  expect(screen.queryByLabelText("Add preference card")).toBeNull();
  expect(screen.getByLabelText("CHUCKS hold")).toBeDisabled();
});

test("pre-op and post-op show the primary card's notes", async () => {
  const { unmount } = render(<CaseNotes kind="post" />);
  expect(await screen.findByDisplayValue(/Preference Card: TOMASULA, J - AV FISTULA\s+Clip 11.5/)).toBeInTheDocument();
  unmount();
  render(<CaseNotes kind="pre" />);
  expect(await screen.findByDisplayValue(/Pre$/)).toBeInTheDocument();
});

function CaseNotes({ kind }) {
  return <CardNotesPanel caseId={1} kind={kind} />;
}
