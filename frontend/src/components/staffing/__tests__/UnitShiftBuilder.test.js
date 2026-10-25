import { render, screen, fireEvent } from "@testing-library/react";
import UnitShiftBuilder, { checkShifts, shiftHours } from "../UnitShiftBuilder";

const reg = { name: "Regular day", start: "08:00", end: "17:00", break_minutes: 60 };

test("care hours subtract the unpaid break and flag next-day ends", () => {
  expect(shiftHours(reg).care).toBe(8);
  const night = shiftHours({ start: "23:00", end: "07:00", break_minutes: 0 });
  expect(night.care).toBe(8);
  expect(night.nextDay).toBe(true);
});

test("duplicate names are errors, overlaps are warnings", () => {
  const dup = checkShifts([reg, { ...reg, name: "regular day", start: "18:00", end: "22:00" }]);
  expect(dup.errors.length).toBe(1);
  const over = checkShifts([reg, { name: "Short", start: "16:00", end: "20:00", break_minutes: 0 }]);
  expect(over.errors).toEqual([]);
  expect(over.warnings.length).toBe(1);
});

test("quick-add chip adds a shift", () => {
  const onChange = jest.fn();
  render(<UnitShiftBuilder shifts={[]} onChange={onChange} />);
  fireEvent.click(screen.getByText(/Regular day 8:00/));
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: "Regular day", start: "08:00", end: "17:00" })]);
});
