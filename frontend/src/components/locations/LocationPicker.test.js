import { render, screen, waitFor } from "@testing-library/react";
import { useLocationTree } from "./LocationPicker";
import { api } from "../../api/client";

jest.mock("../../api/client", () => ({ api: { get: jest.fn() } }));
jest.mock("../patientHeader/headerApi", () => ({ authHeader: async () => ({}) }));

const tree = [
  {
    id: 1, name: "General Hospital", units: [
      { id: 10, name: "3 West", is_surgical: false, rooms: [] },
      { id: 11, name: "Operating Rooms", is_surgical: true, rooms: [{ id: 5, name: "OR-1", beds: [] }] },
    ],
  },
];

function Names(props) {
  const t = useLocationTree(props);
  if (t === null) return <div>loading</div>;
  return <div data-testid="units">{t.flatMap((f) => f.units.map((u) => u.name)).join("|")}</div>;
}

beforeEach(() => api.get.mockResolvedValue({ data: { locations: tree } }));

test("registration and appointment pickers do not see operating-room units", async () => {
  render(<Names />);
  await waitFor(() => expect(screen.getByTestId("units")).toHaveTextContent("3 West"));
  expect(screen.getByTestId("units")).not.toHaveTextContent("Operating Rooms");
});

test("Surgery can ask for them", async () => {
  render(<Names includeSurgical />);
  await waitFor(() => expect(screen.getByTestId("units")).toHaveTextContent("3 West|Operating Rooms"));
});
