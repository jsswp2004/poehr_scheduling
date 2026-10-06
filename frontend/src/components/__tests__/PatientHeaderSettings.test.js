import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      patientHeaderConfig: "/cfg",
      patientHeaderFields: "/fields",
      patientHeaderField: (id) => `/fields/${id}`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import PatientHeaderSettings from "../patientHeader/PatientHeaderSettings";

const row = (key, label, visible, extra = {}) => ({ key, label, description: "", visible, kind: "builtin", ...extra });
const config = (over = {}) => ({
  organization: 1,
  can_edit: true,
  items: [row("name", "Patient name", true), row("mrn", "MRN", true), row("allergies", "Allergies", true), row("dob", "Date of birth", false)],
  ...over,
});

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.values(toast).forEach((fn) => fn.mockReset());
  api.get.mockResolvedValue({ data: config() });
});

const order = () => screen.getAllByTestId(/^header-row-/).map((el) => el.getAttribute("data-testid").replace("header-row-", ""));

test("lists every item, switched on or off, with a preview of what is shown", async () => {
  render(<PatientHeaderSettings />);
  await screen.findByTestId("header-row-name");
  expect(order()).toEqual(["name", "mrn", "allergies", "dob"]);
  expect(screen.getByLabelText("Show MRN")).toBeChecked();
  expect(screen.getByLabelText("Show Date of birth")).not.toBeChecked();
  expect(screen.getByTestId("header-preview")).toHaveTextContent("Patient name · MRN · Allergies");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(); // nothing changed
});

test("switching an item off updates the preview and enables Save", async () => {
  render(<PatientHeaderSettings />);
  await screen.findByTestId("header-row-name");
  fireEvent.click(screen.getByLabelText("Show MRN"));
  expect(screen.getByTestId("header-preview")).not.toHaveTextContent("MRN");
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

test("arrows reorder, the ends are disabled, and Save sends the order", async () => {
  api.put.mockImplementation(async (url, body) => ({ data: config({ items: body.items.map((i) => row(i.key, i.key, i.visible)) }) }));
  render(<PatientHeaderSettings />);
  await screen.findByTestId("header-row-name");
  expect(screen.getByLabelText("Move Patient name up")).toBeDisabled();
  expect(screen.getByLabelText("Move Date of birth down")).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Move Allergies up"));
  fireEvent.click(screen.getByLabelText("Show Date of birth"));
  expect(order()).toEqual(["name", "allergies", "mrn", "dob"]);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith(
      "/cfg",
      { items: [{ key: "name", visible: true }, { key: "allergies", visible: true }, { key: "mrn", visible: true }, { key: "dob", visible: true }] },
      expect.anything()
    )
  );
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Patient header saved."));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(); // saved: no longer unsaved
});

test("cannot save with nothing shown", async () => {
  render(<PatientHeaderSettings />);
  await screen.findByTestId("header-row-name");
  for (const label of ["Patient name", "MRN", "Allergies"]) fireEvent.click(screen.getByLabelText(`Show ${label}`));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByText("Show at least one item.")).toBeInTheDocument();
});

test("a non-administrator can look but not change", async () => {
  api.get.mockResolvedValue({ data: config({ can_edit: false }) });
  render(<PatientHeaderSettings />);
  await screen.findByTestId("header-row-name");
  expect(screen.getByText("Only an administrator can change the patient header.")).toBeInTheDocument();
  expect(screen.getByLabelText("Show MRN")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add an item" })).not.toBeInTheDocument();
});

test("adds the clinic's own item: it joins the end, switched on, until saved", async () => {
  api.post.mockResolvedValue({ data: { id: 4, key: "code-status", item_key: "custom:code-status", label: "Code status", field_type: "text", alert: false } });
  render(<PatientHeaderSettings />);
  await screen.findByTestId("header-row-name");
  fireEvent.click(screen.getByRole("button", { name: "Add an item" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Code status" } });
  fireEvent.click(within(dialog).getByLabelText("Show in red when filled in"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/fields", { label: "Code status", field_type: "text", alert: true }, expect.anything()));
  await screen.findByTestId("header-row-custom:code-status");
  expect(order()).toEqual(["name", "mrn", "allergies", "dob", "custom:code-status"]);
  expect(screen.getByLabelText("Show Code status")).toBeChecked();
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

test("shows the server's reason when an item can't be added", async () => {
  api.post.mockRejectedValue({ response: { data: { detail: "You already have an item with that name." } } });
  render(<PatientHeaderSettings />);
  await screen.findByTestId("header-row-name");
  fireEvent.click(screen.getByRole("button", { name: "Add an item" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Code status" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You already have an item with that name."));
});

test("deleting a custom item asks first, then removes it", async () => {
  api.get.mockImplementation(async (url) =>
    url === "/fields"
      ? { data: [{ id: 4, key: "code-status", item_key: "custom:code-status", label: "Code status" }] }
      : { data: config({ items: [...config().items, row("custom:code-status", "Code status", true, { kind: "custom", field_type: "text" })] }) }
  );
  api.delete.mockResolvedValue({ data: {} });
  const confirm = jest.spyOn(window, "confirm");
  render(<PatientHeaderSettings />);
  await screen.findByTestId("header-row-custom:code-status");
  expect(screen.queryByLabelText("Delete Patient name")).not.toBeInTheDocument(); // built-in items can't be deleted
  confirm.mockReturnValueOnce(false);
  fireEvent.click(screen.getByLabelText("Delete Code status"));
  expect(api.delete).not.toHaveBeenCalled();
  confirm.mockReturnValueOnce(true);
  fireEvent.click(screen.getByLabelText("Delete Code status"));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/fields/4", expect.anything()));
  await waitFor(() => expect(screen.queryByTestId("header-row-custom:code-status")).not.toBeInTheDocument());
  confirm.mockRestore();
});

test("explains when the settings can't be loaded", async () => {
  api.get.mockRejectedValue({ response: { data: { detail: "Choose a clinic (?org=ID)." } } });
  render(<PatientHeaderSettings />);
  expect(await screen.findByText("Choose a clinic (?org=ID).")).toBeInTheDocument();
});
