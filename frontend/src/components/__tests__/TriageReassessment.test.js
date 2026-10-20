import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({
  apiEndpoints: { triageReassessments: (id) => `/t/${id}/reassessments/`, triageContext: (id) => `/t/${id}/context/` },
}), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({}), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "nurse", user_id: 5 }) }));

import { api } from "../../api/client";
import ReassessmentPanel from "../triage/ReassessmentPanel";
import { dueText, reassessmentBody, reassessmentProblem, vitalsText } from "../triage/triageHelpers";
import { reassessStatus, triageNoteStatus } from "../edBoard/edBoardColumns";
import { cellText, sortRows } from "../edBoard/edBoardTable";

const NOW = new Date("2026-10-20T15:00:00Z").getTime();
const min = (n) => new Date(NOW + n * 60000).toISOString();
const LOG = (over = {}) => ({
  triage: { note_id: 1, signed_at: min(-30), nurse: "Alvarez, Dana" },
  visit: { id: 9, esi: 3 },
  gap_minutes: 60, due_at: min(30),
  rows: [{ id: null, at: min(-30), vitals: { sbp: 168, dbp: 94, hr: 112 }, flags: { hr: { status: "high" } }, change: "Initial triage", level_before: null, level_after: 3, nurse: "Alvarez, Dana" }],
  ...over,
});

describe("helpers", () => {
  test("vitalsText", () => {
    expect(vitalsText({ sbp: 168, dbp: 94, hr: 112, rr: 22, spo2: 94, temp_f: 98.6, pain: 8 })).toBe("BP 168/94, HR 112, RR 22, SpO2 94%, T 98.6 F, pain 8/10");
    expect(vitalsText({})).toBe("");
  });
  test("reassessmentBody leaves blanks out", () => {
    expect(reassessmentBody({ hr: " 98 ", rr: "", change: " better ", level: 2 })).toEqual({ vitals: { hr: "98" }, change: "better", level: 2 });
    expect(reassessmentBody({})).toEqual({ vitals: {}, change: "" });
  });
  test("reassessmentProblem", () => {
    expect(reassessmentProblem({}, 3)).toMatch(/at least one/);
    expect(reassessmentProblem({ hr: "90" }, 3)).toBe("");
    expect(reassessmentProblem({ hr: "90", level: 2 }, 3)).toMatch(/level is different/);
    expect(reassessmentProblem({ level: 2, change: "worse" }, 3)).toBe("");
  });
  test("dueText", () => {
    expect(dueText({ due_at: min(-5) }, NOW)).toBe("Recheck overdue");
    expect(dueText({ due_at: min(20) }, NOW)).toMatch(/^Next recheck due \d\d:\d\d$/);
    expect(dueText({}, NOW)).toBe("");
  });
});

describe("board columns", () => {
  const visit = (triage) => ({ registration: 1, triage });
  test("triageNoteStatus", () => {
    expect(triageNoteStatus(visit(null)).state).toBe("none");
    expect(triageNoteStatus(visit({ note: "none" })).text).toBe("None");
    expect(triageNoteStatus(visit({ note: "draft" })).text).toBe("Draft");
    const s = triageNoteStatus(visit({ note: "signed", signed_at: min(-10) }));
    expect(s.state).toBe("signed");
    expect(s.text).toMatch(/^Signed \d\d:\d\d$/);
  });
  test("reassessStatus only for waiting patients with a signed note and a gap", () => {
    const signed = (due_at) => visit({ note: "signed", due_at, reassessments: 0 });
    expect(reassessStatus(signed(min(30)), false, NOW).state).toBe("none");
    expect(reassessStatus(visit({ note: "draft" }), true, NOW).state).toBe("none");
    expect(reassessStatus(signed(null), true, NOW).state).toBe("unset");
    expect(reassessStatus(signed(min(30)), true, NOW)).toMatchObject({ state: "ok", text: "Due in 00:30" });
    expect(reassessStatus(signed(min(8)), true, NOW).state).toBe("soon");
    expect(reassessStatus(signed(min(-5)), true, NOW)).toMatchObject({ state: "overdue", text: "Overdue 00:05" });
  });
  test("cell text and sorting", () => {
    const ctx = { now: NOW, statuses: [], limit: 60 };
    const row = (id, triage, type = "waiting") => ({ type, loc: "", visit: { registration: id, triage } });
    const a = row(1, { note: "signed", signed_at: min(-5), due_at: min(40) });
    const b = row(2, { note: "signed", signed_at: min(-50), due_at: min(-3) });
    const c = row(3, { note: "draft" });
    const d = row(4, null);
    expect(cellText({ key: "triage_note" }, c, ctx)).toBe("Draft");
    expect(cellText({ key: "reassess" }, b, ctx)).toBe("Overdue 00:03");
    expect(sortRows([d, c, a, b], { key: "reassess" }, "asc", ctx).map((r) => r.visit.registration)).toEqual([2, 1, 4, 3]);
    expect(sortRows([d, c, a], { key: "triage_note" }, "desc", ctx).map((r) => r.visit.registration)).toEqual([1, 3, 4]);
  });
});

describe("ReassessmentPanel", () => {
  beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

  test("shows nothing until the triage note is signed", async () => {
    api.get.mockResolvedValue({ data: LOG({ triage: null, rows: [] }) });
    const { container } = render(<ReassessmentPanel patientId={3} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  test("shows the initial triage row, the gap and the due time", async () => {
    api.get.mockResolvedValue({ data: LOG() });
    render(<ReassessmentPanel patientId={3} />);
    expect(await screen.findByTestId("reassessment-panel")).toBeInTheDocument();
    expect(screen.getByText("Initial triage")).toBeInTheDocument();
    expect(screen.getByText("BP 168/94, HR 112")).toBeInTheDocument();
    expect(screen.getByTestId("reassess-gap")).toHaveTextContent("Recheck every 60 minutes for ESI 3");
  });

  test("says when the clinic has not set a gap", async () => {
    api.get.mockResolvedValue({ data: LOG({ gap_minutes: null, due_at: null }) });
    render(<ReassessmentPanel patientId={3} />);
    expect(await screen.findByTestId("reassess-gap")).toHaveTextContent("has not set recheck times");
    expect(screen.queryByTestId("reassess-due")).toBeNull();
  });

  test("add a recheck posts the entered values and shows the new log", async () => {
    api.get.mockResolvedValue({ data: LOG() });
    const after = LOG({ rows: [...LOG().rows, { id: 5, at: min(0), vitals: { hr: 98 }, flags: {}, change: "Pain better", level_before: 3, level_after: 3, nurse: "Lopez, Ana" }] });
    api.post.mockResolvedValue({ data: after });
    render(<ReassessmentPanel patientId={3} />);
    fireEvent.click(await screen.findByText("Add reassessment"));
    fireEvent.change(screen.getByTestId("rf-hr"), { target: { value: "98" } });
    fireEvent.change(screen.getByTestId("rf-change"), { target: { value: "Pain better" } });
    fireEvent.click(screen.getByText("Save reassessment"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/t/3/reassessments/", { vitals: { hr: "98" }, change: "Pain better" }, expect.anything()));
    expect(await screen.findByText("Pain better")).toBeInTheDocument();
    expect(screen.queryByTestId("reassess-form")).toBeNull();
  });

  test("an empty form is stopped before it is sent", async () => {
    api.get.mockResolvedValue({ data: LOG() });
    render(<ReassessmentPanel patientId={3} />);
    fireEvent.click(await screen.findByText("Add reassessment"));
    fireEvent.click(screen.getByText("Save reassessment"));
    expect(await screen.findByTestId("reassess-form-error")).toHaveTextContent("at least one");
    expect(api.post).not.toHaveBeenCalled();
  });

  test("changing the level needs a reason and is sent", async () => {
    api.get.mockResolvedValue({ data: LOG() });
    api.post.mockResolvedValue({ data: LOG() });
    render(<ReassessmentPanel patientId={3} />);
    fireEvent.click(await screen.findByText("Add reassessment"));
    fireEvent.change(screen.getByTestId("rf-hr"), { target: { value: "130" } });
    fireEvent.click(screen.getByLabelText("ESI 2: Emergent"));
    fireEvent.click(screen.getByText("Save reassessment"));
    expect(await screen.findByTestId("reassess-form-error")).toHaveTextContent("level is different");
    fireEvent.change(screen.getByTestId("rf-change"), { target: { value: "Chest pain returned" } });
    fireEvent.click(screen.getByText("Save reassessment"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/t/3/reassessments/", { vitals: { hr: "130" }, change: "Chest pain returned", level: 2 }, expect.anything()));
  });

  test("a server refusal is shown in the form", async () => {
    api.get.mockResolvedValue({ data: LOG() });
    api.post.mockRejectedValue({ response: { data: { detail: "Pain must be a number from 0 to 10." } } });
    render(<ReassessmentPanel patientId={3} />);
    fireEvent.click(await screen.findByText("Add reassessment"));
    fireEvent.change(screen.getByTestId("rf-pain"), { target: { value: "11" } });
    fireEvent.click(screen.getByText("Save reassessment"));
    expect(await screen.findByTestId("reassess-form-error")).toHaveTextContent("Pain must be");
  });

  test("flowsheet button fills the vitals", async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes("context") ? { vitals: { hr: 101, spo2: 96, temp_f: 99.1 } } : LOG() }));
    render(<ReassessmentPanel patientId={3} />);
    fireEvent.click(await screen.findByText("Add reassessment"));
    fireEvent.click(screen.getByText("Use latest flowsheet vitals"));
    await waitFor(() => expect(screen.getByTestId("rf-hr").value).toBe("101"));
    expect(screen.getByTestId("rf-spo2").value).toBe("96");
    expect(screen.getByTestId("rf-temp_f").value).toBe("99.1");
  });

  test("a nurse who cannot add sees no add button", async () => {
    api.get.mockResolvedValue({ data: LOG() });
    render(<ReassessmentPanel patientId={3} canAdd={false} />);
    await screen.findByTestId("reassessment-panel");
    expect(screen.queryByText("Add reassessment")).toBeNull();
  });
});
