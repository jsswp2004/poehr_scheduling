import { render, screen, fireEvent } from "@testing-library/react";
import StaffingWeekGrid, {
  StaffingWeekContext,
  StaffingWeekView,
  weekRange,
  weekTitle,
  weekUnits,
  dayGaps,
} from "../StaffingWeekGrid";

const coverage = {
  days: {
    "2026-10-19": {
      status: "met",
      items: [
        { unit_id: 1, unit_name: "2 West", shift_type: "day", status: "met", assigned: 4, required: 4, census: 30 },
        { unit_id: 2, unit_name: "4 East", shift_type: "day", status: "met", assigned: 3, required: 3, census: 20 },
      ],
    },
    "2026-10-22": {
      status: "not_met",
      items: [
        { unit_id: 1, unit_name: "2 West", shift_type: "day", status: "not_met", assigned: 3, required: 4 },
        { unit_id: 1, unit_name: "2 West", shift_type: "night", status: "at_risk", assigned: 3, required: 3 },
        { unit_id: 2, unit_name: "4 East", shift_type: "day", status: "met", assigned: 3, required: 3 },
      ],
    },
  },
};

const renderGrid = (ctx, props = {}) =>
  render(
    <StaffingWeekContext.Provider value={{ coverage: null, loading: false, failed: false, search: "", ...ctx }}>
      <StaffingWeekGrid date={new Date(2026, 9, 22)} {...props} />
    </StaffingWeekContext.Provider>
  );

describe("week helpers", () => {
  it("returns the seven days of the week and pages by a week", () => {
    const days = weekRange(new Date(2026, 9, 22));
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(0);
    const next = StaffingWeekView.navigate(new Date(2026, 9, 22), "NEXT");
    expect(next.getDate()).toBe(29);
    expect(StaffingWeekView.navigate(new Date(2026, 9, 22), "PREV").getDate()).toBe(15);
    expect(StaffingWeekView.range(new Date(2026, 9, 22))).toHaveLength(7);
  });
  it("titles a week", () => {
    expect(weekTitle(new Date(2026, 9, 22))).toBe("October 18 – 24");
    expect(weekTitle(new Date(2026, 9, 29))).toBe("October 25 – 31");
    expect(weekTitle(new Date(2026, 8, 30))).toBe("Sep 27 – Oct 3");
  });
  it("lists each unit once, sorted, with its census", () => {
    const units = weekUnits(coverage, ["2026-10-19", "2026-10-22"]);
    expect(units.map((u) => [u.name, u.census])).toEqual([["2 West", 30], ["4 East", 20]]);
  });
  it("counts gaps as not met or at risk shifts", () => {
    expect(dayGaps(coverage, "2026-10-22")).toHaveLength(2);
    expect(dayGaps(coverage, "2026-10-19")).toHaveLength(0);
    expect(dayGaps(null, "2026-10-19")).toHaveLength(0);
  });
});

describe("StaffingWeekGrid", () => {
  it("shows a row per unit with shift chips and the roll-up", () => {
    renderGrid({ coverage });
    expect(screen.getByText("2 West")).toBeInTheDocument();
    expect(screen.getByText("4 East")).toBeInTheDocument();
    expect(screen.getByText("Census 30")).toBeInTheDocument();
    expect(screen.getByText("D 3/4")).toBeInTheDocument();
    expect(screen.getByText("N 3/3 !")).toBeInTheDocument();
    expect(screen.getByText("2 gaps")).toBeInTheDocument();
    expect(screen.getAllByText("Covered").length).toBeGreaterThan(0);
  });

  it("opens the day when a cell or date is clicked", () => {
    const onDrillDown = jest.fn();
    renderGrid({ coverage }, { onDrillDown });
    fireEvent.click(screen.getByRole("button", { name: /2 West, Thu Oct 22/ }));
    expect(onDrillDown).toHaveBeenCalledTimes(1);
    expect(onDrillDown.mock.calls[0][0].getDate()).toBe(22);
    expect(onDrillDown.mock.calls[0][1]).toBe("day");
    fireEvent.click(screen.getByRole("button", { name: /Open Monday, October 19/ }));
    expect(onDrillDown.mock.calls[1][0].getDate()).toBe(19);
  });

  it("explains itself while loading, on failure and with no requirements", () => {
    const { unmount } = renderGrid({ loading: true });
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    unmount();
    const stale = renderGrid({ coverage: { days: {} }, loading: true });
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText(/No coverage requirements apply/)).toBeNull();
    stale.unmount();
    const onRetry = jest.fn();
    const second = renderGrid({ failed: true, onRetry });
    expect(screen.getByText(/coverage colours unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry coverage" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    second.unmount();
    renderGrid({ coverage: { days: {} } });
    expect(screen.getByText(/No coverage requirements apply this week/)).toBeInTheDocument();
  });
});
