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
import FullRegistrationForm, { birthHint } from "../registration/FullRegistrationForm";

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
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));

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
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalled());
});

test("birth hint: preterm babies get a corrected-age note, term babies none", () => {
  expect(birthHint("", "", "")).toBe("");
  expect(birthHint("39", "0", "2026-01-01")).toBe("");
  expect(birthHint("36", "0", "")).toBe("Born 4 weeks early.");
  expect(birthHint("32", "3", "")).toBe("Born 7.6 weeks early.");
  const recent = new Date(Date.now() - 200 * 86400000);
  const iso = `${recent.getFullYear()}-${String(recent.getMonth() + 1).padStart(2, "0")}-${String(recent.getDate()).padStart(2, "0")}`;
  expect(birthHint("36", "0", iso)).toMatch(/corrected age \(5\.\d months today\) until 24 months/);
  expect(birthHint("36", "0", "2015-01-01")).toBe("Born 4 weeks early.");
});

describe("step bar, footer and banner", () => {
  const tab = (name) => screen.getByRole("tab", { name });

  test("Save and continue saves and moves to the next step, Back returns", async () => {
    open(sofia(null));
    await screen.findByText(/Editing the open visit V-55/);
    expect(tab("Patient Identity")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(tab("Emergency Contact")).toHaveAttribute("aria-selected", "true"));
    expect(axios.patch).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(tab("Patient Identity")).toHaveAttribute("aria-selected", "true");
  });

  test("a failed save stays on the same step", async () => {
    axios.patch.mockRejectedValue({ response: { data: { detail: "No." } } });
    open(sofia(null));
    await screen.findByText(/Editing the open visit V-55/);
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(axios.patch).toHaveBeenCalled());
    expect(tab("Patient Identity")).toHaveAttribute("aria-selected", "true");
  });

  test("the last step offers Save Registration instead", async () => {
    open(sofia(null));
    await screen.findByText(/Editing the open visit V-55/);
    fireEvent.click(tab("Logistics"));
    expect(screen.getByRole("button", { name: "Save Registration" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save and continue" })).toBeNull();
  });

  test("the footer says when there are unsaved changes and when they are saved", async () => {
    open(sofia(null));
    await screen.findByText(/Editing the open visit V-55/);
    expect(screen.getByTestId("save-status")).toHaveTextContent("All changes saved");
    fireEvent.click(tab("Reason for Visit"));
    fireEvent.change(screen.getByLabelText("Chief Complaint"), { target: { value: "Cough" } });
    expect(screen.getByTestId("save-status")).toHaveTextContent("Unsaved changes");
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("All changes saved"));
  });

  test("the banner shows age, sex and date of birth", async () => {
    open({ ...sofia(null), date_of_birth: "1972-03-14", legal_sex: "F" });
    await screen.findByText(/Editing the open visit V-55/);
    const text = screen.getByTestId("patient-banner-details").textContent;
    expect(text).toContain("DOB 03/14/1972");
    expect(text).toMatch(/\d+ y/);
    expect(text).toContain("F");
  });

  test("a step with its key details entered shows a check", async () => {
    open({ ...sofia(null), date_of_birth: "1972-03-14", legal_sex: "F", phone_number: "3015550142" });
    await screen.findByText(/Editing the open visit V-55/);
    expect(tab("Patient Identity")).toHaveAttribute("title", "Key details entered");
    expect(tab("Emergency Contact")).not.toHaveAttribute("title");
  });
});
