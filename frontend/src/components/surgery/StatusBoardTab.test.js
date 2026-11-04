import { fireEvent, render, screen, within } from "@testing-library/react";
import StatusBoardTab from "./StatusBoardTab";

const row = (over) => ({
  id: 1, case_number: 1001, date: "2026-11-03", time: "08:00", scheduled_start: "2026-11-03T08:00-05:00",
  room: { id: 10, name: "OR-1" }, patient: { id: 5, name: "Bascom, Mark B", mrn: "MRN-1" },
  procedures_text: "CYSTOSCOPY [Right]", surgeon: { id: 2, name: "Lee, Jeffrey" },
  status: "pacu", status_label: "In PACU", ...over,
});
const rows = [
  row(),
  row({ id: 2, case_number: 1002, time: "07:30", scheduled_start: "2026-11-03T07:30-05:00", patient: { id: 6, name: "Frisby, Mackenzie", mrn: "MRN-2" }, status: "discharged", status_label: "Discharged", room: null }),
  row({ id: 3, case_number: 1003, time: "11:00", scheduled_start: "2026-11-03T11:00-05:00", patient: { id: 7, name: "Kats, Thea", mrn: "MRN-3" }, status: "or", status_label: "In OR" }),
];

const renderBoard = (over = {}) => {
  const props = { rows, date: "2026-11-03", refreshMs: 30000, onRefreshMsChange: jest.fn(), onRefresh: jest.fn(), ...over };
  render(<StatusBoardTab {...props} />);
  return props;
};

beforeEach(() => {
  try {
    localStorage.removeItem("surgeryStatusBoardPrefs");
  } catch (err) {
    // storage not available
  }
});

test("lists the cases in time order with the status coloured and counted", () => {
  renderBoard();
  const body = screen.getAllByRole("row").slice(1); // after the header
  expect(body.map((r) => within(r).getAllByRole("cell")[3].textContent)).toEqual(["1002", "1001", "1003"]);
  expect(screen.getByText("Status Board · 11-03-2026 · 3 cases")).toBeInTheDocument();
  expect(screen.getByText("In PACU (1)")).toBeInTheDocument();
  expect(screen.getByText("Discharged (1)")).toBeInTheDocument();
  expect(screen.getByText("Unassigned")).toBeInTheDocument();
});

test("names are cut to last name and first initial until the viewer picks otherwise", () => {
  renderBoard();
  expect(screen.getByText("BASCOM, M.")).toBeInTheDocument();
  expect(screen.queryByText("BASCOM, MARK B")).toBeNull();
});

test("text size buttons mark the one in use and remember it", () => {
  renderBoard();
  expect(screen.getByRole("button", { name: "Text size 4" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Text size 7" }));
  expect(screen.getByRole("button", { name: "Text size 7" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Text size 4" })).toHaveAttribute("aria-pressed", "false");
  expect(JSON.parse(localStorage.getItem("surgeryStatusBoardPrefs")).size).toBe(6);
});

test("hide finished cases removes discharged, cancelled and transferred rows", () => {
  renderBoard();
  fireEvent.click(screen.getByLabelText("Hide finished cases"));
  expect(screen.queryByText("1002")).toBeNull();
  expect(screen.getByText("1001")).toBeInTheDocument();
  // the legend still counts everything
  expect(screen.getByText("Discharged (1)")).toBeInTheDocument();
});

test("says so when every case is finished", () => {
  renderBoard({ rows: [rows[1]] });
  fireEvent.click(screen.getByLabelText("Hide finished cases"));
  expect(screen.getByText("Every case today is finished.")).toBeInTheDocument();
});

test("refresh rate and Refresh call back", () => {
  const props = renderBoard();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(props.onRefresh).toHaveBeenCalled();
  expect(screen.getByText("30 seconds")).toBeInTheDocument();
});

test("a saved choice of names is applied", () => {
  localStorage.setItem("surgeryStatusBoardPrefs", JSON.stringify({ names: "full" }));
  renderBoard();
  expect(screen.getByText("BASCOM, MARK B")).toBeInTheDocument();
});

test("Full screen is disabled where the browser cannot do it", () => {
  renderBoard();
  expect(screen.getByRole("button", { name: "Full screen" })).toBeDisabled();
});
