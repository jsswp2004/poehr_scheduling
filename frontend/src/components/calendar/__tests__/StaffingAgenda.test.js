import { render, screen, fireEvent } from "@testing-library/react";
import StaffingAgenda, { StaffingAgendaView, agendaRange, agendaTitle, shortLine } from "../StaffingAgenda";
import { StaffingDayContext } from "../StaffingDayBoard";

const info = {
  status: "not_met",
  items: [
    { unit_id: 1, unit_name: "2 West", shift_type: "day", status: "met", assigned: 2, required: 2 },
    { unit_id: 1, unit_name: "2 West", shift_type: "night", status: "not_met", assigned: 1, required: 3 },
  ],
};
const shifts = [
  { id: 1, date: "2026-10-22", unit: 1, unit_name: "2 West", shift_type: "day", staff_name: "Jane Doe", nursing_role: "rn" },
  { id: 2, date: "2026-10-22", unit: 1, unit_name: "2 West", shift_type: "night", staff_name: "Jane Carter", nursing_role: "rn" },
];

const renderAgenda = (ctx = {}, props = {}) =>
  render(
    <StaffingDayContext.Provider
      value={{ coverage: { days: { "2026-10-22": info } }, shifts, loading: false, failed: false, isAdmin: true, canFill: () => true, fillLabel: "Assign", onFill: jest.fn(), onAdd: jest.fn(), ...ctx }}
    >
      <StaffingAgenda date={new Date(2026, 9, 22)} {...props} />
    </StaffingDayContext.Provider>
  );

describe("agenda helpers", () => {
  it("covers seven days from the selected date and pages by a week", () => {
    const days = agendaRange(new Date(2026, 9, 22, 15));
    expect(days).toHaveLength(7);
    expect(days[0].getDate()).toBe(22);
    expect(days[6].getDate()).toBe(28);
    expect(StaffingAgendaView.navigate(new Date(2026, 9, 22), "NEXT").getDate()).toBe(29);
    expect(StaffingAgendaView.navigate(new Date(2026, 9, 22), "PREV").getDate()).toBe(15);
    expect(agendaTitle(new Date(2026, 9, 22))).toBe("October 22 – 28");
    expect(agendaTitle(new Date(2026, 9, 28))).toBe("Oct 28 – Nov 3");
  });
  it("words what is short", () => {
    expect(shortLine([{ unit_name: "2 West", need: 2, kind: "staff" }, { unit_name: "4 East", need: 1, kind: "rn" }], null, [])).toBe(
      "2 West short 2, 4 East short 1 RN"
    );
    expect(shortLine([], { status: "met" }, [{}])).toBe("Covered");
    expect(shortLine([], { status: "not_met", reasons: ["Short on care hours"] }, [{}])).toBe("Short on care hours");
  });
});

describe("StaffingAgenda", () => {
  it("shows a card per day with a row per shift and what is short", () => {
    renderAgenda();
    expect(screen.getByText("Thu, Oct 22")).toBeInTheDocument();
    expect(screen.getByText("Wed, Oct 28")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByText("2 West short 2")).toBeInTheDocument();
  });

  it("expands a row to show the people and the Assign button", () => {
    const onFill = jest.fn();
    renderAgenda({ onFill });
    expect(screen.queryByText("Jane Carter")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Night 1 of 3/ }));
    expect(screen.getByText("Jane Carter")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Assign 2 West Night/ }));
    expect(onFill).toHaveBeenCalledWith(expect.objectContaining({ unit_id: 1, shift_type: "night", need: 2 }), "2026-10-22");
    fireEvent.click(screen.getByRole("button", { name: /Night 1 of 3/ }));
    expect(screen.queryByText("Jane Carter")).toBeNull();
  });

  it("opens the day in Day view", () => {
    const onDrillDown = jest.fn();
    renderAgenda({}, { onDrillDown });
    fireEvent.click(screen.getByRole("button", { name: /Open day Thursday, October 22/ }));
    expect(onDrillDown.mock.calls[0][0].getDate()).toBe(22);
    expect(onDrillDown.mock.calls[0][1]).toBe("day");
  });

  it("says so for a day with nothing, and offers + Add shift to admins", () => {
    const onAdd = jest.fn();
    renderAgenda({ onAdd });
    expect(screen.getAllByText(/Nothing scheduled/).length).toBe(6);
    fireEvent.click(screen.getAllByText("+ Add shift")[0]);
    expect(onAdd).toHaveBeenCalledWith("2026-10-23");
  });

  it("hides Assign for people who cannot fill, and shows the coverage warning", () => {
    renderAgenda({ canFill: () => false, failed: true });
    fireEvent.click(screen.getByRole("button", { name: /Night 1 of 3/ }));
    expect(screen.queryByRole("button", { name: /Assign/ })).toBeNull();
    expect(screen.getByText(/coverage colours unavailable/)).toBeInTheDocument();
  });
});
