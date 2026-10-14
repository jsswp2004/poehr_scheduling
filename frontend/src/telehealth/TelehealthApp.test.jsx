import { render, screen, within } from "@testing-library/react";
import userEvent from "user-event-14";
import { ApiError, staffApi } from "./api";
import TelehealthApp from "./TelehealthApp";

jest.mock("../api/client", () => ({ __esModule: true, api: { request: jest.fn() } }));
jest.mock("../utils/auth", () => ({ __esModule: true, getValidToken: jest.fn() }));

jest.mock("./api", () => {
  const actual = jest.requireActual("./api");
  return {
    __esModule: true,
    ...actual,
    staffApi: {
      schedule: jest.fn(),
      createSession: jest.fn(),
      sendJoinLink: jest.fn(),
      admit: jest.fn(),
      providerToken: jest.fn(),
      presence: jest.fn(),
      end: jest.fn(),
      visitRecord: jest.fn(),
      saveVisitRecord: jest.fn(),
    },
  };
});
jest.mock("./AssistantPanel", () => {
  const React = require("react");
  return { __esModule: true, default: () => React.createElement("aside", { "aria-label": "Assistant" }, "assistant open") };
});
jest.mock("./sound", () => ({ playChime: jest.fn() }));
jest.mock("./ProviderRoom", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ sessionId, startAt }) =>
      React.createElement(
        "div",
        null,
        React.createElement("p", null, `Room for ${sessionId}`),
        React.createElement("p", null, `Starts at ${startAt ?? "check"}`)
      ),
  };
});

// The shared test setup doesn't reset browser storage between tests; these components use it.
afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

const ago = (ms) => new Date(Date.now() - ms).toISOString();

function session(id, patient, status = "scheduled", over = {}) {
  return {
    id,
    appointment_id: 0,
    status,
    started_at: null,
    ended_at: null,
    billing: null,
    ...over,
    participants: [
      { role: "provider", arrived_at: null, admitted_at: null, consented: false, joined_at: null, left_at: null },
      { role: "patient", arrived_at: null, admitted_at: null, consented: false, joined_at: null, left_at: null, ...patient },
    ],
  };
}

const ITEMS = [
  { appointment_id: 1, scheduled_at: ago(-3600000), patient_display: "Ada Test", session: null },
  {
    appointment_id: 2,
    scheduled_at: ago(0),
    patient_display: "Ben Waiting",
    session: session("s2", { arrived_at: ago(60000), consented: true }, "waiting"),
  },
  {
    appointment_id: 3,
    scheduled_at: ago(0),
    patient_display: "Cy Longest",
    session: session("s3", { arrived_at: ago(247000), consented: true }, "waiting"),
  },
  {
    appointment_id: 4,
    scheduled_at: ago(1800000),
    patient_display: "Di Inside",
    session: session("s4", { arrived_at: ago(900000), admitted_at: ago(800000), consented: true }, "in_progress"),
  },
  {
    appointment_id: 5,
    scheduled_at: ago(7200000),
    patient_display: "Ed Finished",
    session: session("s5", { arrived_at: ago(8000000), admitted_at: ago(7500000), consented: true }, "ended", {
      started_at: ago(7500000),
      ended_at: ago(6000000),
    }),
  },
  {
    appointment_id: 6,
    scheduled_at: ago(10800000),
    patient_display: "Flo Done",
    session: session("s6", { arrived_at: ago(11000000), admitted_at: ago(10900000), consented: true }, "ended", {
      started_at: ago(10900000),
      ended_at: ago(9000000),
      billing: { confirmed: true, place_of_service: "10", modifier: "95" },
    }),
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  staffApi.schedule.mockImplementation(async () => ({
    date: "2026-10-13",
    server_time: new Date().toISOString(),
    items: ITEMS,
  }));
});

describe("TelehealthApp", () => {
  it("lists today's visits with plain-language status", async () => {
    render(<TelehealthApp />);
    const board = await screen.findByRole("list", { name: "Today's video visits" });
    expect(within(board).getByText("Ada Test")).toBeInTheDocument();
    expect(within(board).getByText("Not started")).toBeInTheDocument();
    expect(within(board).getAllByText("In the waiting room")).toHaveLength(2);
    expect(within(board).getByText("In the visit")).toBeInTheDocument();
  });

  it("shows the waiting room longest wait first, with a count on the tab", async () => {
    const user = userEvent.setup();
    render(<TelehealthApp />);
    await screen.findByText("Ada Test");

    const tab = screen.getByRole("tab", { name: /Waiting room/ });
    expect(within(tab).getByText("2")).toBeInTheDocument();
    await user.click(tab);

    const rows = within(await screen.findByRole("list", { name: "Patients in the waiting room" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Cy Longest")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/^4:0\d$/)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Ben Waiting")).toBeInTheDocument();
  });

  it("admits a waiting patient and opens the room", async () => {
    staffApi.admit.mockResolvedValue({});
    const user = userEvent.setup();
    render(<TelehealthApp />);
    await user.click(await screen.findByRole("tab", { name: /Waiting room/ }));

    const row = (await screen.findByText("Cy Longest")).closest("li");
    await user.click(within(row).getByRole("button", { name: "Admit patient" }));

    expect(staffApi.admit).toHaveBeenCalledWith("s3");
    expect(await screen.findByText("Room for s3")).toBeInTheDocument();
  });

  it("creates the session before sending a link, and says who it went to", async () => {
    staffApi.createSession.mockResolvedValue({ id: "new-1" });
    staffApi.sendJoinLink.mockResolvedValue({ sent: true });
    const user = userEvent.setup();
    render(<TelehealthApp />);

    const row = (await screen.findByText("Ada Test")).closest("li");
    await user.click(within(row).getByRole("button", { name: "Send link" }));

    expect(staffApi.createSession).toHaveBeenCalledWith(1);
    expect(staffApi.sendJoinLink).toHaveBeenCalledWith("new-1");
    expect(await screen.findByText("Link sent to Ada Test.")).toBeInTheDocument();
  });

  it("copies the link when texting is suppressed", async () => {
    staffApi.createSession.mockResolvedValue({ id: "new-2" });
    staffApi.sendJoinLink
      .mockResolvedValueOnce({ sent: false, reason: "no_consent" })
      .mockResolvedValueOnce({ sent: false, url: "https://example.test/telehealth/join#abc" });
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard, so spy on it after setup.
    const writeText = jest.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<TelehealthApp />);

    const row = (await screen.findByText("Ada Test")).closest("li");
    await user.click(within(row).getByRole("button", { name: "Send link" }));

    expect(staffApi.sendJoinLink).toHaveBeenLastCalledWith("new-2", false);
    expect(writeText).toHaveBeenCalledWith("https://example.test/telehealth/join#abc");
    expect(await screen.findByText(/has not agreed to receive texts. The link is copied/)).toBeInTheDocument();
  });

  it("explains a failed admit instead of failing silently", async () => {
    staffApi.admit.mockRejectedValue(new ApiError(400, "no_patient_waiting"));
    const user = userEvent.setup();
    render(<TelehealthApp />);
    await user.click(await screen.findByRole("tab", { name: /Waiting room/ }));

    const row = (await screen.findByText("Ben Waiting")).closest("li");
    await user.click(within(row).getByRole("button", { name: "Admit patient" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No patient is waiting yet.");
    expect(screen.queryByText(/Room for/)).not.toBeInTheDocument();
  });

  it("lets staff end any open session from the Schedule tab", async () => {
    const user = userEvent.setup();
    window.confirm = jest.fn(() => true);
    staffApi.end.mockResolvedValue({});
    render(<TelehealthApp />);
    await user.click(await screen.findByRole("tab", { name: "Schedule" }));

    const board = await screen.findByRole("list", { name: "Video visits on this day" });
    const row = within(board).getByText("Ben Waiting").closest("li");
    await user.click(within(row).getByRole("button", { name: "End session" }));

    expect(staffApi.end).toHaveBeenCalledWith("s2");
    // Not offered for visits that never started or have already ended.
    expect(within(within(board).getByText("Ada Test").closest("li")).queryByRole("button", { name: "End session" })).toBeNull();
    expect(within(within(board).getByText("Ed Finished").closest("li")).queryByRole("button", { name: "End session" })).toBeNull();
  });

  it("hides provider actions from people who can't conduct visits", async () => {
    render(<TelehealthApp canConduct={false} canManage />);
    const board = await screen.findByRole("list", { name: "Today's video visits" });
    expect(within(board).queryByRole("button", { name: "Admit patient" })).not.toBeInTheDocument();
    expect(within(board).queryByRole("button", { name: "Start visit" })).not.toBeInTheDocument();
    expect(within(board).getByRole("button", { name: "Send link" })).toBeInTheDocument();
    expect(within(board).getAllByRole("button", { name: "End session" }).length).toBeGreaterThan(0);
  });

  it("prompts the provider to add the patient's location after a finished visit", async () => {
    const user = userEvent.setup();
    render(<TelehealthApp />);
    const row = (await screen.findByText("Ed Finished")).closest("li");
    expect(within(row).getByText("Patient location needed")).toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: "Add visit details" }));
    expect(await screen.findByText("Room for s5")).toBeInTheDocument();
    expect(screen.getByText("Starts at ended")).toBeInTheDocument();
  });

  it("shows the billing labels once the location is confirmed, with nothing left to do", async () => {
    render(<TelehealthApp />);
    const row = (await screen.findByText("Flo Done")).closest("li");
    expect(within(row).getByText(/Place of service 10/)).toBeInTheDocument();
    expect(within(row).queryByText("Patient location needed")).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Add visit details" })).not.toBeInTheDocument();
  });

  it("only offers visit details to the provider", async () => {
    render(<TelehealthApp canConduct={false} canManage />);
    const row = (await screen.findByText("Ed Finished")).closest("li");
    expect(within(row).getByText("Patient location needed")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Add visit details" })).not.toBeInTheDocument();
  });

  it("shows the assistant only when the host turns it on", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TelehealthApp />);
    await screen.findByText("Ada Test");
    expect(screen.queryByRole("button", { name: "Ask the assistant" })).not.toBeInTheDocument();
    unmount();

    render(<TelehealthApp assistant />);
    await screen.findByText("Ada Test");
    await user.click(screen.getByRole("button", { name: "Ask the assistant" }));
    expect(screen.getByText("assistant open")).toBeInTheDocument();
  });

  it("moves between tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<TelehealthApp />);
    const first = await screen.findByRole("tab", { name: "Today" });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Waiting room/ })).toHaveAttribute("aria-selected", "true");
  });
});
