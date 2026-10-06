import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      edBoard: "/ed/board/",
      edBoardPreference: "/ed/pref/",
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
import { toast } from "../SimpleToast";
import StatusBoardBuilder from "../edBoard/StatusBoardBuilder";
import { customKey } from "../edBoard/BuilderTabs";

const col = (key, label, extra = {}) => ({ key, label, width: 100, visible: true, type: "builtin", ...extra });
const columns = () => [col("loc", "LOC"), col("patient", "Patient"), col("age", "Age"), col("esi", "ESI"), col("status", "STS"), col("rn", "RN"), col("actions", "")];
const view = (over = {}) => ({
  key: "v1", id: 1, name: "Charge nurse", label: "Charge nurse", builtin: false, is_default: false, can_undo: false, filter: "all",
  columns: columns(), rules: [], author: { id: 1, name: "Admin, Ann" }, ...over,
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
  default_view_config: { columns: columns(), rules: [], filter: "all" },
  people: { nurses: [{ id: 7, name: "Geronimo, Ann" }, { id: 9, name: "Bell, Sam" }], doctors: [{ id: 8, name: "Lee, Jeffrey" }] },
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
  render(<StatusBoardBuilder />);
  await screen.findByTestId("view-item-1");
};

test("customKey makes safe, unique keys", () => {
  expect(customKey("Isolation type", [])).toBe("c_isolation_type");
  expect(customKey("Isolation type", ["c_isolation_type"])).toBe("c_isolation_type_2");
  expect(customKey("  !!  ", [])).toBe("c_column");
});

test("lists the clinic's views and marks the default", async () => {
  await open();
  expect(screen.getByTestId("view-item-1")).toHaveTextContent("Charge nurse");
  expect(screen.getByTestId("view-item-2")).toHaveTextContent("Triage");
  expect(screen.getByTestId("view-item-2")).toHaveTextContent("Default");
  expect(screen.getByTestId("view-item-1")).not.toHaveTextContent("Default");
});

test("saving a view sends its name and layout together", async () => {
  await open();
  const save = screen.getByRole("button", { name: "Save view" });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByTestId("view-name"), { target: { value: "Charge RN" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Show Age" }));
  expect(save).toBeEnabled();
  api.patch.mockResolvedValue({ data: view({ name: "Charge RN", label: "Charge RN", can_undo: true }) });
  fireEvent.click(save);
  await waitFor(() => expect(api.patch).toHaveBeenCalled());
  const [url, body] = api.patch.mock.calls[0];
  expect(url).toBe("/sv/1/");
  expect(body.name).toBe("Charge RN");
  expect(body.config.columns.find((c) => c.key === "age").visible).toBe(false);
  expect(body.config.filter).toBe("all");
  await waitFor(() => expect(screen.getByRole("button", { name: "Undo last save" })).toBeEnabled());
  expect(screen.getByTestId("view-item-1")).toHaveTextContent("Charge RN");
});

test("the Patients shown tab changes which patients the view lists", async () => {
  await open();
  fireEvent.click(screen.getByRole("tab", { name: "Patients shown" }));
  fireEvent.mouseDown(within(screen.getByTestId("view-filter").closest(".MuiInputBase-root")).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "Only patients waiting for a bed" }));
  api.patch.mockResolvedValue({ data: view({ filter: "waiting" }) });
  fireEvent.click(screen.getByRole("button", { name: "Save view" }));
  await waitFor(() => expect(api.patch.mock.calls[0][1].config.filter).toBe("waiting"));
});

test("a color rule is added in the Colors tab and saved with the view", async () => {
  await open();
  fireEvent.click(screen.getByRole("tab", { name: "Colors" }));
  fireEvent.click(screen.getByRole("button", { name: "Add a color rule" }));
  api.patch.mockResolvedValue({ data: view() });
  fireEvent.click(screen.getByRole("button", { name: "Save view" }));
  await waitFor(() => expect(api.patch.mock.calls[0][1].config.rules).toEqual([{ field: "esi", op: "eq", value: "1", target: "row", color: "#ffcdd2" }]));
});

test("you cannot walk away from unsaved changes by picking another view", async () => {
  await open();
  fireEvent.click(screen.getByRole("checkbox", { name: "Show Age" }));
  fireEvent.click(screen.getByTestId("view-item-2"));
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Save or discard/));
  expect(screen.getByTestId("view-name")).toHaveValue("Charge nurse");
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  fireEvent.click(screen.getByTestId("view-item-2"));
  await waitFor(() => expect(screen.getByTestId("view-name")).toHaveValue("Triage"));
});

test("undo puts back the layout from before the last save", async () => {
  await open();
  expect(screen.getByRole("button", { name: "Undo last save" })).toBeDisabled();
  fireEvent.click(screen.getByTestId("view-item-2"));
  const undo = await screen.findByRole("button", { name: "Undo last save" });
  await waitFor(() => expect(undo).toBeEnabled());
  api.post.mockResolvedValue({ data: view({ key: "v2", id: 2, name: "Triage", is_default: true, can_undo: true }) });
  fireEvent.click(undo);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/sv/2/undo/", {}, expect.anything()));
});

test("a new view is named by the admin and starts from the standard layout", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "New view" }));
  const create = screen.getByRole("button", { name: "Create view" });
  expect(create).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Name the view"), { target: { value: "Night shift" } });
  api.post.mockResolvedValue({ data: view({ key: "v3", id: 3, name: "Night shift", label: "Night shift" }) });
  fireEvent.click(create);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/sv/", { name: "Night shift" }, expect.anything()));
  await waitFor(() => expect(screen.getByTestId("view-item-3")).toHaveTextContent("Night shift"));
  expect(screen.getByTestId("view-name")).toHaveValue("Night shift");
});

test("duplicating copies the selected view under a new name", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
  expect(screen.getByLabelText("Name the view")).toHaveValue("Charge nurse copy");
  api.post.mockResolvedValue({ data: view({ key: "v3", id: 3, name: "Charge nurse copy" }) });
  fireEvent.click(screen.getByRole("button", { name: "Create view" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/sv/", { name: "Charge nurse copy", from_view: "1" }, expect.anything()));
});

test("make default and remove default", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Make default" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/sv/1/", { is_default: true }, expect.anything()));
  await waitFor(() => expect(screen.getByTestId("view-item-1")).toHaveTextContent("Default"));
  expect(screen.getByTestId("view-item-2")).not.toHaveTextContent("Default");
  fireEvent.click(screen.getByRole("button", { name: "Remove as default" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/sv/1/", { is_default: false }, expect.anything()));
});

test("deleting a view asks first", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(api.delete).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Delete view" }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/sv/1/", expect.anything()));
});

test("shared settings: vitals limit and a new custom column are saved for every view", async () => {
  await open();
  fireEvent.click(screen.getByRole("tab", { name: "Shared settings" }));
  expect(screen.getByText(/shared by every view/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Vitals are overdue after (minutes)"), { target: { value: "45" } });
  fireEvent.click(screen.getByRole("button", { name: "Add a custom column" }));
  fireEvent.change(screen.getByLabelText("Column name"), { target: { value: "Isolation type" } });
  fireEvent.mouseDown(screen.getByLabelText("What goes in it"));
  fireEvent.click(screen.getByRole("option", { name: "Dropdown" }));
  fireEvent.change(screen.getByLabelText(/Choices/), { target: { value: "Contact, Airborne" } });
  fireEvent.click(screen.getByRole("button", { name: "Add column" }));
  api.patch.mockResolvedValue({ data: { ...settings(), vitals_overdue_minutes: 45, custom_columns: [{ key: "c_isolation_type", label: "Isolation type", kind: "dropdown", options: ["Contact", "Airborne"] }] } });
  fireEvent.click(await screen.findByRole("button", { name: "Save shared settings" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalled());
  const [url, body] = api.patch.mock.calls[0];
  expect(url).toBe("/sv/settings/");
  expect(body.vitals_overdue_minutes).toBe(45);
  expect(body.custom_columns).toEqual([{ key: "c_isolation_type", label: "Isolation type", kind: "dropdown", options: ["Contact", "Airborne"] }]);
  expect(body.statuses).toHaveLength(2);
});

test("a department can have its own staff lists", async () => {
  await open();
  fireEvent.click(screen.getByRole("tab", { name: "Shared settings" }));
  fireEvent.mouseDown(within(screen.getByTestId("roster-dept").closest(".MuiInputBase-root")).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: /ED Main/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "This department has its own staff lists" }));
  fireEvent.click(screen.getByRole("button", { name: "Save shared settings" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalled());
  expect(api.patch.mock.calls[0][1].roster.units).toEqual({ 5: { nurses: [7, 9], doctors: [8] } });
});

test("the preview shows the view being edited, including hidden columns turned off", async () => {
  await open();
  const preview = screen.getByTestId("builder-preview");
  await waitFor(() => expect(within(preview).getByText("Age")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("checkbox", { name: "Show Age" }));
  await waitFor(() => expect(within(preview).queryByText("Age")).toBeNull());
});

test("with no saved views the page says how to start", async () => {
  api.get.mockResolvedValue({ data: payload({ views: [] }) });
  render(<StatusBoardBuilder />);
  expect(await screen.findByText(/Create a view to choose/)).toBeInTheDocument();
});
