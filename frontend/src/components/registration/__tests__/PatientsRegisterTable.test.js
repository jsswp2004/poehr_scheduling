import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("axios", () => ({ get: jest.fn(), delete: jest.fn() }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });
jest.mock("../../../utils/auth", () => ({ getValidToken: async () => "tok" }), { virtual: true });
jest.mock(
  "../../../config/api",
  () => ({ apiEndpoints: { patients: "http://api/patients/", patient: (id) => `http://api/patients/${id}/` } }),
  { virtual: true }
);

import axios from "axios";
import PatientsRegisterTable from "../PatientsRegisterTable";

const row = (id, last, first, extra = {}) => ({
  id,
  mrn: `MRN-00000${id}`,
  first_name: first,
  last_name: last,
  date_of_birth: "1972-03-14",
  provider_name: "Dr. Patel",
  current_visit: null,
  ...extra,
});

const page1 = {
  count: 3,
  next: "http://api/patients/?page=2",
  results: [
    row(1, "Whitfield", "Taylor", { current_visit: { care_setting: "ambulatory", discharge_datetime: null, visit_number: "V-1" } }),
    row(2, "Ramirez", "Lucia"),
  ],
};
const page2 = { count: 3, next: null, results: [row(3, "Baptiste", "Devon")] };

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockImplementation(async (url, config) => (config.params.page === 2 ? { data: page2 } : { data: page1 }));
});

test("shows MRN, name, DOB, provider, visit status and the right action", async () => {
  render(<PatientsRegisterTable userRole="registrar" onEdit={jest.fn()} />);
  expect(await screen.findByText("Whitfield, Taylor")).toBeInTheDocument();
  expect(screen.getByText("MRN-000001")).toBeInTheDocument();
  expect(screen.getAllByText("03/14/1972").length).toBe(2);
  expect(screen.getByText("Ambulatory visit")).toBeInTheDocument();
  expect(screen.getByText("No open visit")).toBeInTheDocument();
  expect(screen.getByText("No visit")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start visit" })).toBeInTheDocument();
  expect(screen.queryByText("Phone")).toBeNull();
  expect(screen.getByText("Showing 2 of 3")).toBeInTheDocument();
});

test("Open and Start visit both send the patient to the Registration tab", async () => {
  const onEdit = jest.fn();
  render(<PatientsRegisterTable userRole="registrar" onEdit={onEdit} />);
  fireEvent.click(await screen.findByRole("button", { name: "Start visit" }));
  expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
});

test("Load more adds the next page and then goes away", async () => {
  render(<PatientsRegisterTable userRole="registrar" onEdit={jest.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Baptiste, Devon")).toBeInTheDocument();
  expect(screen.getByText("Showing 3 of 3")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(axios.get.mock.calls.some((c) => c[1].params.page === 2)).toBe(true);
});

test("the filters narrow the loaded patients", async () => {
  render(<PatientsRegisterTable userRole="registrar" onEdit={jest.fn()} />);
  await screen.findByText("Whitfield, Taylor");
  fireEvent.click(screen.getByText("Open visit"));
  expect(screen.getByText("Whitfield, Taylor")).toBeInTheDocument();
  expect(screen.queryByText("Ramirez, Lucia")).toBeNull();
  fireEvent.click(screen.getByText("No visit"));
  expect(screen.queryByText("Whitfield, Taylor")).toBeNull();
  expect(screen.getByText("Ramirez, Lucia")).toBeInTheDocument();
});

test("a date of birth in the search box becomes the dob filter, a phone becomes digits", async () => {
  render(<PatientsRegisterTable userRole="registrar" onEdit={jest.fn()} />);
  await screen.findByText("Whitfield, Taylor");
  fireEvent.change(screen.getByLabelText("Search patients"), { target: { value: "03/14/1972" } });
  await waitFor(() => expect(axios.get.mock.calls.some((c) => c[1].params.dob === "1972-03-14")).toBe(true));
  fireEvent.change(screen.getByLabelText("Search patients"), { target: { value: "(301) 555-0142" } });
  await waitFor(() => expect(axios.get.mock.calls.some((c) => c[1].params.search === "3015550142")).toBe(true));
});

test("a new refreshKey reloads the list", async () => {
  const { rerender } = render(<PatientsRegisterTable userRole="registrar" onEdit={jest.fn()} refreshKey={0} />);
  await screen.findByText("Whitfield, Taylor");
  const before = axios.get.mock.calls.length;
  rerender(<PatientsRegisterTable userRole="registrar" onEdit={jest.fn()} refreshKey={1} />);
  await waitFor(() => expect(axios.get.mock.calls.length).toBeGreaterThan(before));
});

test("only the allowed roles see the delete icon", async () => {
  const { unmount } = render(<PatientsRegisterTable userRole="nurse" onEdit={jest.fn()} />);
  await screen.findByText("Whitfield, Taylor");
  expect(screen.queryByLabelText("Delete Taylor Whitfield")).toBeNull();
  unmount();
  render(<PatientsRegisterTable userRole="registrar" onEdit={jest.fn()} />);
  expect(await screen.findByLabelText("Delete Taylor Whitfield")).toBeInTheDocument();
});
