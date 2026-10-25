import { render, screen, fireEvent } from "@testing-library/react";
import StaffingDayBoard, {
  StaffingDayContext,
  StaffingDayView,
  dayColumns,
  columnUnits,
} from "../StaffingDayBoard";

const info = {
  status: "not_met",
  items: [
    { unit_id: 1, unit_name: "2 West", shift_type: "day", shift_label: "Day", status: "met", assigned: 2, required: 2, required_rn: 1, rn_scheduled: 1 },
    { unit_id: 1, unit_name: "2 West", shift_type: "night", shift_label: "Night", status: "not_met", assigned: 1, required: 3, required_rn: 1, rn_scheduled: 1, reasons: ["Short on care hours"] },
  ],
};
const shifts = [
  { id: 1, date: "2026-10-22", unit: 1, unit_name: "2 West", shift_type: "day", staff_name: "Jane Doe", nursing_role: "rn", start_time: "07:00:00", end_time: "19:00:00" },
  { id: 2, date: "2026-10-22", unit: 1, unit_name: "2 West", shift_type: "day", staff_name: "Gary Evans", nursing_role: "lpn", start_time: "07:00:00", end_time: "19:00:00" },
  { id: 3, date: "2026-10-22", unit: 1, unit_name: "2 West", shift_type: "night", staff_name: "Jane Carter", nursing_role: "rn", start_time: "19:00:00", end_time: "07:00:00" },
  { id: 4, date: "2026-10-23", unit: 1, unit_name: "2 West", shift_type: "day", staff_name: "Other Day", nursing_role: "cna" },
];

const renderBoard = (ctx) =>
  render(
    <StaffingDayContext.Provider
      value={{ coverage: { days: { "2026-10-22": info } }, shifts, loading: false, failed: false, isAdmin: true, canFill: () => true, fillLabel: "Assign", onFill: jest.fn(), onPersonMenu: jest.fn(), onAdd: jest.fn(), ...ctx }}
    >
      <StaffingDayBoard date={new Date(2026, 9, 22)} />
    </StaffingDayContext.Provider>
  );

describe("day board helpers", () => {
  it("always has Day and Night and adds Evening or Custom only when used", () => {
    expect(dayColumns([], null)).toEqual(["day", "night"]);
    expect(dayColumns([{ shift_type: "evening" }], null)).toEqual(["day", "evening", "night"]);
    expect(dayColumns([{ shift_type: "custom" }], null)).toEqual(["day", "night", "custom"]);
  });
  it("groups a column by unit, joining people to the requirement", () => {
    const units = columnUnits("day", shifts.filter((s) => s.date === "2026-10-22"), info);
    expect(units).toHaveLength(1);
    expect(units[0].name).toBe("2 West");
    expect(units[0].people.map((p) => p.staff_name)).toEqual(["Jane Doe", "Gary Evans"]);
    expect(units[0].item.required).toBe(2);
  });
  it("pages by a day", () => {
    expect(StaffingDayView.navigate(new Date(2026, 9, 22), "NEXT").getDate()).toBe(23);
    expect(StaffingDayView.navigate(new Date(2026, 9, 22), "PREV").getDate()).toBe(21);
    expect(StaffingDayView.title(new Date(2026, 9, 22))).toBe("Thursday, October 22");
    expect(StaffingDayView.range(new Date(2026, 9, 22))).toHaveLength(1);
  });
});

describe("StaffingDayBoard", () => {
  it("shows the day's people under their shift with hours and the badge", () => {
    renderBoard();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Gary Evans")).toBeInTheDocument();
    expect(screen.getByText("Jane Carter")).toBeInTheDocument();
    expect(screen.queryByText("Other Day")).toBeNull();
    expect(screen.getByText("7:00 AM – 7:00 PM")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("lists what is open with an Assign button that passes the day", () => {
    const onFill = jest.fn();
    renderBoard({ onFill });
    expect(screen.getByText("Open: 2 more needed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Assign 2 West Night/ }));
    expect(onFill).toHaveBeenCalledWith(expect.objectContaining({ unit_id: 1, shift_type: "night", need: 2 }), "2026-10-22");
  });

  it("gives admins a person menu and nobody else", () => {
    const onPersonMenu = jest.fn();
    const { unmount } = renderBoard({ onPersonMenu });
    fireEvent.click(screen.getByRole("button", { name: "Actions for Jane Doe" }));
    expect(onPersonMenu).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 1 }));
    unmount();
    renderBoard({ isAdmin: false });
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });

  it("reminds that a role filter does not change the coverage counts", () => {
    renderBoard({ roleLabel: "RN" });
    expect(screen.getByText(/Coverage counts include all roles/)).toBeInTheDocument();
  });

  it("hides Assign when the person cannot fill", () => {
    renderBoard({ canFill: () => false });
    expect(screen.queryByRole("button", { name: /Assign/ })).toBeNull();
  });

  it("shows an empty-day message with + Add shift for admins", () => {
    const onAdd = jest.fn();
    render(
      <StaffingDayContext.Provider value={{ coverage: { days: {} }, shifts: [], loading: false, failed: false, isAdmin: true, onAdd }}>
        <StaffingDayBoard date={new Date(2026, 9, 24)} />
      </StaffingDayContext.Provider>
    );
    expect(screen.getByText(/No shifts on Sat, Oct 24/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("+ Add shift"));
    expect(onAdd).toHaveBeenCalledWith("2026-10-24");
  });

  it("says coverage is unavailable but still shows the people, with a retry", () => {
    const onRetry = jest.fn();
    renderBoard({ coverage: null, failed: true, onRetry });
    expect(screen.getByText(/coverage colours unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry coverage" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a skeleton while an empty day is still loading", () => {
    render(
      <StaffingDayContext.Provider value={{ coverage: { days: {} }, shifts: [], loading: true, failed: false, isAdmin: true }}>
        <StaffingDayBoard date={new Date(2026, 9, 24)} />
      </StaffingDayContext.Provider>
    );
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText(/No shifts on/)).toBeNull();
  });
});
