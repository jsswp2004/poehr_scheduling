import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      patientHeader: (id) => `/h/${id}`,
      patientHeaderValues: (id) => `/h/${id}/values`,
      patientAllergies: (id) => `/h/${id}/allergies`,
      patientAllergy: (id, a) => `/h/${id}/allergies/${a}`,
      patientAllergyStatus: (id) => `/h/${id}/allergy-status`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import PatientChartHeader from "../patientHeader/PatientChartHeader";

const header = (over = {}) => ({
  patient: 3,
  visit: 9,
  items: [
    { key: "name", label: "Patient name", value: "Bcs, Test", emphasis: "strong" },
    { key: "location", label: "Location", value: "N43-PICU", emphasis: "none" },
    { key: "attending", label: "Attending", value: "Dr. Jeffrey Lee", emphasis: "none" },
    { key: "mrn", label: "MRN", value: "MRN-000012", emphasis: "none" },
    { key: "visit_id", label: "Visit ID", value: "", emphasis: "none" },
    { key: "allergies", label: "Allergies", value: "Penicillin (Hives, severe)", emphasis: "alert" },
  ],
  allergies: { no_known_allergies: false, records: [{ id: 5, substance: "Penicillin", reaction: "Hives", severity: "severe", status: "active" }] },
  custom_fields: [{ key: "custom:code-status", label: "Code status", field_type: "text", value: "Full code" }],
  ...over,
});

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  toast.error.mockReset();
  api.get.mockResolvedValue({ data: header() });
});

test("shows the name first, then each item with its label; empty values show a dash", async () => {
  render(<PatientChartHeader patientId={3} />);
  await screen.findByText("Bcs, Test");
  expect(screen.getByTestId("header-item-location")).toHaveTextContent("Location:N43-PICU");
  expect(screen.getByTestId("header-item-attending")).toHaveTextContent("Dr. Jeffrey Lee");
  expect(screen.getByTestId("header-item-mrn")).toHaveTextContent("MRN-000012");
  expect(screen.getByTestId("header-item-visit_id")).toHaveTextContent("Visit ID:—");
  expect(screen.getByTestId("header-item-allergies")).toHaveTextContent("Penicillin (Hives, severe)");
  expect(api.get).toHaveBeenCalledWith("/h/3", expect.objectContaining({ params: {} }));
});

test("draws only what the server sends, in the order sent", async () => {
  api.get.mockResolvedValue({
    data: header({
      items: [
        { key: "mrn", label: "MRN", value: "MRN-1", emphasis: "none" },
        { key: "name", label: "Patient name", value: "Bcs, Test", emphasis: "strong" },
      ],
    }),
  });
  render(<PatientChartHeader patientId={3} />);
  await screen.findByTestId("patient-chart-header");
  expect(screen.queryByTestId("header-item-allergies")).not.toBeInTheDocument();
  expect(screen.getByTestId("header-item-name")).toBeInTheDocument(); // not first, so drawn as a labelled item
});

test("no banner when the server refuses (no access)", async () => {
  api.get.mockRejectedValue({ response: { status: 403 } });
  const { container } = render(<PatientChartHeader patientId={3} />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

test("adds an allergy from the pencil dialog and reloads", async () => {
  api.post.mockResolvedValue({ data: {} });
  render(<PatientChartHeader patientId={3} />);
  await screen.findByText("Bcs, Test");
  fireEvent.click(screen.getByLabelText("Update allergies and header details"));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByTestId("allergy-5")).toHaveTextContent("Penicillin");
  fireEvent.change(within(dialog).getByLabelText("Allergic to"), { target: { value: "Latex" } });
  fireEvent.change(within(dialog).getByLabelText("Reaction"), { target: { value: "Rash" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/h/3/allergies", { substance: "Latex", reaction: "Rash", severity: "" }, expect.anything()));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2)); // header reloaded
});

test("Add stays disabled until something is typed", async () => {
  render(<PatientChartHeader patientId={3} />);
  await screen.findByText("Bcs, Test");
  fireEvent.click(screen.getByLabelText("Update allergies and header details"));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();
});

test("mark inactive and entered in error call the right endpoints", async () => {
  api.patch.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
  render(<PatientChartHeader patientId={3} />);
  await screen.findByText("Bcs, Test");
  fireEvent.click(screen.getByLabelText("Update allergies and header details"));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Mark inactive" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/h/3/allergies/5", { status: "inactive" }, expect.anything()));
  fireEvent.click(within(dialog).getByRole("button", { name: "Entered in error" }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/h/3/allergies/5", expect.anything()));
});

test("records no known allergies when none are listed", async () => {
  api.get.mockResolvedValue({
    data: header({
      allergies: { no_known_allergies: false, records: [] },
      items: [{ key: "name", label: "Patient name", value: "Bcs, Test", emphasis: "strong" }, { key: "allergies", label: "Allergies", value: "Not documented", emphasis: "warn" }],
    }),
  });
  api.put.mockResolvedValue({ data: {} });
  render(<PatientChartHeader patientId={3} />);
  await screen.findByText("Bcs, Test");
  expect(screen.getByTestId("header-item-allergies")).toHaveTextContent("Not documented");
  fireEvent.click(screen.getByLabelText("Update allergies and header details"));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Patient has no known allergies" }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith("/h/3/allergy-status", { no_known_allergies: true }, expect.anything()));
});

test("shows the server's message when a change is refused", async () => {
  api.post.mockRejectedValue({ response: { data: { detail: "Penicillin is already on the list." } } });
  render(<PatientChartHeader patientId={3} />);
  await screen.findByText("Bcs, Test");
  fireEvent.click(screen.getByLabelText("Update allergies and header details"));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Allergic to"), { target: { value: "Penicillin" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Penicillin is already on the list."));
});

test("saves clinic-defined details", async () => {
  api.put.mockResolvedValue({ data: {} });
  render(<PatientChartHeader patientId={3} />);
  await screen.findByText("Bcs, Test");
  fireEvent.click(screen.getByLabelText("Update allergies and header details"));
  const dialog = await screen.findByRole("dialog");
  const save = within(dialog).getByRole("button", { name: "Save details" });
  expect(save).toBeDisabled(); // nothing changed yet
  fireEvent.change(within(dialog).getByLabelText("Code status"), { target: { value: "DNR" } });
  expect(save).toBeEnabled();
  fireEvent.click(save);
  await waitFor(() => expect(api.put).toHaveBeenCalledWith("/h/3/values", { values: { "custom:code-status": "DNR" } }, expect.anything()));
});
