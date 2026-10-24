import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarSkeleton, CoverageFailedBanner, NoRequirementNotice } from "../StaffingStateViews";

describe("CoverageFailedBanner", () => {
  it("says what failed, what still works, and retries", () => {
    const onRetry = jest.fn();
    render(<CoverageFailedBanner detail="The people below are correct." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Shifts loaded, coverage colours unavailable.");
    expect(screen.getByRole("alert")).toHaveTextContent("The people below are correct.");
    fireEvent.click(screen.getByRole("button", { name: "Retry coverage" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("disables the button while retrying and hides it with no handler", () => {
    const { rerender } = render(<CoverageFailedBanner onRetry={() => {}} retrying />);
    expect(screen.getByRole("button", { name: "Retrying…" })).toBeDisabled();
    rerender(<CoverageFailedBanner />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("CalendarSkeleton", () => {
  it("is announced as loading", () => {
    render(<CalendarSkeleton />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });
});

describe("NoRequirementNotice", () => {
  it("names the unit and opens Units & Census", () => {
    const onOpenUnits = jest.fn();
    render(<NoRequirementNotice unitName="4 East" onOpenUnits={onOpenUnits} />);
    expect(screen.getByText(/No staffing requirement set for 4 East/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Open Units & Census/ }));
    expect(onOpenUnits).toHaveBeenCalledTimes(1);
  });
  it("has no button when it cannot navigate", () => {
    render(<NoRequirementNotice unitName="4 East" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
