import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({
  apiEndpoints: { triageContext: (id) => `/t/${id}/context/`, triageSuggest: (id) => `/t/${id}/suggest/` },
}), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({}), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "nurse", user_id: 5 }) }));
jest.mock("../DynamicNoteForm", () => ({ __esModule: true, default: ({ template }) => (
  <div data-testid="dynamic">{(template?.fields || []).map((f) => f.key).join(",")}</div>
) }));

import { api } from "../../api/client";
import TriageNoteForm from "../triage/TriageNoteForm";
import {
  answersFromValues, checklist, filterTemplate, suicideAction, ESI_SECTION, SUICIDE_SECTION, CHILD_SECTION,
} from "../triage/triageHelpers";

const TEMPLATE = {
  fields: [
    { key: "chief_complaint", section_label: "Chief complaint and history" },
    { key: "first_airway", section_label: "Critical first look" },
    { key: "child_weight_kg", section_label: CHILD_SECTION },
    { key: "last_menstrual_period", section_label: "History" },
    { key: "cssrs_1", section_label: SUICIDE_SECTION },
    { key: "esi_level", section_label: ESI_SECTION },
  ],
};
const keys = (t) => t.fields.map((f) => f.key);

const CTX = (over = {}, patient = {}) => ({
  problem: "", problem_text: "",
  patient: { id: 3, name: "Rivera, Marcus", is_child: false, show_suicide_screen: true, sex: "male", ...patient },
  visit: null,
  vitals: { hr: 112, rr: 22, spo2: 94, temp_f: 98.6, sbp: 168, dbp: 94, pain: 8 },
  vital_flags: { hr: { status: "high", text: "Fast for an adult" }, spo2: { status: "ok", text: "" } },
  band: { label: "8 years and older" },
  allergies: { text: "Penicillin (hives)", emphasis: "alert" },
  medicines: [{ name: "Aspirin", strength: "81 mg", dose: "1 tab", frequency: "daily" }],
  settings: { reassess_minutes: {}, sources: [], clinic: {} },
  screener: {
    name: "Columbia screener", verified: false,
    questions: [
      { key: "cssrs_1", number: 1, text: "Wished you were dead?", timeframe: "past month" },
      { key: "cssrs_2", number: 2, text: "Thoughts of killing yourself?", timeframe: "past month" },
      { key: "cssrs_3", number: 3, text: "Thought about how?", ask_if: "cssrs_2" },
    ],
    actions: { referral: "Refer at discharge.", immediate: "Tell the charge nurse now." },
  },
  ...over,
});
const SUGGEST = { level: 2, label: "ESI 2", name: "Emergent", consider: false, reasons: ["high-risk situation"], prompts: [], needs: [], steps: { D: { answer: "n/a", text: "Not needed." } } };

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

describe("helpers", () => {
  test("filterTemplate for an adult drops child, suicide and ESI sections", () => {
    expect(keys(filterTemplate(TEMPLATE, CTX()))).toEqual(["chief_complaint", "first_airway"]);
  });
  test("filterTemplate for a girl keeps menstrual field; child swaps first-look", () => {
    const t = filterTemplate(TEMPLATE, CTX({}, { is_child: true, sex: "female" }));
    expect(keys(t)).toEqual(["chief_complaint", "child_weight_kg", "last_menstrual_period"]);
  });
  test("suicideAction", () => {
    expect(suicideAction({})).toBe("none");
    expect(suicideAction({ cssrs_1: "yes" })).toBe("referral");
    expect(suicideAction({ cssrs_2: "yes", cssrs_3: "yes" })).toBe("referral");
    expect(suicideAction({ cssrs_4: "yes" })).toBe("immediate");
    expect(suicideAction({ cssrs_5: "yes" })).toBe("immediate");
    expect(suicideAction({ cssrs_6: "yes", cssrs_6_recent: "yes" })).toBe("immediate");
    expect(suicideAction({ cssrs_6: "yes", cssrs_6_recent: "no" })).toBe("referral");
  });
  test("answersFromValues defaults", () => {
    expect(answersFromValues({})).toEqual({
      esi_a_life_saving: "", esi_b_high_risk: false, esi_b_confused: false, esi_b_severe_pain: false, esi_resources: "", child_immunizations: "",
    });
    expect(answersFromValues({ esi_resources: 0 }).esi_resources).toBe(0);
  });
  test("checklist blocks until complete and requires a reason when level differs", () => {
    const ctx = CTX();
    let items = checklist({}, ctx, null);
    expect(items.filter((i) => i.blocking && !i.done).map((i) => i.label)).toEqual(["Chief complaint", "Triage level"]);
    items = checklist({ chief_complaint: "Chest pain", esi_level: 3 }, ctx, { level: 2 });
    expect(items.find((i) => i.label.startsWith("Reason")).done).toBe(false);
    items = checklist({ chief_complaint: "x", esi_level: 3, esi_override_reason: "stable" }, ctx, { level: 2 });
    expect(items.filter((i) => i.blocking).every((i) => i.done)).toBe(true);
  });
  test("child needs weight, taken from flowsheet or note", () => {
    const child = CTX({}, { is_child: true });
    expect(checklist({ chief_complaint: "x" }, child, null).find((i) => i.label.includes("weight")).done).toBe(false);
    expect(checklist({ child_weight_kg: 12 }, child, null).find((i) => i.label.includes("weight")).done).toBe(true);
    const withFlow = CTX({ vitals: { hr: 100, weight_kg: 11 } }, { is_child: true });
    expect(checklist({}, withFlow, null).find((i) => i.label.includes("weight")).done).toBe(true);
  });
});

describe("TriageNoteForm", () => {
  const setup = (ctx = CTX(), values = {}, onChange = jest.fn()) => {
    api.get.mockResolvedValue({ data: ctx });
    api.post.mockResolvedValue({ data: SUGGEST });
    render(<TriageNoteForm template={TEMPLATE} values={values} onChange={onChange} disabled={false} patientId={3} />);
    return onChange;
  };

  test("shows vitals with flags, allergies and medicines", async () => {
    setup();
    expect(await screen.findByTestId("triage-vitals")).toBeInTheDocument();
    expect(screen.getByText("Fast for an adult")).toBeInTheDocument();
    expect(screen.getByTestId("triage-allergies")).toHaveTextContent("Penicillin (hives)");
    expect(screen.getByText(/Aspirin 81 mg/)).toBeInTheDocument();
    expect(screen.getByTestId("dynamic")).toHaveTextContent("chief_complaint,first_airway");
  });

  test("warns when no vitals", async () => {
    setup(CTX({ vitals: {} }));
    expect(await screen.findByTestId("triage-no-vitals")).toBeInTheDocument();
  });

  test("shows the suggestion and sets the level", async () => {
    const onChange = setup(CTX(), { esi_b_high_risk: true });
    expect(await screen.findByTestId("triage-suggested-label")).toHaveTextContent("ESI 2");
    expect(api.post).toHaveBeenCalledWith("/t/3/suggest/", expect.objectContaining({ esi_b_high_risk: true }), expect.anything());
    fireEvent.click(screen.getByLabelText("ESI 3: Urgent"));
    expect(onChange).toHaveBeenCalledWith("esi_level", 3);
  });

  test("reason box only when level differs", async () => {
    setup(CTX(), { esi_level: 3, esi_b_high_risk: true });
    expect(await screen.findByTestId("triage-reason")).toBeInTheDocument();
  });

  test("suicide screen shows unverified banner, follow-up skip and immediate alert", async () => {
    setup(CTX(), { cssrs_4: "yes" });
    expect(await screen.findByTestId("triage-screener-unverified")).toBeInTheDocument();
    expect(screen.queryByText(/Thought about how/)).toBeNull();
    expect(screen.getByTestId("triage-suicide-immediate")).toHaveTextContent("Tell the charge nurse now.");
  });

  test("suicide screen is hidden when not due for this age", async () => {
    setup(CTX({}, { show_suicide_screen: false }));
    await screen.findByTestId("triage-vitals");
    expect(screen.queryByTestId("triage-suicide")).toBeNull();
  });

  test("child note: banner and weight auto-fill from flowsheet", async () => {
    const onChange = setup(CTX({ vitals: { hr: 120, weight_kg: 11.2 } }, { is_child: true }));
    expect(await screen.findByTestId("triage-child-note")).toBeInTheDocument();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("child_weight_kg", 11.2));
  });

  test("missing date of birth shows the problem", async () => {
    setup(CTX({ problem: "no_dob", problem_text: "No valid date of birth." }));
    expect(await screen.findByTestId("triage-problem")).toHaveTextContent("No valid date of birth.");
  });

  test("load failure shows an error", async () => {
    api.get.mockRejectedValue({ response: { data: { detail: "nope" } } });
    render(<TriageNoteForm template={TEMPLATE} values={{}} onChange={() => {}} patientId={3} />);
    expect(await screen.findByTestId("triage-error")).toBeInTheDocument();
  });
});
