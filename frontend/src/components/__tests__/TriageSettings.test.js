import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), put: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { triageSettings: "/t/settings/" } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import TriageSettings from "../triage/TriageSettings";
import {
  addBand, ageFromText, bandStarts, feverFromDraft, feverToDraft, gapsFromDraft, gapsToDraft, removeLastBand, sourceLine, zoneFromDraft, zoneToDraft,
} from "../triage/triageSettingsHelpers";

const ZONE = {
  bands: [
    { label: "Under 3 months", min_months: 0, max_months: 3, hr_over: 180, rr_over: 50 },
    { label: "3 months to under 3 years", min_months: 3, max_months: 36, hr_over: 160, rr_over: 40 },
    { label: "3 years and older", min_months: 36, max_months: null, hr_over: 100, rr_over: 20 },
  ],
  spo2_below: 92,
};
const FEVER = { neonate_days: 28, fever_c: 38, infant_months: 3, older_high_c: 39, older_low_c: 36 };
const SETTINGS = (over = {}, clinic = {}) => ({
  danger_zone: ZONE, fever: FEVER, reassess_minutes: {}, sources: { danger_zone: "Handbook chapter 3.", fever: "Handbook chapter 2." },
  clinic: { danger_zone: false, fever: false, approved_by: null, approved_at: null, suicide_screen_min_age_years: null, ...clinic }, ...over,
});

describe("helpers", () => {
  test("recheck times", () => {
    expect(gapsToDraft({ 3: 60, "4": 120 })).toEqual({ 1: "", 2: "", 3: "60", 4: "120", 5: "" });
    expect(gapsFromDraft({ 3: " 60 ", 4: "", 5: "90" })).toEqual({ value: { 3: 60, 5: 90 }, problem: "" });
    expect(gapsFromDraft({ 3: "0" }).problem).toMatch(/ESI 3/);
    expect(gapsFromDraft({ 2: "1.5" }).problem).toMatch(/whole minutes/);
    expect(gapsFromDraft({ 1: "2000" }).problem).toMatch(/ESI 1/);
    expect(gapsFromDraft({ 3: "abc" }).value).toBeNull();
  });
  test("age table round trip", () => {
    const draft = zoneToDraft(ZONE);
    expect(draft.bands.map((b) => b.max)).toEqual(["3", "36", ""]);
    expect(bandStarts(draft)).toEqual([0, 3, 36]);
    const { value, problem } = zoneFromDraft(draft);
    expect(problem).toBe("");
    expect(value.bands).toEqual([
      { min_months: 0, max_months: 3, hr_over: 180, rr_over: 50 },
      { min_months: 3, max_months: 36, hr_over: 160, rr_over: 40 },
      { min_months: 36, max_months: null, hr_over: 100, rr_over: 20 },
    ]);
    expect(value.spo2_below).toBe(92);
  });
  test("age table checks", () => {
    const d = () => zoneToDraft(ZONE);
    let x = d(); x.bands[0].max = "0";
    expect(zoneFromDraft(x).problem).toMatch(/Band 1.*greater than 0/);
    x = d(); x.bands[1].max = "3";
    expect(zoneFromDraft(x).problem).toMatch(/Band 2.*greater than 3/);
    x = d(); x.bands[2].hr = "10";
    expect(zoneFromDraft(x).problem).toMatch(/Band 3.*heart rate/);
    x = d(); x.bands[0].rr = "";
    expect(zoneFromDraft(x).problem).toMatch(/respiratory/);
    x = d(); x.spo2 = "40";
    expect(zoneFromDraft(x).problem).toMatch(/oxygen/);
    expect(zoneFromDraft({ bands: [], spo2: "92" }).problem).toMatch(/at least one/);
  });
  test("add and remove a band", () => {
    const added = addBand(zoneToDraft(ZONE));
    expect(added.bands.map((b) => b.max)).toEqual(["3", "36", "48", ""]);
    expect(added.bands[3]).toMatchObject({ hr: "100", rr: "20" });
    expect(zoneFromDraft(added).problem).toBe("");
    const removed = removeLastBand(added);
    expect(removed.bands.map((b) => b.max)).toEqual(["3", "36", ""]);
    expect(removeLastBand({ bands: [{ max: "", hr: "1", rr: "1" }], spo2: "92" }).bands).toHaveLength(1);
  });
  test("fever limits", () => {
    const d = feverToDraft(FEVER);
    expect(d.fever_c).toBe("38");
    expect(feverFromDraft(d)).toEqual({ value: FEVER, problem: "" });
    expect(feverFromDraft({ ...d, older_high_c: "hot" }).problem).toMatch(/Older child: fever over/);
    expect(feverFromDraft({ ...d, older_low_c: "" }).value).toBeNull();
  });
  test("suicide screen age", () => {
    expect(ageFromText("")).toEqual({ value: null, problem: "" });
    expect(ageFromText(" 12 ")).toEqual({ value: 12, problem: "" });
    expect(ageFromText("19").problem).toMatch(/0 to 18/);
    expect(ageFromText("12.5").problem).toMatch(/whole years/);
  });
  test("source line", () => {
    expect(sourceLine(false, {})).toBe("Using the built-in table.");
    expect(sourceLine(true, { approved_by: "Dana Lee", approved_at: "2026-10-20T15:00:00Z" })).toMatch(/^Your clinic's own numbers approved by Dana Lee on Oct 20, 2026\.$/);
    expect(sourceLine(true, {})).toBe("Your clinic's own numbers.");
  });
});

describe("TriageSettings", () => {
  beforeEach(() => { api.get.mockReset(); api.put.mockReset(); toast.success.mockReset(); });
  const open = async (settings = SETTINGS(), props = {}) => {
    api.get.mockResolvedValue({ data: settings });
    render(<TriageSettings {...props} />);
    await screen.findByTestId("triage-settings");
  };

  test("shows the clinic's numbers and where they came from", async () => {
    await open(SETTINGS({ reassess_minutes: { 3: 60 } }, { danger_zone: true, approved_by: "Dana Lee", approved_at: "2026-10-20T15:00:00Z" }));
    expect(screen.getByTestId("gap-3").value).toBe("60");
    expect(screen.getByTestId("gap-4").value).toBe("");
    expect(screen.getAllByTestId("zone-band")).toHaveLength(3);
    expect(screen.getByTestId("band-hr-0").value).toBe("180");
    expect(screen.getByTestId("zone-spo2").value).toBe("92");
    expect(screen.getByText(/approved by Dana Lee/)).toBeInTheDocument();
    expect(screen.getByText(/Handbook chapter 3/)).toBeInTheDocument();
    expect(screen.getByText("Use the built-in table")).not.toBeDisabled();
    expect(screen.getByText("Use the built-in limits")).toBeDisabled();
  });

  test("saves recheck times", async () => {
    await open();
    api.put.mockResolvedValue({ data: SETTINGS({ reassess_minutes: { 3: 60, 4: 120 } }) });
    fireEvent.change(screen.getByTestId("gap-3"), { target: { value: "60" } });
    fireEvent.change(screen.getByTestId("gap-4"), { target: { value: "120" } });
    fireEvent.click(screen.getByText("Save recheck times"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/t/settings/", { reassess_minutes: { 3: 60, 4: 120 } }, expect.anything()));
    expect(toast.success).toHaveBeenCalledWith("Recheck times saved.");
    expect(screen.getByTestId("gap-4").value).toBe("120");
  });

  test("a bad number is stopped before it is sent", async () => {
    await open();
    fireEvent.change(screen.getByTestId("gap-3"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("Save recheck times"));
    expect(await screen.findByTestId("settings-error")).toHaveTextContent("ESI 3");
    expect(api.put).not.toHaveBeenCalled();
  });

  test("saves the age table with an added band", async () => {
    await open();
    api.put.mockResolvedValue({ data: SETTINGS({}, { danger_zone: true }) });
    fireEvent.click(screen.getByText("Add an age band"));
    expect(screen.getAllByTestId("zone-band")).toHaveLength(4);
    fireEvent.click(screen.getByText("Save age table"));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = api.put.mock.calls[0][1];
    expect(body.danger_zone.bands).toHaveLength(4);
    expect(body.danger_zone.bands[2]).toMatchObject({ min_months: 36, max_months: 48 });
    expect(body.danger_zone.bands[3]).toMatchObject({ min_months: 48, max_months: null });
  });

  test("goes back to the built-in table", async () => {
    await open(SETTINGS({}, { danger_zone: true }));
    api.put.mockResolvedValue({ data: SETTINGS() });
    fireEvent.click(screen.getByText("Use the built-in table"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/t/settings/", { danger_zone: null }, expect.anything()));
  });

  test("saves fever limits and the suicide screen age", async () => {
    await open();
    api.put.mockResolvedValue({ data: SETTINGS({}, { fever: true }) });
    fireEvent.change(screen.getByTestId("fever-older_high_c"), { target: { value: "38.5" } });
    fireEvent.click(screen.getByText("Save fever limits"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/t/settings/", { fever: { ...FEVER, older_high_c: 38.5 } }, expect.anything()));
    api.put.mockResolvedValue({ data: SETTINGS({}, { suicide_screen_min_age_years: 12 }) });
    fireEvent.change(screen.getByTestId("screen-age"), { target: { value: "12" } });
    fireEvent.click(screen.getByText("Save starting age"));
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith("/t/settings/", { suicide_screen_min_age_years: 12 }, expect.anything()));
  });

  test("a server refusal is shown in that section", async () => {
    await open();
    api.put.mockRejectedValue({ response: { data: { detail: "Fever limit fever_c must be a number." } } });
    fireEvent.click(screen.getByText("Save fever limits"));
    expect(await screen.findByText("Fever limit fever_c must be a number.")).toBeInTheDocument();
  });

  test("someone who cannot edit sees the numbers but no active buttons", async () => {
    await open(SETTINGS(), { canEdit: false });
    expect(screen.getByText(/Only an administrator/)).toBeInTheDocument();
    expect(screen.getByText("Save recheck times")).toBeDisabled();
    expect(screen.getByTestId("gap-3")).toBeDisabled();
  });

  test("a load failure is shown", async () => {
    api.get.mockRejectedValue({ response: { data: { detail: "nope" } } });
    render(<TriageSettings />);
    expect(await screen.findByTestId("settings-load-error")).toBeInTheDocument();
  });
});
