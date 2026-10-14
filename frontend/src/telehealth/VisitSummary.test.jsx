import { render, screen } from "@testing-library/react";
import userEvent from "user-event-14";
import { ApiError, staffApi } from "./api";
import { billingLine, needsLocation } from "./billingText";
import VisitSummary from "./VisitSummary";

jest.mock("../api/client", () => ({ __esModule: true, api: { request: jest.fn() } }));
jest.mock("../utils/auth", () => ({ __esModule: true, getValidToken: jest.fn() }));

jest.mock("./api", () => {
  const actual = jest.requireActual("./api");
  return {
    __esModule: true,
    ...actual, staffApi: { visitRecord: jest.fn(), saveVisitRecord: jest.fn() } };
});

// The shared test setup doesn't reset browser storage between tests; these components use it.
afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

const record = (over = {}) => ({
  session_id: "s1",
  modality: "audio_video",
  patient_location: "",
  patient_state: "",
  place_of_service: "",
  modifier: "95",
  location_confirmed: false,
  duration_minutes: 22,
  ready_for_billing: false,
  note_text: "TELEHEALTH VISIT - DRAFT. Provider to complete and sign.\nPatient location: NOT CONFIRMED.",
  note_pushed: false,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe("billing text", () => {
  it("explains the codes in words", () => {
    expect(billingLine({ place_of_service: "10", modifier: "95" })).toBe(
      "Place of service 10 (telehealth, patient at home), modifier 95 (real-time audio and video)"
    );
    expect(billingLine({ place_of_service: "02", modifier: "93" })).toContain("patient not at home");
    expect(billingLine({ place_of_service: "", modifier: "95" })).toBeNull();
    expect(billingLine(null)).toBeNull();
  });

  it("flags only visits that happened and lack a location", () => {
    expect(needsLocation({ status: "ended", started_at: "t", billing: null })).toBe(true);
    expect(needsLocation({ status: "ended", started_at: "t", billing: { confirmed: false } })).toBe(true);
    expect(needsLocation({ status: "ended", started_at: "t", billing: { confirmed: true } })).toBe(false);
    expect(needsLocation({ status: "ended", started_at: null, billing: null })).toBe(false);
    expect(needsLocation({ status: "in_progress", started_at: "t", billing: null })).toBe(false);
  });
});

describe("VisitSummary", () => {
  it("shows the draft note and asks where the patient was", async () => {
    staffApi.visitRecord.mockResolvedValue(record());
    render(<VisitSummary sessionId="s1" />);
    expect(await screen.findByLabelText("Draft note")).toHaveValue(record().note_text);
    expect(screen.getByText(/hasn't gone to the chart/)).toBeInTheDocument();
    expect(screen.queryByText(/For billing/)).not.toBeInTheDocument();
  });

  it("won't save until a location is chosen", async () => {
    staffApi.visitRecord.mockResolvedValue(record());
    const user = userEvent.setup();
    render(<VisitSummary sessionId="s1" />);
    await user.click(await screen.findByRole("button", { name: "Save visit details" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose where the patient was");
    expect(staffApi.saveVisitRecord).not.toHaveBeenCalled();
  });

  it("saves, then shows the billing labels and the updated note", async () => {
    staffApi.visitRecord.mockResolvedValue(record());
    staffApi.saveVisitRecord.mockResolvedValue(
      record({
        patient_location: "home",
        patient_state: "NY",
        place_of_service: "10",
        location_confirmed: true,
        ready_for_billing: true,
        note_text: "Patient location (confirmed by provider): at home. State: NY.",
      })
    );
    const onSaved = jest.fn();
    const user = userEvent.setup();
    render(<VisitSummary sessionId="s1" onSaved={onSaved} />);

    await user.click(await screen.findByLabelText("At home"));
    await user.type(screen.getByLabelText(/State the patient was in/), "ny");
    await user.click(screen.getByRole("button", { name: "Save visit details" }));

    expect(staffApi.saveVisitRecord).toHaveBeenCalledWith("s1", {
      patient_location: "home",
      patient_state: "ny", // the server uppercases it
      modality: "audio_video",
    });
    expect(await screen.findByText(/Place of service 10/)).toBeInTheDocument();
    expect(screen.getByText(/still chooses the visit code/)).toBeInTheDocument();
    expect(screen.getByLabelText("Draft note")).toHaveValue("Patient location (confirmed by provider): at home. State: NY.");
    expect(onSaved).toHaveBeenCalled();
  });

  it("lets the provider record an audio-only visit", async () => {
    staffApi.visitRecord.mockResolvedValue(record());
    staffApi.saveVisitRecord.mockResolvedValue(record({ patient_location: "other", place_of_service: "02", modifier: "93", modality: "audio_only", location_confirmed: true }));
    const user = userEvent.setup();
    render(<VisitSummary sessionId="s1" />);
    await user.click(await screen.findByLabelText(/Somewhere else/));
    await user.click(screen.getByLabelText(/Audio only/));
    await user.click(screen.getByRole("button", { name: "Save visit details" }));
    expect(staffApi.saveVisitRecord).toHaveBeenCalledWith("s1", expect.objectContaining({ patient_location: "other", modality: "audio_only" }));
    expect(await screen.findByText(/modifier 93/)).toBeInTheDocument();
  });

  it("copies the note", async () => {
    staffApi.visitRecord.mockResolvedValue(record());
    const user = userEvent.setup();
    const writeText = jest.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<VisitSummary sessionId="s1" />);
    await user.click(await screen.findByRole("button", { name: "Copy note" }));
    expect(writeText).toHaveBeenCalledWith(record().note_text);
    expect(await screen.findByText("Copied.")).toBeInTheDocument();
  });

  it("works when the note hasn't been drafted yet", async () => {
    staffApi.visitRecord.mockRejectedValue(new ApiError(404, "request_failed"));
    render(<VisitSummary sessionId="s1" />);
    expect(await screen.findByRole("button", { name: "Save visit details" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tells non-providers what is missing instead of offering the form", async () => {
    staffApi.visitRecord.mockResolvedValue(record());
    render(<VisitSummary sessionId="s1" canAttest={false} />);
    expect(await screen.findByText(/hasn't confirmed where the patient was/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save visit details" })).not.toBeInTheDocument();
  });

  it("shows a plain message when saving fails", async () => {
    staffApi.visitRecord.mockResolvedValue(record());
    staffApi.saveVisitRecord.mockRejectedValue(new ApiError(0, "network_error"));
    const user = userEvent.setup();
    render(<VisitSummary sessionId="s1" />);
    await user.click(await screen.findByLabelText("At home"));
    await user.click(screen.getByRole("button", { name: "Save visit details" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
  });
});
