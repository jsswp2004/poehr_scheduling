import { render, screen, fireEvent } from "@testing-library/react";
import OrderSchedule from "../tasks/OrderSchedule";
import { missingSchedule, scheduleSummary } from "../tasks/taskShared";

jest.mock("../../api/client", () => ({ api: {} }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: {} }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });

const MED = { id: 7, task_mode: "required", orderable_category: "medication" };
const NURSING = { id: 8, task_mode: "optional", orderable_category: "nursing" };
const LAB = { id: 9, task_mode: "none", orderable_category: "laboratory" };

test("a lab order shows no schedule at all", () => {
  const { container } = render(<OrderSchedule order={LAB} value={{}} onChange={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test("a medication says what is missing before it can be signed", () => {
  render(<OrderSchedule order={MED} value={{}} onChange={() => {}} />);
  expect(screen.getByTestId("schedule-missing-7")).toHaveTextContent("frequency, dose, route");
});

test("a complete medication schedule shows nothing missing", () => {
  render(<OrderSchedule order={MED} value={{ frequency: "bid", dose: "500 mg", route: "PO" }} onChange={() => {}} />);
  expect(screen.queryByTestId("schedule-missing-7")).not.toBeInTheDocument();
});

test("typing a dose sends the whole schedule back without blank values", () => {
  const onChange = jest.fn();
  render(<OrderSchedule order={MED} value={{ frequency: "bid" }} onChange={onChange} />);
  fireEvent.change(screen.getByTestId("schedule-dose-7"), { target: { value: "500 mg" } });
  expect(onChange).toHaveBeenCalledWith({ frequency: "bid", dose: "500 mg" });
});

test("as needed asks for the reason and the minimum gap, and drops the clock options", () => {
  const onChange = jest.fn();
  render(<OrderSchedule order={MED} value={{ frequency: "prn", dose: "650 mg", route: "PO" }} onChange={onChange} />);
  expect(screen.getByTestId("schedule-missing-7")).toHaveTextContent("PRN reason");
  expect(screen.queryByTestId("schedule-now-7")).not.toBeInTheDocument();
  fireEvent.change(screen.getByTestId("schedule-prn-reason-7"), { target: { value: "pain" } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ prn_reason: "pain" }));
  fireEvent.change(screen.getByTestId("schedule-min-interval-7"), { target: { value: "4" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ min_interval_hours: 4 }));
});

test("a clock frequency offers 'first dose now' and a length of therapy", () => {
  const onChange = jest.fn();
  render(<OrderSchedule order={MED} value={{ frequency: "bid", dose: "1", route: "PO" }} onChange={onChange} />);
  fireEvent.click(screen.getByTestId("schedule-now-7"));
  expect(onChange).toHaveBeenLastCalledWith({ frequency: "bid", dose: "1", route: "PO", first_dose_now: true });
  fireEvent.change(screen.getByTestId("schedule-duration-mode-7"), { target: { value: "days" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ duration_days: 7 }));
});

test("a nursing order may be left as a standing instruction", () => {
  render(<OrderSchedule order={NURSING} value={{}} onChange={() => {}} />);
  expect(screen.getByTestId("schedule-8")).toHaveTextContent("Leave the frequency empty for a standing instruction");
  expect(screen.queryByTestId("schedule-missing-8")).not.toBeInTheDocument();
  expect(screen.queryByTestId("schedule-dose-8")).not.toBeInTheDocument();
});

test("the summary line and the missing-parts rule", () => {
  expect(scheduleSummary({ frequency: "bid", dose: "500 mg", route: "PO", duration_days: 5 })).toBe("500 mg · PO · Twice a day (BID) · for 5 days");
  expect(scheduleSummary({ frequency: "prn", dose: "650 mg", route: "PO", prn_reason: "pain" })).toBe("650 mg · PO · As needed (PRN) · for pain");
  expect(scheduleSummary({})).toBe("");
  expect(missingSchedule(LAB, {})).toEqual([]);
  expect(missingSchedule(NURSING, {})).toEqual([]);
  expect(missingSchedule(NURSING, { frequency: "daily" })).toEqual([]);
  expect(missingSchedule(MED, { frequency: "daily" })).toEqual(["dose", "route"]);
});
