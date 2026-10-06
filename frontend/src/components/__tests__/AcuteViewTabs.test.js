import { render, screen, fireEvent } from "@testing-library/react";
import AcuteViewTabs from "../patients/AcuteViewTabs";

test("shows Patient List and Bed Board as tabs and reports the one chosen", () => {
  const onChange = jest.fn();
  render(<AcuteViewTabs value="list" onChange={onChange} />);
  expect(screen.getByRole("tab", { name: "Patient List" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Bed Board" })).toHaveAttribute("aria-selected", "false");
  fireEvent.click(screen.getByRole("tab", { name: "Bed Board" }));
  expect(onChange).toHaveBeenCalledWith("beds");
});

test("the selected tab follows the value", () => {
  render(<AcuteViewTabs value="beds" onChange={() => {}} />);
  expect(screen.getByRole("tab", { name: "Bed Board" })).toHaveAttribute("aria-selected", "true");
});
