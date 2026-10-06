import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      locationTree: "/loc/tree/",
      admissionAdmit: "/adm/admit/",
      admissionTransfer: (id) => `/adm/${id}/transfer/`,
      admissionDischarge: (id) => `/adm/${id}/discharge/`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import { AdmitDialog, TransferDialog, DischargeDialog } from "../patients/AdmissionDialogs";

const tree = [
  {
    id: 1, name: "General Hospital", units: [
      { id: 5, name: "3 West", care_type: "inpatient", care_setting: "acute", rooms: [
        { id: 7, name: "312", beds: [{ id: 11, name: "A", status: "available" }, { id: 12, name: "B", status: "occupied" }] },
      ] },
      { id: 6, name: "Cardiology", care_type: "outpatient", care_setting: "ambulatory", rooms: [] },
    ],
  },
];

const ann = { id: 3, user_id: 30, full_name: "Ann Lee", current_visit: null };
const admitted = {
  id: 4, user_id: 40, full_name: "Bob Ray",
  current_visit: { id: 90, visit_number: "VN-000090", care_setting: "acute", location: "General Hospital › 3 West › 312 › A", discharge_datetime: null },
};

const pick = (testId, name) => {
  fireEvent.mouseDown(within(screen.getByTestId(testId).closest(".MuiInputBase-root")).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name }));
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  toast.success.mockClear();
  api.get.mockResolvedValue({ data: { locations: tree } });
});

test("admit offers only inpatient units and posts the chosen bed", async () => {
  api.post.mockResolvedValue({ data: {} });
  const onDone = jest.fn();
  const onClose = jest.fn();
  render(<AdmitDialog patient={ann} providers={[{ id: 8, first_name: "Jeff", last_name: "Lee" }]} onClose={onClose} onDone={onDone} />);
  await screen.findByTestId("location-picker");
  pick("loc-facility", "General Hospital");
  fireEvent.mouseDown(within(screen.getByTestId("loc-unit").closest(".MuiInputBase-root")).getByRole("combobox"));
  expect(screen.queryByRole("option", { name: /Cardiology/ })).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: /3 West/ }));
  pick("loc-room", "312");
  pick("loc-bed", "A");
  pick("admit-attending", "Dr. Jeff Lee");
  fireEvent.click(screen.getByRole("button", { name: "Admit" }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(api.post).toHaveBeenCalledWith(
    "/adm/admit/",
    { patient: 3, registration: null, unit: 5, room: 7, bed: 11, attending_provider: 8 },
    expect.anything()
  );
  expect(toast.success).toHaveBeenCalledWith("Ann Lee admitted");
  expect(onDone).toHaveBeenCalled();
});

test("admit stays disabled until a unit is chosen", async () => {
  render(<AdmitDialog patient={ann} onClose={() => {}} />);
  await screen.findByTestId("location-picker");
  expect(screen.getByRole("button", { name: "Admit" })).toBeDisabled();
});

test("admit from an open emergency visit passes that visit", async () => {
  api.post.mockResolvedValue({ data: {} });
  const ed = { ...ann, current_visit: { id: 77, visit_number: "VN-000077", care_setting: "emergency", discharge_datetime: null } };
  render(<AdmitDialog patient={ed} onClose={() => {}} />);
  await screen.findByTestId("location-picker");
  expect(screen.getByText(/from their emergency visit VN-000077/)).toBeInTheDocument();
  pick("loc-facility", "General Hospital");
  pick("loc-unit", /3 West/);
  fireEvent.click(screen.getByRole("button", { name: "Admit" }));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][1]).toMatchObject({ registration: 77, unit: 5, room: null, bed: null });
});

test("says so when there are no inpatient units", async () => {
  api.get.mockResolvedValue({ data: { locations: [{ id: 1, name: "Clinic", units: [{ id: 6, name: "Cardiology", care_type: "outpatient", care_setting: "ambulatory", rooms: [] }] }] } });
  render(<AdmitDialog patient={ann} onClose={() => {}} />);
  expect(await screen.findByTestId("no-inpatient-units")).toBeInTheDocument();
});

test("shows the server's reason when the bed is refused and stays open", async () => {
  api.post.mockRejectedValue({ response: { data: { detail: "Bed A is already occupied by Lee, Ann." } } });
  const onClose = jest.fn();
  render(<AdmitDialog patient={ann} onClose={onClose} />);
  await screen.findByTestId("location-picker");
  pick("loc-facility", "General Hospital");
  pick("loc-unit", /3 West/);
  fireEvent.click(screen.getByRole("button", { name: "Admit" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("already occupied");
  expect(onClose).not.toHaveBeenCalled();
});

test("transfer shows where the patient is and posts the new place", async () => {
  api.post.mockResolvedValue({ data: {} });
  const onClose = jest.fn();
  render(<TransferDialog patient={admitted} onClose={onClose} />);
  expect(screen.getByText(/Now in: General Hospital › 3 West › 312 › A/)).toBeInTheDocument();
  await screen.findByTestId("location-picker");
  pick("loc-facility", "General Hospital");
  pick("loc-unit", /Cardiology/);
  fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(api.post).toHaveBeenCalledWith("/adm/90/transfer/", { unit: 6, room: null, bed: null }, expect.anything());
});

test("discharge posts the time and says what it frees", async () => {
  api.post.mockResolvedValue({ data: {} });
  const onClose = jest.fn();
  render(<DischargeDialog patient={admitted} onClose={onClose} />);
  expect(screen.getByText(/This frees General Hospital › 3 West › 312 › A/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Discharge" }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const [url, body] = api.post.mock.calls[0];
  expect(url).toBe("/adm/90/discharge/");
  expect(Number.isNaN(Date.parse(body.discharge_datetime))).toBe(false);
});
