import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "user-event-14";
import { ApiError, patientApi } from "./api";
import PatientJoinPage from "./PatientJoinPage";

jest.mock("../api/client", () => ({ __esModule: true, api: { request: jest.fn() } }));
jest.mock("../utils/auth", () => ({ __esModule: true, getValidToken: jest.fn() }));

jest.mock("./api", () => {
  const actual = jest.requireActual("./api");
  return {
    __esModule: true,
    ...actual,
    patientApi: {
      ping: jest.fn(),
      redeem: jest.fn(),
      consent: jest.fn(),
      status: jest.fn(),
      media: jest.fn(),
      presence: jest.fn(),
    },
  };
});

// Camera and the Chime SDK can't run in jsdom, so stand-ins keep these tests on page logic.
jest.mock("./DeviceCheck", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ onReady, continueLabel }) =>
      React.createElement(
        "button",
        { type: "button", onClick: () => onReady({ audioInputId: "mic", videoInputId: "cam" }) },
        continueLabel
      ),
  };
});
jest.mock("./VideoRoom", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ joinInfo, onJoined }) => {
      React.useEffect(() => {
        onJoined?.();
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return React.createElement("div", null, `In call ${joinInfo.Attendee.AttendeeId}`);
    },
  };
});

const open = (hash) => window.history.replaceState(null, "", `/join${hash}`);

// The shared test setup doesn't reset browser storage between tests; these components use it.
afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

beforeEach(() => {
  jest.clearAllMocks();
  patientApi.presence.mockResolvedValue({ ok: true });
  patientApi.consent.mockResolvedValue({ ok: true });
  patientApi.media.mockResolvedValue({ Meeting: {}, Attendee: { AttendeeId: "att-1" } });
});

describe("PatientJoinPage", () => {
  it("walks from link to consent to waiting room to call, and clears the token from the address", async () => {
    open("#token-flow");
    patientApi.redeem.mockResolvedValue({ rejoin_token: "rj", consent_required: true });
    patientApi.status
      .mockResolvedValueOnce({ status: "waiting", consented: false, admitted: false })
      .mockResolvedValue({ status: "in_progress", consented: true, admitted: true });
    const user = userEvent.setup();

    render(<PatientJoinPage />);

    expect(await screen.findByRole("heading", { name: "Before you join" })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(patientApi.redeem).toHaveBeenCalledTimes(1);
    expect(patientApi.redeem).toHaveBeenCalledWith("token-flow");

    await user.click(screen.getByRole("button", { name: "I agree and want to continue" }));
    expect(patientApi.consent).toHaveBeenCalledWith("rj");

    await user.click(await screen.findByRole("button", { name: "Go to the waiting room" }));
    expect(await screen.findByText("In call att-1")).toBeInTheDocument();
    expect(patientApi.media).toHaveBeenCalledTimes(1);
    expect(patientApi.presence).toHaveBeenCalledWith("rj", "joined");
  });

  it("stays in the waiting room and asks for no video until the provider admits", async () => {
    open("#token-wait");
    patientApi.redeem.mockResolvedValue({ rejoin_token: "rj2", consent_required: true });
    patientApi.status
      .mockResolvedValueOnce({ status: "waiting", consented: true, admitted: false })
      .mockResolvedValue({ status: "waiting", consented: true, admitted: false });
    const user = userEvent.setup();

    render(<PatientJoinPage />);
    await user.click(await screen.findByRole("button", { name: "Go to the waiting room" }));

    expect(await screen.findByRole("heading", { name: "You're in the waiting room" })).toBeInTheDocument();
    await waitFor(() => expect(patientApi.status).toHaveBeenCalledTimes(2));
    expect(patientApi.media).not.toHaveBeenCalled();
  });

  it("explains a used or expired link in plain words", async () => {
    open("#token-dead");
    patientApi.redeem.mockRejectedValue(new ApiError(410, "link_unavailable"));

    render(<PatientJoinPage />);

    expect(await screen.findByRole("heading", { name: "This link can't be used" })).toBeInTheDocument();
    expect(screen.getByText(/ask them to send you a new link/i)).toBeInTheDocument();
  });

  it("resumes after a refresh from the saved session instead of the burned link", async () => {
    open("");
    window.sessionStorage.setItem("telehealth.rejoin", "saved-rj");
    patientApi.status.mockResolvedValue({ status: "waiting", consented: true, admitted: false });

    render(<PatientJoinPage />);

    expect(await screen.findByRole("button", { name: "Go to the waiting room" })).toBeInTheDocument();
    expect(patientApi.redeem).not.toHaveBeenCalled();
    expect(patientApi.status).toHaveBeenCalledWith("saved-rj");
  });

  it("shows the unavailable page when there is no link and no saved session", async () => {
    open("");

    render(<PatientJoinPage />);

    expect(await screen.findByRole("heading", { name: "This link can't be used" })).toBeInTheDocument();
    expect(patientApi.redeem).not.toHaveBeenCalled();
  });

  it("tells the patient when the visit has ended while they wait", async () => {
    open("#token-ended");
    patientApi.redeem.mockResolvedValue({ rejoin_token: "rj3", consent_required: true });
    patientApi.status
      .mockResolvedValueOnce({ status: "waiting", consented: true, admitted: false })
      .mockRejectedValue(new ApiError(410, "link_unavailable"));
    const user = userEvent.setup();

    render(<PatientJoinPage />);
    await user.click(await screen.findByRole("button", { name: "Go to the waiting room" }));

    expect(await screen.findByRole("heading", { name: "This visit has ended" })).toBeInTheDocument();
  });
});
