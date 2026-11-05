import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const menuItem = (name) => {
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  return screen.getByRole("menuitem", { name });
};

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      edBoard: "/ed/board/",
      edBoardPreference: "/ed/pref/",
      edBoardFollowUp: "/ed/follow-up/",
      admissionBoard: (id) => `/adm/${id}/board/`,
      admissionTransfer: (id) => `/adm/${id}/transfer/`,
      statusViews: "/sv/",
      statusViewSettings: "/sv/settings/",
      statusView: (id) => `/sv/${id}/`,
      statusViewUndo: (id) => `/sv/${id}/undo/`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import StatusBoardBuilder from "../edBoard/StatusBoardBuilder";

const col = (key, label, extra = {}) => ({ key, label, width: 100, visible: true, type: "builtin", ...extra });
const columns = () => [col("loc", "LOC"), col("patient", "Patient"), col("age", "Age"), col("esi", "ESI"), col("status", "STS"), col("rn", "RN"), col("actions", "")];
const view = (over = {}) => ({
  key: "v1", id: 1, name: "Charge nurse", label: "Charge nurse", builtin: false, is_default: false, can_undo: false, filter: "all",
  columns: columns(), rules: [], beds: [], author: { id: 1, name: "Admin, Ann" }, ...over,
});
const settings = () => ({
  statuses: [{ value: "wtbs", code: "WTBS", label: "Waiting to be seen" }, { value: "tip", code: "TIP", label: "Treatment in progress" }],
  vitals_overdue_minutes: 60,
  custom_columns: [],
  roster: { default: { nurses: null, doctors: null }, units: {} },
});
const payload = (over = {}) => ({
  views: [view(), view({ key: "v2", id: 2, name: "Triage", label: "Triage", is_default: true, can_undo: true })],
  settings: settings(),
  departments: [{ id: 5, name: "ED Main", facility_name: "General Hospital" }],
  locations: [{ id: 1, name: "General Hospital", units: [{ id: 5, name: "ED Main", beds: [{ id: 11, name: "ED1A" }, { id: 12, name: "ED1B" }] }] }],
  default_view_config: { columns: columns(), rules: [], filter: "all" },
  people: { nurses: [{ id: 7, name: "Geronimo, Ann" }], doctors: [{ id: 8, name: "Lee, Jeffrey" }] },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: payload() });
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
});

const open = async () => {
  render(<MemoryRouter><StatusBoardBuilder /></MemoryRouter>);
  await screen.findByTestId("view-item-1");
};



const pickOption = (testId, name) => {
  fireEvent.mouseDown(within(screen.getByTestId(testId).closest(".MuiInputBase-root")).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name }));
};
const FU_COLUMNS = () => [
  col("patient", "Patient"), col("age", "Age"), col("discharged", "Discharged"), col("new_results", "New results"), col("complaint", "Chief Complaint"),
  col("loc", "LOC", { visible: false }), col("actions", "", { visible: false }),
];
const followUpView = (over = {}) => view({ key: "v3", id: 3, name: "ED Follow-up", label: "ED Follow-up", kind: "follow_up", columns: FU_COLUMNS(), criteria: { match: "all", conditions: [] }, follow_up: { days: 7 }, ...over });
const withFollowUp = () => payload({ views: [view(), view({ key: "v2", id: 2, name: "Triage", label: "Triage", is_default: true }), followUpView()] });
const goTab = (name) => fireEvent.click(screen.getByRole("tab", { name }));

describe("conditions on the patient", () => {
  test("a quick start adds a condition and it is saved with the view", async () => {
    await open();
    goTab("Patients shown");
    expect(screen.getByTestId("no-conditions")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("preset-children"));
    expect(screen.getByTestId("condition-0")).toBeInTheDocument();
    expect(screen.getByTestId("cond-value-0")).toHaveValue(18);
    api.patch.mockResolvedValue({ data: view({ criteria: { match: "all", conditions: [{ field: "age", op: "lt", value: 18, unit: "years" }] } }) });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(api.patch.mock.calls[0][1].config.criteria).toEqual({ match: "all", conditions: [{ field: "age", op: "lt", value: 18, unit: "years" }] });
  });

  test("the age condition can be changed to months, and all/any is chosen", async () => {
    await open();
    goTab("Patients shown");
    fireEvent.click(screen.getByTestId("add-condition"));
    pickOption("cond-unit-0", "months");
    fireEvent.change(screen.getByTestId("cond-value-0"), { target: { value: "6" } });
    pickOption("cond-op-0", "up to");
    pickOption("match-mode", "any");
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(api.patch.mock.calls[0][1].config.criteria).toEqual({ match: "any", conditions: [{ field: "age", op: "lte", value: 6, unit: "months" }] });
  });

  test("a condition with nothing chosen yet holds back the save and says why", async () => {
    await open();
    goTab("Patients shown");
    fireEvent.click(screen.getByTestId("add-condition"));
    expect(screen.queryByTestId("conditions-incomplete")).toBeNull();
    pickOption("cond-field-0", "MD");
    expect(screen.getByTestId("conditions-incomplete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save view" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove condition 1" }));
    expect(screen.queryByTestId("conditions-incomplete")).toBeNull();
    expect(screen.getByRole("button", { name: "Save view" })).toBeEnabled();
  });

  test("a complaint condition needs some text", async () => {
    await open();
    goTab("Patients shown");
    fireEvent.click(screen.getByTestId("add-condition"));
    pickOption("cond-field-0", "Chief complaint");
    expect(screen.getByRole("button", { name: "Save view" })).toBeDisabled();
    fireEvent.change(screen.getByTestId("cond-value-0"), { target: { value: "fever" } });
    expect(screen.getByRole("button", { name: "Save view" })).toBeEnabled();
  });

  test("choosing a status starts on the clinic's first status", async () => {
    await open();
    goTab("Patients shown");
    fireEvent.click(screen.getByTestId("add-condition"));
    pickOption("cond-field-0", "Status");
    expect(screen.getByRole("button", { name: "Save view" })).toBeEnabled();
    expect(within(screen.getByTestId("condition-0")).getByText(/WTBS/)).toBeInTheDocument();
  });

  test("the preview follows the conditions", async () => {
    await open();
    const preview = screen.getByTestId("builder-preview");
    await waitFor(() => expect(within(preview).getByText("SAMPLE, Jane")).toBeInTheDocument());
    goTab("Patients shown");
    fireEvent.click(screen.getByTestId("preset-children"));
    await waitFor(() => expect(within(preview).queryByText("SAMPLE, Jane")).toBeNull());
    expect(within(preview).getByText("SAMPLE, Alex")).toBeInTheDocument();
    expect(within(preview).getByTestId("criteria-chip")).toHaveTextContent("age under 18 years");
  });

  test("empty beds are only offered once beds and conditions are both chosen", async () => {
    await open();
    goTab("Patients shown");
    fireEvent.click(screen.getByTestId("preset-children"));
    expect(screen.queryByTestId("show-empty-beds")).toBeNull();
    pickOption("bed-location", "General Hospital");
    pickOption("bed-unit", "ED Main");
    fireEvent.click(screen.getByRole("checkbox", { name: "ED1A" }));
    expect(screen.getByTestId("show-empty-beds")).toBeInTheDocument();
  });
});

describe("follow-up views", () => {
  const openFollowUp = async () => {
    api.get.mockResolvedValue({ data: withFollowUp() });
    await open();
    fireEvent.click(screen.getByTestId("view-item-3"));
  };

  test("a follow-up view is marked in the list", async () => {
    api.get.mockResolvedValue({ data: withFollowUp() });
    await open();
    expect(screen.getByTestId("follow-up-chip-3")).toHaveTextContent("Follow-up");
    expect(screen.queryByTestId("follow-up-chip-1")).toBeNull();
  });

  test("a live view has no Follow-up tab", async () => {
    await open();
    expect(screen.queryByRole("tab", { name: "Follow-up" })).toBeNull();
  });

  test("its Follow-up tab sets how far back to look, saved with the view", async () => {
    await openFollowUp();
    goTab("Follow-up");
    pickOption("follow-up-days", "14 days");
    api.patch.mockResolvedValue({ data: followUpView({ follow_up: { days: 14 } }) });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const config = api.patch.mock.calls[0][1].config;
    expect(config.follow_up).toEqual({ days: 14 });
    expect(config.kind).toBe("follow_up");
  });

  test("Patients shown has no bed choices, just the conditions", async () => {
    await openFollowUp();
    goTab("Patients shown");
    expect(screen.getByTestId("follow-up-patients")).toBeInTheDocument();
    expect(screen.queryByTestId("view-filter")).toBeNull();
    expect(screen.queryByTestId("bed-location")).toBeNull();
    expect(screen.getByTestId("conditions-editor")).toBeInTheDocument();
  });

  test("the Columns tab offers Discharged and New results and only pins the patient", async () => {
    await openFollowUp();
    expect(screen.getByTestId("col-row-discharged")).toHaveTextContent("Follow-up");
    expect(screen.getByRole("checkbox", { name: "Show Patient" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Show LOC" })).toBeEnabled();
  });

  test("the preview shows sample discharged patients with the flag", async () => {
    await openFollowUp();
    const preview = screen.getByTestId("builder-preview");
    await waitFor(() => expect(within(preview).getByText("SAMPLE, Jane")).toBeInTheDocument());
    expect(within(preview).getByText("2 new")).toBeInTheDocument();
    expect(within(preview).getByText("Discharged")).toBeInTheDocument();
  });

  test("a new follow-up view is made by choosing the kind of board", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "New view" }));
    fireEvent.click(screen.getByRole("radio", { name: /Follow-up board/ }));
    fireEvent.change(screen.getByLabelText("Name the view"), { target: { value: "Peds follow-up" } });
    api.post.mockResolvedValue({ data: followUpView({ key: "v9", id: 9, name: "Peds follow-up", label: "Peds follow-up" }) });
    fireEvent.click(screen.getByRole("button", { name: "Create view" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/sv/", { name: "Peds follow-up", kind: "follow_up" }, expect.anything()));
    await waitFor(() => expect(screen.getByTestId("view-item-9")).toHaveTextContent("Peds follow-up"));
    // the dialog is still fading out, so the page behind it is briefly hidden from the accessibility tree
    expect(await screen.findByRole("tab", { name: "Follow-up", hidden: true })).toBeInTheDocument();
  });

  test("a live view is still made without a kind", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "New view" }));
    expect(screen.getByRole("radio", { name: /Live ED board/ })).toBeChecked();
    fireEvent.change(screen.getByLabelText("Name the view"), { target: { value: "Night" } });
    fireEvent.click(screen.getByRole("button", { name: "Create view" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/sv/", { name: "Night" }, expect.anything()));
  });

  test("copying a follow-up view keeps it a follow-up view", async () => {
    await openFollowUp();
    fireEvent.click(menuItem("Duplicate"));
    expect(screen.queryByRole("radio", { name: /Follow-up board/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create view" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/sv/", { name: "ED Follow-up copy", from_view: "3" }, expect.anything()));
  });
});
