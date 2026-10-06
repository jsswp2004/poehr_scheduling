import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => { const api = jest.fn(() => Promise.resolve({ data: {} })); api.get = jest.fn(); return { api }; }, { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      locationTree: "/loc/tree/",
      locationItems: (k) => `/loc/${k}/`,
      locationItem: (k, id) => `/loc/${k}/${id}/`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import LocationManager from "../locations/LocationManager";

const tree = (canEdit = true) => ({
  can_edit: canEdit,
  care_types: [],
  locations: [
    {
      id: 1, name: "Main Hospital", code: "MH", kind: "hospital", is_active: true,
      units: [
        {
          id: 5, name: "3 West", code: "3W", care_type: "inpatient", care_setting: "acute", is_active: true, bed_count: 2, occupied_count: 1,
          rooms: [
            { id: 7, name: "312", is_active: true, beds: [
              { id: 11, name: "A", is_active: true, hold: "", hold_reason: "", status: "occupied", occupant: "Doe, Jane", visit_number: "V1" },
              { id: 12, name: "B", is_active: true, hold: "", hold_reason: "", status: "available", occupant: null, visit_number: null },
            ] },
          ],
        },
      ],
    },
  ],
});

beforeEach(() => {
  api.mockClear();
  api.get.mockReset();
});

test("shows the tree and expands down to bed status", async () => {
  api.get.mockResolvedValue({ data: tree() });
  render(<LocationManager />);
  expect(await screen.findByText("Main Hospital")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Expand Main Hospital" }));
  expect(await screen.findByText("3 West")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Expand 3 West" }));
  fireEvent.click(await screen.findByRole("button", { name: "Expand Room 312" }));
  expect(await screen.findByTestId("bed-status-11")).toHaveTextContent("occupied");
  expect(screen.getByTestId("bed-status-12")).toHaveTextContent("available");
});

test("an admin can switch a location off", async () => {
  api.get.mockResolvedValue({ data: tree() });
  render(<LocationManager />);
  fireEvent.click(await screen.findByRole("button", { name: "Switch off Main Hospital" }));
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(api.mock.calls[0][0]).toMatchObject({ method: "patch", url: "/loc/facilities/1/", data: { is_active: false } });
});

test("a non-admin sees the tree but no edit buttons", async () => {
  api.get.mockResolvedValue({ data: tree(false) });
  render(<LocationManager />);
  expect(await screen.findByText("Main Hospital")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit Main Hospital" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete Main Hospital" })).toBeNull();
});

test("an empty clinic is told how to start", async () => {
  api.get.mockResolvedValue({ data: { can_edit: true, locations: [] } });
  render(<LocationManager />);
  expect(await screen.findByText(/Add your first hospital or clinic/)).toBeInTheDocument();
});

test("shows the server's message when the tree cannot load", async () => {
  api.get.mockRejectedValue({ response: { data: { detail: "Not allowed." } } });
  render(<LocationManager />);
  expect(await screen.findByText("Not allowed.")).toBeInTheDocument();
});
