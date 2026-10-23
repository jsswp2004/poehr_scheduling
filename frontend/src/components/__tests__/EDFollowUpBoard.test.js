import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { edBoardFollowUp: "/ed/follow-up/" } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });

import { api } from "../../api/client";
import EDFollowUpBoard, { WINDOWS, agoText } from "../edBoard/EDFollowUpBoard";

const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const flag = (state = "none", tests = []) => ({ state, count: state === "new" ? tests.length : 0, tests });
const visit = (n, name, over = {}) => ({
  registration: n, visit_number: `VN-${n}`, patient: n, user_id: n * 10, name, age: 42, age_text: "42 y", sex: "F", esi: 3, ed_status: "tip", complaint: "Chest pain",
  reason: "", md: { id: 8, name: "Lee, Jeffrey" }, rn: { id: 7, name: "Geronimo, Ann" }, comments: "", arrival_time: hoursAgo(30), discharged_at: hoursAgo(21), new_results: flag(), custom: {}, ...over,
});
const row = (v) => ({ type: "followup", bed: null, loc: "", bed_status: "", hold_reason: "", visit: v });

const col = (key, label, extra = {}) => ({ key, label, width: 120, visible: true, type: "builtin", ...extra });
const columns = [col("patient", "Patient"), col("age", "Age"), col("discharged", "Discharged"), col("new_results", "New results"), col("complaint", "Chief Complaint"), col("esi", "ESI"), col("md", "MD"), col("loc", "LOC", { visible: false })];
const standard = { key: "followup", label: "ED Follow-up", builtin: true, kind: "follow_up", filter: "all", columns, rules: [], criteria: { match: "all", conditions: [] }, follow_up: { days: 7 } };
const peds = { key: "v4", id: 4, label: "Peds follow-up", builtin: false, kind: "follow_up", filter: "all", columns, rules: [], criteria: { match: "all", conditions: [{ field: "age", op: "lt", value: 18, unit: "years" }] }, follow_up: { days: 3 } };

const rows = () => [
  row(visit(1, "GARCIA, Maria", { discharged_at: hoursAgo(20), new_results: flag("new", ["CBC", "Troponin"]) })),
  row(visit(2, "OKAFOR, Noah", { age: 0, age_text: "8 mo", new_results: flag("new", ["Urine culture"]) })),
  row(visit(3, "BAPTISTE, Joel", { new_results: flag("reviewed"), discharged_at: hoursAgo(50) })),
  row(visit(4, "MENDES, Carla", { discharged_at: hoursAgo(80) })),
];
const board = (over = {}) => ({
  departments: [{ id: 5, name: "ED", facility_name: "General" }, { id: 6, name: "Fast Track", facility_name: "General" }],
  unit: 5, days: 7, needs_review: 2, total: 4,
  statuses: [{ value: "tip", code: "TIP", label: "Treating" }],
  staff: { nurses: [], doctors: [] },
  views: [standard, peds], default_view: "followup", rows: rows(), ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: board() });
});

const names = () => screen.getAllByTestId(/^fu-cell-patient-/).map((c) => c.textContent);
const open = async (props = {}) => {
  render(<EDFollowUpBoard currentUserId={1} {...props} />);
  await screen.findByTestId("fu-row-1");
};

test("agoText reads minutes, hours and days", () => {
  const now = Date.now();
  expect(agoText(new Date(now - 35 * 60000).toISOString(), now)).toBe("35 min ago");
  expect(agoText(new Date(now - 21 * 3600000).toISOString(), now)).toBe("21 h ago");
  expect(agoText(new Date(now - 3 * 86400000).toISOString(), now)).toBe("3 d ago");
  expect(agoText("not a date")).toBe("");
});

test("lists discharged patients with when they left", async () => {
  await open();
  expect(names()).toEqual(["GARCIA, Maria", "OKAFOR, Noah", "BAPTISTE, Joel", "MENDES, Carla"]);
  expect(screen.getByTestId("discharged-1")).toHaveTextContent("20 h ago");
  expect(screen.getByTestId("discharged-3")).toHaveTextContent("2 d ago");
});

test("asks the server for the department's discharged visits and the window", async () => {
  await open();
  expect(api.get).toHaveBeenCalledWith("/ed/follow-up/", expect.objectContaining({ params: { days: 7 } }));
});

test("flags new results by name and shows reviewed ones quietly", async () => {
  await open();
  expect(screen.getByTestId("new-results-1")).toHaveTextContent("2 new");
  expect(screen.getByTestId("new-results-1")).toHaveTextContent("CBC, Troponin");
  expect(screen.getByTestId("new-results-2")).toHaveTextContent("1 new");
  expect(screen.getByTestId("new-results-3")).toHaveTextContent("Reviewed");
  expect(screen.queryByTestId("new-results-4")).toBeNull(); // nothing to show: a dash
  expect(within(screen.getByTestId("fu-cell-new_results-4")).getByText("—")).toBeInTheDocument();
});

test("hidden columns stay hidden and the standard layout has no bed column", async () => {
  await open();
  expect(screen.queryByText("LOC")).toBeNull();
  expect(screen.getByText("Discharged")).toBeInTheDocument();
  expect(screen.getByText("New results")).toBeInTheDocument();
});

test("the Needs review chip counts the flagged patients and narrows the list to them", async () => {
  await open();
  expect(screen.getByTestId("chip-review")).toHaveTextContent("Needs review 2");
  expect(screen.getByTestId("chip-all")).toHaveTextContent("All discharged 4");
  fireEvent.click(screen.getByTestId("chip-review"));
  expect(names()).toEqual(["GARCIA, Maria", "OKAFOR, Noah"]);
  fireEvent.click(screen.getByTestId("chip-all"));
  expect(names()).toHaveLength(4);
});

test("nothing to review says so, and All discharged is still there", async () => {
  api.get.mockResolvedValue({ data: board({ rows: [row(visit(3, "BAPTISTE, Joel", { new_results: flag("reviewed") }))], needs_review: 0, total: 1 }) });
  render(<EDFollowUpBoard />);
  await screen.findByTestId("fu-row-3");
  fireEvent.click(screen.getByTestId("chip-review"));
  expect(screen.getByTestId("fu-empty")).toHaveTextContent("Nothing needs review.");
});

test("search narrows by name", async () => {
  await open();
  fireEvent.change(screen.getByTestId("fu-search"), { target: { value: "okaf" } });
  expect(names()).toEqual(["OKAFOR, Noah"]);
  fireEvent.change(screen.getByTestId("fu-search"), { target: { value: "zzz" } });
  expect(screen.getByTestId("fu-empty")).toHaveTextContent("Nobody matches your search.");
});

test("an empty window offers a longer look-back", async () => {
  api.get.mockResolvedValue({ data: board({ rows: [], needs_review: 0, total: 0 }) });
  render(<EDFollowUpBoard />);
  const empty = await screen.findByTestId("fu-empty");
  expect(empty).toHaveTextContent("No ED discharges in the last 7 days.");
  fireEvent.click(within(empty).getByRole("button", { name: "Show 30 days" }));
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/ed/follow-up/", expect.objectContaining({ params: expect.objectContaining({ days: 30 }) })));
});

test("choosing a view applies its conditions and its look-back", async () => {
  await open();
  const select = within(screen.getByTestId("fu-view").closest(".MuiInputBase-root")).getByRole("combobox");
  fireEvent.mouseDown(select);
  fireEvent.click(screen.getByRole("option", { name: "Peds follow-up" }));
  await waitFor(() => expect(names()).toEqual(["OKAFOR, Noah"]));
  expect(screen.getByTestId("criteria-chip")).toHaveTextContent("Showing: age under 18 years");
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/ed/follow-up/", expect.objectContaining({ params: expect.objectContaining({ days: 3 }) })));
  // the needs-review count follows the view's conditions too
  expect(screen.getByTestId("chip-review")).toHaveTextContent("Needs review 1");
});

test("the look-back can be changed for this visit to the board", async () => {
  await open();
  const select = within(screen.getByTestId("fu-days").closest(".MuiInputBase-root")).getByRole("combobox");
  fireEvent.mouseDown(select);
  fireEvent.click(screen.getByRole("option", { name: "14 days" }));
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/ed/follow-up/", expect.objectContaining({ params: expect.objectContaining({ days: 14 }) })));
  expect(WINDOWS).toEqual([1, 3, 7, 14, 30]);
});

test("reports how many need review so the tab can show it", async () => {
  const onNeedsReview = jest.fn();
  await open({ onNeedsReview });
  await waitFor(() => expect(onNeedsReview).toHaveBeenCalledWith(2));
});

test("clicking a row selects the patient; Results opens the Results tab", async () => {
  const onSelectPatient = jest.fn();
  const onOpenPatient = jest.fn();
  await open({ onSelectPatient, onOpenPatient });
  fireEvent.click(screen.getByTestId("fu-cell-complaint-1"));
  expect(onSelectPatient).toHaveBeenCalledWith(expect.objectContaining({ user_id: 10, full_name: "GARCIA, Maria" }));
  fireEvent.click(screen.getByTestId("fu-results-1"));
  expect(onOpenPatient).toHaveBeenCalledWith(expect.objectContaining({ user_id: 10 }), "results");
  fireEvent.click(screen.getByText("GARCIA, Maria"));
  expect(onOpenPatient).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: 10 }), "orders");
});

test("a discharged visit is read-only: no editing controls", async () => {
  await open();
  expect(screen.queryByRole("combobox", { name: /ESI for/ })).toBeNull();
  expect(screen.getByTestId("fu-footer")).toHaveTextContent("read-only");
});

test("sorting by Discharged reverses the order", async () => {
  await open();
  fireEvent.click(screen.getByTestId("fu-sort-discharged"));
  expect(names()[0]).toBe("MENDES, Carla");
  fireEvent.click(screen.getByTestId("fu-sort-discharged"));
  expect(names()[0]).toBe("GARCIA, Maria");
});

test("a failed load says so", async () => {
  api.get.mockRejectedValue({ response: { data: { detail: "nope" } } });
  render(<EDFollowUpBoard />);
  expect(await screen.findByText(/nope|Could not load/)).toBeInTheDocument();
});

test("no emergency departments yet", async () => {
  api.get.mockResolvedValue({ data: board({ departments: [], rows: [], unit: null }) });
  render(<EDFollowUpBoard />);
  expect(await screen.findByTestId("no-ed-departments")).toBeInTheDocument();
});

test("the builder preview draws the sample without asking the server", () => {
  const previewData = board();
  render(<EDFollowUpBoard previewData={previewData} previewView={{ label: "Preview", columns, rules: [], criteria: peds.criteria, follow_up: { days: 7 } }} />);
  expect(api.get).not.toHaveBeenCalled();
  expect(screen.getByText("OKAFOR, Noah")).toBeInTheDocument();
  expect(screen.queryByText("GARCIA, Maria")).toBeNull();
  expect(screen.queryByTestId("fu-search")).toBeNull();
});
