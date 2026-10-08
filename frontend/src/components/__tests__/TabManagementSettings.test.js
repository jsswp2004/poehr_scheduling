import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), put: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({ apiEndpoints: { chartTabs: "/tabs/", chartTabsMine: "/tabs/mine/", chartTabsDefaults: "/tabs/defaults/" } }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import TabManagementSettings from "../chartTabs/TabManagementSettings";

const item = (key, label, visible = true, locked = false) => ({ key, label, visible, locked });
const mineFor = (over = {}) => ({
  care_setting: "ambulatory",
  tabs: ["patient_list", "orders", "results"],
  default_tab: "patient_list",
  my_default_tab: "",
  org_default_tab: "orders",
  customized: false,
  org_customized: true,
  items: [item("patient_list", "Patient List", true, true), item("orders", "Orders"), item("results", "Results", false)],
  ...over,
});
const orgFor = (over = {}) => ({
  items: [item("patient_list", "Patient List", true, true), item("orders", "Orders"), item("results", "Results"), item("documents", "Documents", false)],
  default_tab: "orders",
  customized: true,
  ...over,
});
const everyModule = (make) => ({ ambulatory: make(), emergency: make(), acute: make() });
const tabsReply = (canEdit = true, over = {}) => ({ data: { can_edit_defaults: canEdit, settings: everyModule(() => mineFor(over)) } });
const defaultsReply = () => ({ data: { settings: everyModule(orgFor) } });

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.values(toast).forEach((fn) => fn.mockReset());
  api.get.mockImplementation((url) => Promise.resolve(url === "/tabs/defaults/" ? defaultsReply() : tabsReply()));
  api.put.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
});

const rows = (prefix) => screen.getAllByTestId(new RegExp(`^${prefix}-row-`)).map((el) => el.getAttribute("data-testid").replace(`${prefix}-row-`, ""));

test("shows my tabs for the module, with the clinic default beneath for an administrator", async () => {
  render(<TabManagementSettings />);
  await screen.findByTestId("my-tabs");
  expect(rows("my-tabs")).toEqual(["patient_list", "orders", "results"]);
  expect(screen.getByTestId("my-tabs-preview")).toHaveTextContent("Patient List · Orders");
  expect(screen.getByTestId("my-tabs-preview")).not.toHaveTextContent("Results");
  expect(rows("clinic-tabs")).toEqual(["patient_list", "orders", "results", "documents"]);
  expect(screen.getByRole("button", { name: "Save my tabs" })).toBeDisabled();
});

test("a person who is not an administrator sees only their own tabs", async () => {
  api.get.mockImplementation(() => Promise.resolve(tabsReply(false)));
  render(<TabManagementSettings />);
  await screen.findByTestId("my-tabs");
  expect(screen.queryByTestId("clinic-tabs")).toBeNull();
  expect(api.get).toHaveBeenCalledTimes(1); // never even asks for the clinic defaults
});

test("the Patient List cannot be switched off", async () => {
  render(<TabManagementSettings />);
  await screen.findByTestId("my-tabs");
  expect(screen.getAllByLabelText("Show Patient List")[0]).toBeDisabled();
});

test("saving my tabs sends the order, visibility and opening tab for the chosen module", async () => {
  render(<TabManagementSettings />);
  await screen.findByTestId("my-tabs");
  fireEvent.click(screen.getByTestId("tabs-module-emergency"));
  await screen.findByTestId("my-tabs");
  fireEvent.click(screen.getAllByLabelText("Show Results")[0]); // on
  fireEvent.click(screen.getAllByLabelText("Move Results up")[0]); // above Orders
  fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
  fireEvent.click(await screen.findByRole("option", { name: "Results" }));
  fireEvent.click(screen.getByRole("button", { name: "Save my tabs" }));
  await waitFor(() => expect(api.put).toHaveBeenCalled());
  expect(api.put.mock.calls[0][0]).toBe("/tabs/mine/");
  expect(api.put.mock.calls[0][1]).toEqual({
    care_setting: "emergency",
    items: [
      { key: "patient_list", visible: true },
      { key: "results", visible: true },
      { key: "orders", visible: true },
    ],
    default_tab: "results",
  });
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Tabs saved."));
});

test("hiding the tab that opens first falls back to the default choice", async () => {
  api.get.mockImplementation((url) =>
    Promise.resolve(url === "/tabs/defaults/" ? defaultsReply() : tabsReply(true, { my_default_tab: "orders" }))
  );
  render(<TabManagementSettings />);
  await screen.findByTestId("my-tabs");
  expect(screen.getByTestId("my-tabs-opens-first")).toHaveValue("orders");
  fireEvent.click(screen.getAllByLabelText("Show Orders")[0]); // off
  expect(screen.getByTestId("my-tabs-opens-first")).toHaveValue("");
});

test("reset to clinic default is only offered after I have my own arrangement", async () => {
  render(<TabManagementSettings />);
  await screen.findByTestId("my-tabs");
  expect(screen.getByRole("button", { name: "Reset to clinic default" })).toBeDisabled();
});

test("reset deletes my arrangement for the module", async () => {
  api.get.mockImplementation((url) => Promise.resolve(url === "/tabs/defaults/" ? defaultsReply() : tabsReply(true, { customized: true })));
  render(<TabManagementSettings />);
  await screen.findByTestId("my-tabs");
  fireEvent.click(screen.getByRole("button", { name: "Reset to clinic default" }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/tabs/mine/?care_setting=ambulatory", expect.anything()));
});

test("an administrator saves the clinic default for a module", async () => {
  render(<TabManagementSettings />);
  await screen.findByTestId("clinic-tabs");
  fireEvent.click(screen.getByTestId("tabs-module-acute"));
  await screen.findByTestId("clinic-tabs");
  const clinic = screen.getByTestId("clinic-tabs");
  fireEvent.click(clinic.querySelector('input[type="checkbox"][aria-label="Show Documents"], [data-testid="clinic-tabs-row-documents"] input'));
  fireEvent.click(screen.getByRole("button", { name: "Save clinic default" }));
  await waitFor(() => expect(api.put).toHaveBeenCalled());
  expect(api.put.mock.calls[0][0]).toBe("/tabs/defaults/");
  expect(api.put.mock.calls[0][1].care_setting).toBe("acute");
  expect(api.put.mock.calls[0][1].default_tab).toBe("orders");
  expect(api.put.mock.calls[0][1].items.find((i) => i.key === "documents")).toEqual({ key: "documents", visible: true });
});

test("the server's message is shown when saving fails", async () => {
  api.put.mockRejectedValue({ response: { data: { detail: "Results is not available in this module." } } });
  render(<TabManagementSettings />);
  await screen.findByTestId("my-tabs");
  fireEvent.click(screen.getAllByLabelText("Show Results")[0]);
  fireEvent.click(screen.getByRole("button", { name: "Save my tabs" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Results is not available in this module."));
});

test("a load failure says so and does not crash", async () => {
  api.get.mockRejectedValue({ response: { data: { detail: "Not allowed." } } });
  render(<TabManagementSettings />);
  expect(await screen.findByText("Not allowed.")).toBeInTheDocument();
});

describe("All facilities", () => {
  const { configureFacilityScope, chooseFacility, resetFacilityScope, ALL } = require("../../utils/facilityScope");
  beforeEach(() => {
    window.sessionStorage.clear();
    configureFacilityScope([{ id: 1, name: "Alpha" }, { id: 2, name: "Bravo" }]);
    chooseFacility(ALL);
  });
  afterEach(() => resetFacilityScope());

  test("only the clinic default is offered (personal tabs belong to one facility)", async () => {
    render(<TabManagementSettings />);
    await screen.findByTestId("clinic-tabs");
    expect(screen.queryByTestId("my-tabs")).not.toBeInTheDocument();
  });

  test("saving the clinic default is repeated for every facility", async () => {
    render(<TabManagementSettings />);
    await screen.findByTestId("clinic-tabs");
    fireEvent.click(screen.getByLabelText("Show Results"));
    fireEvent.click(screen.getByRole("button", { name: "Save clinic default" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Tabs saved."));
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(api.put.mock.calls.every(([url]) => url === "/tabs/defaults/")).toBe(true);
  });
});
