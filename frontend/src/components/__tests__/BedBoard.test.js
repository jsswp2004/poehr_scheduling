import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({ apiEndpoints: { locationTree: "/loc/tree/", bedHold: (id) => `/loc/beds/${id}/hold/` } }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import BedBoard from "../patients/BedBoard";

const tree = [
  {
    id: 1, name: "General Hospital", units: [
      {
        id: 5, name: "3 West", care_type: "inpatient", bed_count: 4, occupied_count: 1, rooms: [
          { id: 7, name: "312", beds: [
            { id: 11, name: "A", status: "occupied", occupant: "Bcs, Test", patient: 3, patient_user_id: 30, registration: 90, visit_number: "VN-000090", attending_provider: 8, attending_provider_name: "Dr. Jeffrey Lee" },
            { id: 12, name: "B", status: "available" },
            { id: 13, name: "C", status: "cleaning" },
            { id: 14, name: "D", status: "blocked", hold_reason: "Broken rail" },
          ] },
        ],
      },
      { id: 6, name: "Cardiology", care_type: "outpatient", rooms: [] },
    ],
  },
];

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.get.mockResolvedValue({ data: { locations: tree } });
  api.post.mockResolvedValue({ data: {} });
});

test("shows inpatient units only, with counts, occupants and statuses", async () => {
  render(<BedBoard userRole="nurse" />);
  expect(await screen.findByTestId("board-unit-5")).toBeInTheDocument();
  expect(screen.queryByTestId("board-unit-6")).toBeNull();
  expect(screen.getByTestId("board-count-5")).toHaveTextContent("1 of 4 occupied");
  expect(within(screen.getByTestId("board-bed-11")).getByText("Bcs, Test")).toBeInTheDocument();
  expect(within(screen.getByTestId("board-bed-14")).getByText("Broken rail")).toBeInTheDocument();
});

test("an occupied bed offers transfer and discharge for that patient", async () => {
  const onTransfer = jest.fn();
  const onDischarge = jest.fn();
  render(<BedBoard userRole="nurse" onTransfer={onTransfer} onDischarge={onDischarge} />);
  fireEvent.click(await screen.findByRole("button", { name: "Transfer Bcs, Test" }));
  fireEvent.click(screen.getByRole("button", { name: "Discharge Bcs, Test" }));
  const patient = onTransfer.mock.calls[0][0];
  expect(patient).toMatchObject({ id: 3, user_id: 30, full_name: "Bcs, Test" });
  expect(patient.current_visit).toMatchObject({ id: 90, location: "General Hospital › 3 West › 312 › A" });
  expect(onDischarge).toHaveBeenCalledWith(patient);
});

test("clicking the occupant opens their chart", async () => {
  const onOpenPatient = jest.fn();
  render(<BedBoard userRole="doctor" onOpenPatient={onOpenPatient} />);
  fireEvent.click(await screen.findByText("Bcs, Test"));
  expect(onOpenPatient.mock.calls[0][0].user_id).toBe(30);
});

test("a free bed can be marked for cleaning, and a cleaning bed made available again", async () => {
  render(<BedBoard userRole="nurse" />);
  fireEvent.click(await screen.findByRole("button", { name: "Mark bed B for cleaning" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/loc/beds/12/hold/", { hold: "cleaning", hold_reason: "" }, expect.anything()));
  fireEvent.click(screen.getByRole("button", { name: "Make bed C available" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/loc/beds/13/hold/", { hold: "", hold_reason: "" }, expect.anything()));
  // the board reloads after each change
  await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(2));
});

test("blocking asks for a reason first", async () => {
  render(<BedBoard userRole="registrar" />);
  fireEvent.click(await screen.findByRole("button", { name: "Block bed B" }));
  fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Leaking ceiling" } });
  fireEvent.click(screen.getByRole("button", { name: "Block" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/loc/beds/12/hold/", { hold: "blocked", hold_reason: "Leaking ceiling" }, expect.anything()));
});

test("roles that cannot act see the board but no buttons", async () => {
  render(<BedBoard userRole="receptionist" onTransfer={() => {}} />);
  await screen.findByTestId("board-unit-5");
  expect(screen.queryByRole("button", { name: /Block bed|Transfer|cleaning/ })).toBeNull();
});

test("says so when there are no inpatient units, and shows load errors", async () => {
  api.get.mockResolvedValue({ data: { locations: [{ id: 1, name: "Clinic", units: [] }] } });
  const { unmount } = render(<BedBoard userRole="nurse" />);
  expect(await screen.findByTestId("no-board-units")).toBeInTheDocument();
  unmount();
  api.get.mockRejectedValue({ response: { data: { detail: "Not allowed." } } });
  render(<BedBoard userRole="nurse" />);
  expect(await screen.findByText("Not allowed.")).toBeInTheDocument();
});

test("an occupied bed shows its attending and opens the attending dialog for that patient", async () => {
  const onChangeAttending = jest.fn();
  render(<BedBoard userRole="nurse" onChangeAttending={onChangeAttending} />);
  expect(await screen.findByTestId("board-attending-11")).toHaveTextContent("Dr. Jeffrey Lee");
  fireEvent.click(screen.getByRole("button", { name: "Attending for Bcs, Test" }));
  const patient = onChangeAttending.mock.calls[0][0];
  expect(patient).toMatchObject({ id: 3, user_id: 30, full_name: "Bcs, Test" });
  // the dialog reads the current attending from the visit
  expect(patient.current_visit).toMatchObject({ id: 90, attending_provider: 8, attending_provider_name: "Dr. Jeffrey Lee" });
});

test("a bed with no attending says so, and empty beds have no attending button", async () => {
  api.get.mockResolvedValue({
    data: { locations: [{ ...tree[0], units: [{ ...tree[0].units[0], rooms: [{ id: 7, name: "312", beds: [
      { id: 11, name: "A", status: "occupied", occupant: "Bcs, Test", patient: 3, patient_user_id: 30, registration: 90, attending_provider: null, attending_provider_name: "" },
      { id: 12, name: "B", status: "available" },
    ] }] }] }] },
  });
  render(<BedBoard userRole="doctor" onChangeAttending={jest.fn()} />);
  expect(await screen.findByTestId("board-attending-11")).toHaveTextContent("No attending set");
  expect(screen.getAllByRole("button", { name: /^Attending for / })).toHaveLength(1);
  expect(screen.queryByTestId("board-attending-12")).toBeNull();
});

test("the attending button needs a front-line role and a handler", async () => {
  const { unmount } = render(<BedBoard userRole="receptionist" onChangeAttending={jest.fn()} />);
  await screen.findByTestId("board-unit-5");
  expect(screen.queryByRole("button", { name: "Attending for Bcs, Test" })).toBeNull();
  unmount();
  render(<BedBoard userRole="nurse" />);
  await screen.findByTestId("board-unit-5");
  expect(screen.queryByRole("button", { name: "Attending for Bcs, Test" })).toBeNull();
});
