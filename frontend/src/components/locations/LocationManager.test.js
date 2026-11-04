import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LocationManager from "./LocationManager";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";

jest.mock("../../api/client", () => {
  const api = jest.fn();
  api.get = jest.fn();
  return { api };
});
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("../patientHeader/headerApi", () => ({ authHeader: async () => ({}), errorText: (e, f) => e?.response?.data?.detail || f }));

Object.assign(apiEndpoints, {
  locationTree: "/tree/",
  locationItems: (kind) => `/items/${kind}/`,
  locationItem: (kind, id) => `/items/${kind}/${id}/`,
});

const unit = (o) => ({ code: "", care_type: "outpatient", care_setting: "ambulatory", is_active: true, rooms: [], bed_count: 0, occupied_count: 0, ...o });
const tree = {
  can_edit: true,
  locations: [
    {
      id: 1, name: "General Hospital", code: "", kind: "hospital", is_active: true,
      units: [unit({ id: 10, name: "3 West", care_type: "inpatient", is_surgical: false }), unit({ id: 11, name: "Operating Rooms", is_surgical: true })],
    },
  ],
};

beforeEach(() => {
  api.get.mockResolvedValue({ data: tree });
  api.mockResolvedValue({});
});

test("an operating-room unit carries a badge and ordinary units do not", async () => {
  render(<LocationManager />);
  fireEvent.click(await screen.findByRole("button", { name: "Expand General Hospital" }));
  expect(await screen.findByText("Operating rooms")).toBeInTheDocument();
  expect(screen.getAllByText("Operating rooms")).toHaveLength(1);
});

test("a new unit can be marked as operating rooms", async () => {
  render(<LocationManager />);
  fireEvent.click(await screen.findByRole("button", { name: "Add unit to General Hospital" }));
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Perioperative" } });
  fireEvent.click(screen.getByTestId("unit-surgical"));
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(api).toHaveBeenCalled());
  const call = api.mock.calls[0][0];
  expect(call.method).toBe("post");
  expect(call.data).toMatchObject({ facility: 1, name: "Perioperative", is_surgical: true });
});

test("editing an operating-room unit shows the box ticked and an ordinary unit unticked", async () => {
  render(<LocationManager />);
  fireEvent.click(await screen.findByRole("button", { name: "Expand General Hospital" }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit Operating Rooms" }));
  expect(await screen.findByTestId("unit-surgical")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit 3 West" }));
  expect(await screen.findByTestId("unit-surgical")).not.toBeChecked();
  fireEvent.click(screen.getByTestId("unit-surgical"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(api.mock.calls[0][0].data).toMatchObject({ name: "3 West", is_surgical: true });
});
