import { fireEvent, render, screen, within } from "@testing-library/react";
import CaseListTab from "./CaseListTab";
import DayPlannerTab from "./DayPlannerTab";

const row = (over) => ({
  id: 1,
  case_number: 1001,
  date: "2026-11-03",
  time: "08:00",
  room: { id: 10, name: "OR-1" },
  patient: { id: 5, name: "Bascom, Mark B", mrn: "MRN-000001", age: "59y", sex: "M" },
  visit: { id: 3, visit_number: "VN-000003" },
  procedures_text: "CYSTOSCOPY [Right]",
  surgeon: { id: 2, name: "Lee, Jeffrey" },
  service: "Urology",
  case_type_label: "Elective",
  status: "pending",
  status_label: "Pending",
  next_statuses: ["preop", "cancelled"],
  times: { pacu_start: null },
  ...over,
});

const rooms = [{ id: 10, name: "OR-1" }];

describe("CaseListTab", () => {
  const props = (over = {}) => ({
    rows: [row(), row({ id: 2, case_number: 1002, time: "10:00", patient: { id: 6, name: "Frisby, Mackenzie", mrn: "MRN-000002", age: "9m 3w", sex: "F" }, procedures_text: "EXCISION", status: "pacu", status_label: "In PACU", next_statuses: ["discharged", "transferred"] })],
    rooms,
    canEdit: true,
    selectedId: null,
    onSelect: jest.fn(),
    onOpen: jest.fn(),
    onNew: jest.fn(),
    onMove: jest.fn(),
    ...over,
  });

  test("shows a row per case with the Altera-style columns", () => {
    render(<CaseListTab {...props()} />);
    expect(screen.getByText("BASCOM, MARK B")).toBeInTheDocument();
    expect(screen.getAllByText("11-03-2026")).toHaveLength(2);
    expect(screen.getByText("CYSTOSCOPY [Right]")).toBeInTheDocument();
    expect(screen.getAllByText("VN-000003").length).toBeGreaterThan(0);
    expect(screen.getByText("0 of 2 cases selected")).toBeInTheDocument();
  });

  test("selecting a case offers only the moves its status allows", () => {
    const onMove = jest.fn();
    const { rerender } = render(<CaseListTab {...props({ selectedId: 1, onMove })} />);
    expect(screen.getByRole("button", { name: "Start PreOp" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel Case" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discharge" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start PreOp" }));
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "preop");
    rerender(<CaseListTab {...props({ selectedId: 2, onMove })} />);
    expect(screen.getByRole("button", { name: "Discharge" })).toBeInTheDocument();
  });

  test("clicking selects and double-clicking opens", () => {
    const p = props();
    render(<CaseListTab {...p} />);
    const r = screen.getByText("BASCOM, MARK B").closest("tr");
    fireEvent.click(r);
    expect(p.onSelect).toHaveBeenCalledWith(1);
    fireEvent.doubleClick(r);
    expect(p.onOpen).toHaveBeenCalledWith(1);
  });

  test("search filters the rows", () => {
    render(<CaseListTab {...props()} />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "frisby" } });
    expect(screen.queryByText("BASCOM, MARK B")).toBeNull();
    expect(screen.getByText("FRISBY, MACKENZIE")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "zzz" } });
    expect(screen.getByText("No cases match these filters.")).toBeInTheDocument();
  });

  test("a viewer without edit rights gets no New Case or status buttons", () => {
    render(<CaseListTab {...props({ canEdit: false, selectedId: 1 })} />);
    expect(screen.queryByRole("button", { name: "New Case" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start PreOp" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open Case Details" })).toBeEnabled();
  });

  test("empty day", () => {
    render(<CaseListTab {...props({ rows: [] })} />);
    expect(screen.getByText("No cases booked for this day.")).toBeInTheDocument();
  });
});

describe("DayPlannerTab", () => {
  const bar = (over) => ({
    id: 1, case_number: 1001, mrn: "MRN-000001", scheduled_start: "2026-11-03T08:00-05:00", scheduled_end: "2026-11-03T09:30-05:00",
    status: "pending", status_label: "Pending", case_type: "elective", label: "1001 / MRN-000001 / Elective / Pending", overlap: false, ...over,
  });
  const planner = {
    date: "2026-11-03", day_start: 7, day_end: 19,
    rooms: [{ id: 10, name: "OR-1", cases: [bar(), bar({ id: 2, case_number: 1002, scheduled_start: "2026-11-03T09:00-05:00", scheduled_end: "2026-11-03T10:00-05:00", overlap: true })] }, { id: 11, name: "OR-2", cases: [] }],
    unassigned: [bar({ id: 3, case_number: 1003 })],
    legend: [
      { status: "pending", label: "Pending", count: 3 }, { status: "preop", label: "In PreOp", count: 0 },
      { status: "or", label: "In OR", count: 0 }, { status: "pacu", label: "In PACU", count: 0 },
      { status: "discharged", label: "Discharged", count: 0 }, { status: "cancelled", label: "Procedure Cancelled", count: 0 },
      { status: "transferred", label: "Transferred to Inpatient", count: 0 },
    ],
  };

  test("draws a row per room, a bar per case and the legend counts", () => {
    render(<DayPlannerTab planner={planner} selectedId={null} onSelect={jest.fn()} onOpen={jest.fn()} />);
    expect(screen.getByText("7 am")).toBeInTheDocument();
    expect(screen.getByText("6 pm")).toBeInTheDocument();
    expect(within(screen.getByTestId("planner-row-OR-1")).getAllByRole("button")).toHaveLength(2);
    expect(within(screen.getByTestId("planner-row-OR-2")).queryAllByRole("button")).toHaveLength(0);
    expect(within(screen.getByTestId("planner-row-No room yet")).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("Pending (3)")).toBeInTheDocument();
    expect(screen.getByText("Transferred to Inpatient (0)")).toBeInTheDocument();
  });

  test("a bar selects on click and opens on double click or Enter", () => {
    const onSelect = jest.fn();
    const onOpen = jest.fn();
    render(<DayPlannerTab planner={planner} selectedId={null} onSelect={onSelect} onOpen={onOpen} />);
    const b = screen.getByLabelText("Case 1001");
    fireEvent.click(b);
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.doubleClick(b);
    fireEvent.keyDown(b, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  test("overlapping cases sit in different lanes", () => {
    render(<DayPlannerTab planner={planner} selectedId={null} onSelect={jest.fn()} onOpen={jest.fn()} />);
    const a = screen.getByLabelText("Case 1001");
    const b = screen.getByLabelText("Case 1002");
    expect(getComputedStyle(a).top).not.toBe(getComputedStyle(b).top);
  });

  test("tells an administrator when no rooms exist", () => {
    render(<DayPlannerTab planner={{ ...planner, rooms: [], unassigned: [] }} selectedId={null} onSelect={jest.fn()} onOpen={jest.fn()} />);
    expect(screen.getByText(/No operating rooms are set up/)).toBeInTheDocument();
  });
});
