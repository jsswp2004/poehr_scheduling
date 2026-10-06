import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      edBoard: "/ed/board/",
      admissionBoard: (id) => `/adm/${id}/board/`,
      admissionTransfer: (id) => `/adm/${id}/transfer/`,
      statusBoards: "/sb/",
      statusBoard: (id) => `/sb/${id}/`,
      statusBoardPublish: (id) => `/sb/${id}/publish/`,
      statusBoardRestore: (id) => `/sb/${id}/restore/`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import StatusBoardBuilder from "../edBoard/StatusBoardBuilder";
import { customKey } from "../edBoard/BuilderTabs";
import { diffConfigs } from "../edBoard/statusBoardDiff";

const col = (key, label, extra = {}) => ({ key, label, width: 100, visible: true, type: "builtin", ...extra });
const baseConfig = () => ({
  columns: [col("loc", "LOC"), col("patient", "Patient"), col("age", "Age"), col("esi", "ESI"), col("status", "STS"), col("rn", "RN"), col("actions", "")],
  statuses: [
    { value: "wtbs", code: "WTBS", label: "Waiting to be seen" },
    { value: "tip", code: "TIP", label: "Treatment in progress" },
  ],
  rules: [],
  vitals_overdue_minutes: 60,
  roster: { nurses: null, doctors: null },
});
const version = (over = {}) => ({ id: 11, number: 1, status: "published", unit: null, note: "", author: { id: 1, name: "Admin, Ann" }, created_at: "2026-10-01T10:00:00Z", published_at: "2026-10-01T10:00:00Z", published_by: null, config: baseConfig(), ...over });
const scope = (over = {}) => ({
  unit: null,
  departments: [{ id: 5, name: "ED Main", facility_name: "General Hospital" }],
  default_config: baseConfig(),
  draft: null,
  published: null,
  versions: [],
  people: { nurses: [{ id: 7, name: "Geronimo, Ann" }, { id: 9, name: "Bell, Sam" }], doctors: [{ id: 8, name: "Lee, Jeffrey" }] },
  ...over,
});

let state;
beforeEach(() => {
  jest.clearAllMocks();
  state = { scope: scope(), versions: {} };
  api.get.mockImplementation(async (url) => {
    if (url === "/sb/") return { data: state.scope };
    const id = Number(url.split("/")[2]);
    return { data: state.versions[id] };
  });
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockImplementation(async (url, body) => ({ data: { ...state.scope.draft, config: body.config } }));
  api.delete.mockResolvedValue({ data: {} });
});

const withDraft = () => {
  const d = version({ id: 21, number: 2, status: "draft", published_at: null });
  state.scope = scope({ draft: d, published: version(), versions: [d, version()] });
  return d;
};

test("helpers: custom column keys are safe and unique", () => {
  expect(customKey("Isolation type", [])).toBe("c_isolation_type");
  expect(customKey("Isolation type", ["c_isolation_type"])).toBe("c_isolation_type_2");
  expect(customKey("  !!  ", [])).toBe("c_column");
  expect(customKey("x".repeat(60), []).length).toBeLessThanOrEqual(30);
});

test("diffConfigs describes what changed in plain words", () => {
  const before = baseConfig();
  const after = baseConfig();
  after.columns = [after.columns[1], after.columns[0], ...after.columns.slice(2)]; // loc and patient swapped
  after.columns[2] = { ...after.columns[2], label: "Years", width: 70 };
  after.columns[3] = { ...after.columns[3], visible: false };
  after.columns.push(col("c_iso", "Isolation", { type: "custom", kind: "dropdown", options: ["A"] }));
  after.statuses.push({ value: "x", code: "TRI", label: "Triage" });
  after.rules = [{ field: "esi", op: "eq", value: "1", target: "row", color: "#ff0000" }];
  after.vitals_overdue_minutes = 30;
  after.roster = { nurses: [7], doctors: null };
  const lines = diffConfigs(before, after);
  expect(lines).toEqual(
    expect.arrayContaining([
      'Added column "Isolation"',
      'Renamed column "Age" to "Years"',
      'Resized "Years" from 100 to 70',
      'Hid column "ESI"',
      "Reordered the columns",
      "Added status TRI",
      "Color rules went from 0 to 1",
      "Vitals are overdue after 30 minutes (was 60)",
      "The nurse list is now 1 chosen person",
    ])
  );
  expect(diffConfigs(before, baseConfig())).toEqual([]);
});

test("without a draft the layout is read-only until you start one", async () => {
  render(<StatusBoardBuilder />);
  expect(await screen.findByText("Using the built-in layout")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Show Age" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add a column" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Start a draft to edit" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/sb/", { unit: null }, expect.anything()));
});

test("editing a draft renames, hides, adds a column and saves the whole layout", async () => {
  withDraft();
  render(<StatusBoardBuilder />);
  await screen.findByText(/Draft: version 2/);
  fireEvent.change(screen.getByLabelText("Name of age"), { target: { value: "Years" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Show ESI" }));
  expect(screen.getByText(/unsaved changes/)).toBeInTheDocument();
  // preview follows the edits
  const preview = within(screen.getByTestId("builder-preview"));
  expect(preview.getByRole("columnheader", { name: "Years" })).toBeInTheDocument();
  expect(preview.queryByRole("columnheader", { name: "ESI" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Add a column" }));
  fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "Isolation" } });
  fireEvent.mouseDown(within(screen.getByLabelText("What goes in it").closest(".MuiInputBase-root")).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "Dropdown" }));
  fireEvent.change(screen.getByLabelText(/Choices/), { target: { value: "Contact, Airborne" } });
  fireEvent.click(screen.getByRole("button", { name: "Add column" }));
  await waitFor(() => expect(preview.getByRole("columnheader", { name: "Isolation" })).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalled());
  const [url, body] = api.patch.mock.calls[0];
  expect(url).toBe("/sb/21/");
  const byKey = Object.fromEntries(body.config.columns.map((c) => [c.key, c]));
  expect(byKey.age.label).toBe("Years");
  expect(byKey.esi.visible).toBe(false);
  expect(byKey.c_isolation).toMatchObject({ kind: "dropdown", options: ["Contact", "Airborne"], type: "custom" });
  await waitFor(() => expect(screen.queryByText(/unsaved changes/)).toBeNull());
});

test("columns can be moved and required ones cannot be hidden", async () => {
  withDraft();
  render(<StatusBoardBuilder />);
  await screen.findByText(/Draft: version 2/);
  expect(screen.getByRole("checkbox", { name: "Show Patient" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move LOC up" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Move LOC down" }));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalled());
  expect(api.patch.mock.calls[0][1].config.columns.slice(0, 2).map((c) => c.key)).toEqual(["patient", "loc"]);
});

test("statuses and color rules are edited on their own tab", async () => {
  withDraft();
  render(<StatusBoardBuilder />);
  await screen.findByText(/Draft: version 2/);
  fireEvent.click(screen.getByRole("tab", { name: "Statuses & colors" }));
  fireEvent.click(screen.getByRole("button", { name: "Add a status" }));
  fireEvent.change(screen.getByLabelText("Vitals are overdue after (minutes)"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Add a color rule" }));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalled());
  const config = api.patch.mock.calls[0][1].config;
  expect(config.statuses).toHaveLength(3);
  expect(config.vitals_overdue_minutes).toBe(30);
  expect(config.rules).toEqual([{ field: "esi", op: "eq", value: "1", target: "row", color: "#ffcdd2" }]);
});

test("the staff tab limits the dropdowns to chosen people", async () => {
  withDraft();
  render(<StatusBoardBuilder />);
  await screen.findByText(/Draft: version 2/);
  fireEvent.click(screen.getByRole("tab", { name: "Staff" }));
  fireEvent.click(screen.getAllByRole("radio", { name: /Only the nurses I choose/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalled());
  expect(api.patch.mock.calls[0][1].config.roster).toEqual({ nurses: [7, 9], doctors: null });
});

test("publishing saves unsaved edits, then publishes with the note", async () => {
  withDraft();
  render(<StatusBoardBuilder />);
  await screen.findByText(/Draft: version 2/);
  fireEvent.click(screen.getByRole("checkbox", { name: "Show ESI" }));
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  fireEvent.change(screen.getByLabelText(/What changed/), { target: { value: "Hid ESI for fast track" } });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Publish" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/sb/21/publish/", { note: "Hid ESI for fast track" }, expect.anything()));
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(toast.success).toHaveBeenCalled();
});

test("you cannot switch boards while there are unsaved changes", async () => {
  withDraft();
  render(<StatusBoardBuilder />);
  await screen.findByText(/Draft: version 2/);
  fireEvent.click(screen.getByRole("checkbox", { name: "Show ESI" }));
  fireEvent.mouseDown(within(screen.getByTestId("builder-scope").closest(".MuiInputBase-root")).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: /ED Main/ }));
  expect(toast.error).toHaveBeenCalledWith("Save or discard your changes before switching boards.");
  expect(api.get).toHaveBeenCalledTimes(1);
});

test("a department board loads its own versions", async () => {
  render(<StatusBoardBuilder />);
  await screen.findByText("Using the built-in layout");
  fireEvent.mouseDown(within(screen.getByTestId("builder-scope").closest(".MuiInputBase-root")).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: /ED Main/ }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/sb/", expect.objectContaining({ params: { unit: "5" } })));
});

test("versions: compare two and restore an old one", async () => {
  const v1 = version({ id: 11, number: 1, status: "archived", note: "Original" });
  const cfg2 = baseConfig();
  cfg2.vitals_overdue_minutes = 30;
  const v2 = version({ id: 12, number: 2, status: "published", config: cfg2, note: "Stricter vitals" });
  state.scope = scope({ published: v2, versions: [v2, v1] });
  state.versions = { 11: v1, 12: v2 };
  render(<StatusBoardBuilder />);
  await screen.findByText("Live: version 2");
  fireEvent.click(screen.getByRole("tab", { name: "Versions" }));
  expect(screen.getByRole("button", { name: /Compare the two/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "Compare version 1" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Compare version 2" }));
  fireEvent.click(screen.getByRole("button", { name: /Compare the two/ }));
  const diff = await screen.findByTestId("diff");
  expect(diff).toHaveTextContent("What changed from v1 to v2");
  expect(diff).toHaveTextContent("Vitals are overdue after 30 minutes (was 60)");

  fireEvent.click(screen.getByRole("button", { name: "Restore version 1" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/sb/11/restore/", {}, expect.anything()));
});

test("restore is off while a draft is open", async () => {
  withDraft();
  render(<StatusBoardBuilder />);
  await screen.findByText(/Draft: version 2/);
  fireEvent.click(screen.getByRole("tab", { name: "Versions" }));
  expect(screen.getByRole("button", { name: "Restore version 1" })).toBeDisabled();
});

test("discarding a draft deletes it", async () => {
  withDraft();
  render(<StatusBoardBuilder />);
  await screen.findByText(/Draft: version 2/);
  fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/sb/21/", expect.anything()));
});
