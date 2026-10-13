import { render, screen } from "@testing-library/react";
import userEvent from "user-event-14";
import PatientPanel from "./PatientPanel";

const inVisit = (billing = null) => ({
  patient_display: "Di Inside",
  session: {
    status: "in_progress",
    started_at: "2026-10-13T10:00:00Z",
    billing,
    participants: [
      { role: "provider" },
      { role: "patient", arrived_at: "2026-10-13T09:58:00Z", admitted_at: "2026-10-13T10:00:00Z", consented: true, joined_at: "2026-10-13T10:00:05Z", left_at: null },
    ],
  },
});

const props = { nowMs: Date.now(), offsetMs: 0, busy: false, error: null, onAdmit: jest.fn(), onResend: jest.fn() };

// The shared test setup doesn't reset browser storage between tests; these components use it.
afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("PatientPanel location", () => {
  it("lets the provider say where the patient is during the visit", async () => {
    const onLocation = jest.fn();
    const user = userEvent.setup();
    render(<PatientPanel {...props} item={inVisit()} onLocation={onLocation} />);

    const group = screen.getByRole("group", { name: "Where is the patient?" });
    expect(group).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "At home" }));
    expect(onLocation).toHaveBeenCalledWith("home");
    await user.click(screen.getByRole("button", { name: "Somewhere else" }));
    expect(onLocation).toHaveBeenLastCalledWith("other");
  });

  it("shows the current answer as pressed", () => {
    render(<PatientPanel {...props} item={inVisit({ confirmed: true, place_of_service: "10", modifier: "95" })} onLocation={jest.fn()} />);
    expect(screen.getByRole("button", { name: "At home" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Somewhere else" })).toHaveAttribute("aria-pressed", "false");
  });

  it("is absent before the patient is in the visit", () => {
    const item = inVisit();
    item.session.participants[1].admitted_at = null;
    render(<PatientPanel {...props} item={item} onLocation={jest.fn()} />);
    expect(screen.queryByRole("group", { name: "Where is the patient?" })).not.toBeInTheDocument();
  });
});
