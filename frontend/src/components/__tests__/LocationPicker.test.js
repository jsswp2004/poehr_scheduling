import { render, screen, fireEvent, within } from "@testing-library/react";

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

import LocationPicker from "../locations/LocationPicker";

const tree = [
  {
    id: 1, name: "Main Hospital", units: [
      { id: 5, name: "3 West", care_type: "inpatient", care_setting: "acute", rooms: [
        { id: 7, name: "312", beds: [
          { id: 11, name: "A", status: "occupied" },
          { id: 12, name: "B", status: "available" },
          { id: 13, name: "C", status: "cleaning" },
        ] },
      ] },
      { id: 6, name: "Clinic A", care_type: "outpatient", care_setting: "ambulatory", rooms: [] },
    ],
  },
  { id: 2, name: "Downtown Clinic", units: [] },
];

const pick = (testId, name) => {
  fireEvent.mouseDown(within(screen.getByTestId(testId).closest(".MuiInputBase-root")).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name }));
};

test("tells staff when nothing has been built", () => {
  render(<LocationPicker tree={[]} value={{}} onChange={() => {}} />);
  expect(screen.getByTestId("no-locations")).toBeInTheDocument();
});

test("choosing a unit reports the care setting it implies", () => {
  const onChange = jest.fn();
  render(<LocationPicker tree={tree} value={{ facility: 1 }} onChange={onChange} />);
  pick("loc-unit", /3 West/);
  expect(onChange).toHaveBeenCalledWith({ facility: 1, unit: 5, room: "", bed: "" }, "acute");
});

test("choosing a clinic clears the lower levels", () => {
  const onChange = jest.fn();
  render(<LocationPicker tree={tree} value={{ facility: 1, unit: 5, room: 7, bed: 12 }} onChange={onChange} />);
  pick("loc-facility", "Downtown Clinic");
  expect(onChange).toHaveBeenCalledWith({ facility: 2, unit: "", room: "", bed: "" }, "");
});

test("occupied and cleaning beds cannot be picked, free ones can", () => {
  render(<LocationPicker tree={tree} value={{ facility: 1, unit: 5, room: 7 }} onChange={() => {}} />);
  fireEvent.mouseDown(within(screen.getByTestId("loc-bed").closest(".MuiInputBase-root")).getByRole("combobox"));
  expect(screen.getByRole("option", { name: "A (occupied)" })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("option", { name: "C (cleaning)" })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("option", { name: "B" })).not.toHaveAttribute("aria-disabled");
});

test("the unit level hides room and bed (appointments)", () => {
  render(<LocationPicker level="unit" tree={tree} value={{ facility: 1 }} onChange={() => {}} />);
  expect(screen.getByTestId("loc-unit")).toBeInTheDocument();
  expect(screen.queryByTestId("loc-room")).toBeNull();
  expect(screen.queryByTestId("loc-bed")).toBeNull();
});
