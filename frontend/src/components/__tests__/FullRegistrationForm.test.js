import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("axios", () => ({ get: jest.fn(), patch: jest.fn(), post: jest.fn() }), { virtual: true });
jest.mock("react-select", () => ({ __esModule: true, default: () => null }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "tok" }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    API_BASE_URL: "http://api",
    apiEndpoints: {
      patients: "/patients/",
      registrations: "/registrations/",
      registration: (id) => `/registrations/${id}/`,
    },
  }),
  { virtual: true }
);
jest.mock("../locations/LocationPicker", () => ({ __esModule: true, default: () => null, useLocationTree: () => [] }), { virtual: true });

import axios from "axios";
import FullRegistrationForm from "../registration/FullRegistrationForm";

const sofia = (visit) => ({
  id: 9,
  user_id: 90,
  first_name: "Sofia",
  last_name: "Marchetti",
  mrn: "M1",
  current_visit: visit,
});

const openVisit = {
  id: 55,
  visit_number: "V-55",
  patient: 9,
  reason_for_visit: "",
  presenting_problem: "",
  facility: 1,
  unit: 5,
  room: 7,
  bed: 11,
  arrival_time: "2026-10-06T14:30:00Z",
  attending_provider: 3,
  care_setting: "emergency",
  admission_type: "emergency",
};

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockImplementation((url) =>
    Promise.resolve({ data: url === "/registrations/" ? { results: [openVisit] } : openVisit })
  );
  axios.patch.mockImplementation((url) =>
    Promise.resolve({ data: url.includes("registrations") ? { ...openVisit, visit_number: "V-55" } : { mrn: "M1" } })
  );
  axios.post.mockResolvedValue({ data: { id: 77, visit_number: "V-77" } });
});

const open = (patient) =>
  render(<FullRegistrationForm doctors={[]} initialPatient={patient} initialPatientNonce={1} />);

const goToReason = async () => {
  fireEvent.click(await screen.findByRole("tab", { name: "Reason for Visit" }));
};

test("editing a patient with an open visit loads that visit and Save updates it", async () => {
  open(sofia(null));
  expect(await screen.findByText(/Editing the open visit V-55/)).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith("/registrations/", expect.objectContaining({ params: { patient: 9, open: 1 } }));

  await goToReason();
  fireEvent.change(screen.getByLabelText("Chief Complaint"), { target: { value: "Chest pain" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Registration" }));

  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith("/registrations/55/", expect.anything(), expect.anything()));
  expect(axios.post).not.toHaveBeenCalled();
  const payload = axios.patch.mock.calls.find((c) => c[0] === "/registrations/55/")[1];
  expect(payload.presenting_problem).toBe("Chest pain");
  expect(payload.bed).toBe("11");
  expect(payload.attending_provider).toBe("3");
  expect(payload.arrival_time).toMatch(/^2026-10-06T\d\d:\d\d$/);
});

test("'Start a new visit instead' makes Save create a new visit", async () => {
  open(sofia(null));
  fireEvent.click(await screen.findByRole("button", { name: "Start a new visit instead" }));
  expect(screen.queryByText(/Editing the open visit/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save Registration" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/registrations/", expect.anything(), expect.anything()));
});

test("with several open visits the one on the board (has a bed) is loaded and others can be picked", async () => {
  const blank = { ...openVisit, id: 60, visit_number: "V-60", bed: null, unit: null, room: null, facility: null, care_setting: "" };
  axios.get.mockResolvedValue({ data: { results: [blank, openVisit] } });
  open(sofia(null));
  expect(await screen.findByText(/Editing the open visit V-55/)).toBeInTheDocument();
  expect(screen.getByLabelText("Open visits")).toBeInTheDocument();
});

test("no open visits (all discharged) starts a blank visit", async () => {
  axios.get.mockResolvedValue({ data: { results: [] } });
  open(sofia({ id: 55, discharge_datetime: "2026-10-05T10:00:00Z" }));
  await screen.findByText("Sofia Marchetti");
  expect(screen.queryByText(/Editing the open visit/)).not.toBeInTheDocument();
});

test("a patient with no visit starts a blank one", async () => {
  axios.get.mockResolvedValue({ data: [] });
  open(sofia(null));
  await screen.findByText("Sofia Marchetti");
  fireEvent.click(screen.getByRole("button", { name: "Save Registration" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalled());
});
