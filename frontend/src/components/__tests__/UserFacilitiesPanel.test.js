import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), put: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { userFacilities: (id) => `/users/${id}/facilities/` } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({}), { virtual: true });

import { api } from "../../api/client";
import UserFacilitiesPanel from "../profile/UserFacilitiesPanel";

const USER = { id: 9, first_name: "Jeffrey", last_name: "Lee", username: "jlee", role: "doctor" };
const PAYLOAD = (ids = [], extra = {}) => ({
  user_id: 9,
  organization: 1,
  facility_ids: ids,
  restricted: ids.length > 0,
  facilities: [
    { id: 1, name: "General Hospital", kind: "hospital", is_active: true },
    { id: 2, name: "St. Mary Hospital", kind: "hospital", is_active: true },
    { id: 3, name: "Annex", kind: "clinic", is_active: false },
  ],
  ...extra,
});

beforeEach(() => {
  api.get.mockReset();
  api.put.mockReset();
});

test("lists the facilities with nothing checked for an unrestricted person", async () => {
  api.get.mockResolvedValue({ data: PAYLOAD() });
  render(<UserFacilitiesPanel user={USER} />);
  expect(await screen.findByLabelText(/General Hospital/)).not.toBeChecked();
  expect(screen.getByLabelText(/St\. Mary Hospital/)).not.toBeChecked();
  expect(screen.getByLabelText(/Annex.*inactive/)).toBeInTheDocument();
  expect(screen.getByText(/Leave every box unchecked/)).toBeInTheDocument();
  expect(screen.getByTestId("facilities-save")).toBeDisabled();
  expect(api.get).toHaveBeenCalledWith("/users/9/facilities/", expect.anything());
});

test("shows the saved assignment as checked", async () => {
  api.get.mockResolvedValue({ data: PAYLOAD([2]) });
  render(<UserFacilitiesPanel user={USER} />);
  expect(await screen.findByLabelText(/St\. Mary Hospital/)).toBeChecked();
  expect(screen.getByLabelText(/General Hospital/)).not.toBeChecked();
});

test("saves the checked facilities", async () => {
  api.get.mockResolvedValue({ data: PAYLOAD() });
  api.put.mockResolvedValue({ data: PAYLOAD([1, 2]) });
  render(<UserFacilitiesPanel user={USER} />);
  fireEvent.click(await screen.findByLabelText(/General Hospital/));
  fireEvent.click(screen.getByLabelText(/St\. Mary Hospital/));
  fireEvent.click(screen.getByTestId("facilities-save"));
  await waitFor(() => expect(api.put).toHaveBeenCalled());
  expect(api.put).toHaveBeenCalledWith("/users/9/facilities/", { facility_ids: [1, 2] }, expect.anything());
  expect(await screen.findByTestId("facilities-saved")).toHaveTextContent("limited to 2 facilities");
});

test("unchecking everything saves no restriction", async () => {
  api.get.mockResolvedValue({ data: PAYLOAD([1]) });
  api.put.mockResolvedValue({ data: PAYLOAD([]) });
  render(<UserFacilitiesPanel user={USER} />);
  fireEvent.click(await screen.findByLabelText(/General Hospital/));
  fireEvent.click(screen.getByTestId("facilities-save"));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith("/users/9/facilities/", { facility_ids: [] }, expect.anything()));
  expect(await screen.findByTestId("facilities-saved")).toHaveTextContent("no restriction");
});

test("a failed save keeps the choice and shows why", async () => {
  api.get.mockResolvedValue({ data: PAYLOAD() });
  api.put.mockRejectedValue({ response: { status: 400, data: { detail: "Every facility must belong to this person's organization." } } });
  render(<UserFacilitiesPanel user={USER} />);
  fireEvent.click(await screen.findByLabelText(/General Hospital/));
  fireEvent.click(screen.getByTestId("facilities-save"));
  expect(await screen.findByTestId("facilities-error")).toHaveTextContent("Every facility must belong");
  expect(screen.getByLabelText(/General Hospital/)).toBeChecked();
});

test("a failed load shows the error and no checkboxes", async () => {
  api.get.mockRejectedValue({ response: { status: 403, data: { detail: "no" } } });
  render(<UserFacilitiesPanel user={USER} />);
  expect(await screen.findByTestId("facilities-error")).toBeInTheDocument();
  expect(screen.queryByTestId("facilities-save")).not.toBeInTheDocument();
});

test("an organization with no facilities says so", async () => {
  api.get.mockResolvedValue({ data: PAYLOAD([], { facilities: [] }) });
  render(<UserFacilitiesPanel user={USER} />);
  expect(await screen.findByTestId("facilities-none")).toBeInTheDocument();
});

test("a system admin is told they are never restricted", async () => {
  api.get.mockResolvedValue({ data: PAYLOAD() });
  render(<UserFacilitiesPanel user={{ ...USER, role: "system_admin" }} />);
  expect(await screen.findByText(/never restricted/)).toBeInTheDocument();
});

test("switching to another person reloads their facilities", async () => {
  api.get.mockResolvedValueOnce({ data: PAYLOAD([1]) }).mockResolvedValueOnce({ data: PAYLOAD([2], { user_id: 10 }) });
  const { rerender } = render(<UserFacilitiesPanel user={USER} />);
  expect(await screen.findByLabelText(/General Hospital/)).toBeChecked();
  rerender(<UserFacilitiesPanel user={{ ...USER, id: 10, first_name: "Ann" }} />);
  await waitFor(() => expect(screen.getByLabelText(/St\. Mary Hospital/)).toBeChecked());
  expect(screen.getByLabelText(/General Hospital/)).not.toBeChecked();
  expect(api.get).toHaveBeenLastCalledWith("/users/10/facilities/", expect.anything());
});
