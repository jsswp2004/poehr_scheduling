import { render, screen, fireEvent } from "@testing-library/react";
import CareSettingSidebar, { COLLAPSED_KEY, SELECTED_KEY, storedCareSetting, rememberCareSetting } from "../patients/CareSettingSidebar";

beforeEach(() => window.localStorage.clear());

test("lists all patients and the three care settings", () => {
  render(<CareSettingSidebar value="" onChange={() => {}} />);
  for (const name of ["All patients", "Ambulatory Care", "Emergency Care", "Acute Care"]) {
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  }
  expect(screen.getByRole("button", { name: "All patients" })).toHaveAttribute("aria-current", "true");
});

test("clicking a setting reports its key", () => {
  const onChange = jest.fn();
  render(<CareSettingSidebar value="" onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Emergency Care" }));
  expect(onChange).toHaveBeenCalledWith("emergency");
  fireEvent.click(screen.getByRole("button", { name: "All patients" }));
  expect(onChange).toHaveBeenLastCalledWith("");
});

test("marks the chosen setting", () => {
  render(<CareSettingSidebar value="acute" onChange={() => {}} />);
  expect(screen.getByRole("button", { name: "Acute Care" })).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("button", { name: "Ambulatory Care" })).not.toHaveAttribute("aria-current");
});

test("collapses to icons, expands again, and remembers", () => {
  const { unmount } = render(<CareSettingSidebar value="" onChange={() => {}} />);
  const nav = screen.getByTestId("care-setting-sidebar");
  expect(nav).toHaveAttribute("data-collapsed", "false");
  expect(screen.getByText("Care setting")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(nav).toHaveAttribute("data-collapsed", "true");
  expect(screen.queryByText("Care setting")).not.toBeInTheDocument();
  // the buttons are still there (icon only) and still named
  expect(screen.getByRole("button", { name: "Emergency Care" })).toBeInTheDocument();
  expect(window.localStorage.getItem(COLLAPSED_KEY)).toBe("1");
  unmount();
  render(<CareSettingSidebar value="" onChange={() => {}} />); // next visit: still collapsed
  expect(screen.getByTestId("care-setting-sidebar")).toHaveAttribute("data-collapsed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(screen.getByTestId("care-setting-sidebar")).toHaveAttribute("data-collapsed", "false");
  expect(window.localStorage.getItem(COLLAPSED_KEY)).toBe("0");
});

test("the chosen setting is remembered, junk is ignored", () => {
  expect(storedCareSetting()).toBe("");
  rememberCareSetting("emergency");
  expect(window.localStorage.getItem(SELECTED_KEY)).toBe("emergency");
  expect(storedCareSetting()).toBe("emergency");
  window.localStorage.setItem(SELECTED_KEY, "bogus");
  expect(storedCareSetting()).toBe("");
});

test("works when storage is blocked", () => {
  const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const set = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(<CareSettingSidebar value="" onChange={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" })); // still collapses for this visit
  expect(screen.getByTestId("care-setting-sidebar")).toHaveAttribute("data-collapsed", "true");
  expect(storedCareSetting()).toBe("");
  spy.mockRestore();
  set.mockRestore();
});
