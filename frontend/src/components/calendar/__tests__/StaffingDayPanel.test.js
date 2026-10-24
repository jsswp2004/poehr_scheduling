import { render, screen, fireEvent } from "@testing-library/react";
import StaffingDayPanel from "../StaffingDayPanel";

const info = {
  status: "not_met",
  open_emergencies: 0,
  items: [
    { unit_id: 2, unit_name: "4 East", shift_type: "day", shift_label: "Day", status: "not_met", assigned: 2, required: 4 },
    { unit_id: 2, unit_name: "4 East", shift_type: "night", shift_label: "Night", status: "met", assigned: 3, required: 3 },
  ],
};

describe("StaffingDayPanel", () => {
  it("shows each shift staffed of needed and the status", () => {
    render(<StaffingDayPanel iso="2026-10-22" info={info} onOpenDay={() => {}} />);
    expect(screen.getByText("Thu, Oct 22")).toBeInTheDocument();
    expect(screen.getByText("2 of 4")).toBeInTheDocument();
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(screen.getAllByText(/Not met/).length).toBeGreaterThan(0);
  });

  it("lists what is left to fill and hands the item to onFill", () => {
    const onFill = jest.fn();
    render(
      <StaffingDayPanel iso="2026-10-22" info={info} canFill fillLabel="Assign" onFill={onFill} onOpenDay={() => {}} />
    );
    expect(screen.getByText("To fill")).toBeInTheDocument();
    expect(screen.getByText("2 more needed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Assign 4 East Day/ }));
    expect(onFill).toHaveBeenCalledWith(expect.objectContaining({ unit_id: 2, shift_type: "day", need: 2 }));
  });

  it("hides the fill buttons when the person cannot fill", () => {
    render(<StaffingDayPanel iso="2026-10-22" info={info} onOpenDay={() => {}} />);
    expect(screen.queryByRole("button", { name: /Assign/ })).toBeNull();
  });

  it("offers + Add shift only to admins and Open day to everyone", () => {
    const onAdd = jest.fn();
    const onOpenDay = jest.fn();
    const { rerender } = render(<StaffingDayPanel iso="2026-10-22" info={info} onOpenDay={onOpenDay} />);
    expect(screen.queryByText("+ Add shift")).toBeNull();
    fireEvent.click(screen.getByText("Open day"));
    expect(onOpenDay).toHaveBeenCalled();
    rerender(<StaffingDayPanel iso="2026-10-22" info={info} isAdmin onAdd={onAdd} onOpenDay={onOpenDay} />);
    fireEvent.click(screen.getByText("+ Add shift"));
    expect(onAdd).toHaveBeenCalled();
  });

  it("says so when no requirement applies", () => {
    render(<StaffingDayPanel iso="2026-10-25" info={null} onOpenDay={() => {}} />);
    expect(screen.getByText(/No coverage requirement applies/)).toBeInTheDocument();
  });
});
