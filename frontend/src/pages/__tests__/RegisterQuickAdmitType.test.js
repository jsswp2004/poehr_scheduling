import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn() }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }), { virtual: true });
jest.mock("react-select", () => () => null, { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "registrar" }) }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "tok" }), { virtual: true });
jest.mock("../../config/api", () => ({ API_BASE_URL: "http://api" }), { virtual: true });
jest.mock("../../components/registration/FullRegistrationForm", () => () => null, { virtual: true });
jest.mock("../../components/registration/PatientsRegisterTable", () => () => null, { virtual: true });

import axios from "axios";
import { toast } from "react-toastify";
import RegisterPage from "../RegisterPage";

const fill = () => {
  fireEvent.change(screen.getByPlaceholderText("First Name"), { target: { value: "Ann" } });
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: "Lee" } });
  fireEvent.change(screen.getByLabelText(/Username/), { target: { value: "annlee" } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "ann@example.com" } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "secret1" } });
};

const pickType = (name) => {
  fireEvent.mouseDown(within(screen.getByTestId("quick-admit-type").closest(".MuiInputBase-root")).getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name }));
};

const show = (props = { adminMode: true }) =>
  render(
    <MemoryRouter>
      <RegisterPage {...props} />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockImplementation(async (url) => {
    if (url.includes("/api/users/patients/")) return { data: { results: [{ id: 55, username: "annlee" }] } };
    return { data: [] };
  });
  axios.post.mockResolvedValue({ data: {} });
});

test("staff see the Admit Type with all three types, defaulting to register only", async () => {
  show();
  expect(await screen.findByTestId("quick-admit-type")).toBeInTheDocument();
  fireEvent.mouseDown(within(screen.getByTestId("quick-admit-type").closest(".MuiInputBase-root")).getByRole("combobox"));
  for (const name of ["Not specified (register only)", "Scheduled (Ambulatory)", "Emergency", "Direct admit (Inpatient)"]) {
    expect(screen.getByRole("option", { name })).toBeInTheDocument();
  }
});

test("the public sign-up form does not show it", async () => {
  show({ adminMode: false });
  await screen.findByPlaceholderText("First Name");
  expect(screen.queryByTestId("quick-admit-type")).toBeNull();
});

test("Emergency registers the patient and starts an emergency visit", async () => {
  show();
  await screen.findByTestId("quick-admit-type");
  fill();
  pickType("Emergency");
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Emergency visit started"));
  const registerCall = axios.post.mock.calls.find((c) => c[0].endsWith("/api/auth/register/"));
  expect(registerCall[1]).not.toHaveProperty("admission_type");
  const visitCall = axios.post.mock.calls.find((c) => c[0].endsWith("/api/users/registrations/"));
  expect(visitCall[1]).toEqual({ patient: 55, admission_type: "emergency" });
});

test("Direct admit starts a direct visit", async () => {
  show();
  await screen.findByTestId("quick-admit-type");
  fill();
  pickType("Direct admit (Inpatient)");
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Direct admit (Inpatient) visit started"));
  expect(axios.post.mock.calls.find((c) => c[0].endsWith("/registrations/"))[1].admission_type).toBe("direct");
});

test("with no Admit Type only the patient is registered, as before", async () => {
  show();
  await screen.findByTestId("quick-admit-type");
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Registration successful!"));
  expect(axios.post.mock.calls.some((c) => c[0].endsWith("/registrations/"))).toBe(false);
});

test("if the visit cannot be started the patient is still registered and staff are told", async () => {
  axios.post.mockImplementation(async (url) => {
    if (url.endsWith("/registrations/")) throw { response: { data: { detail: "Not allowed." } } };
    return { data: {} };
  });
  show();
  await screen.findByTestId("quick-admit-type");
  fill();
  pickType("Emergency");
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
  await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("Patient registered, but the visit could not be started. Not allowed.")));
});

test("the form is cleared afterwards, including the Admit Type", async () => {
  show();
  await screen.findByTestId("quick-admit-type");
  fill();
  pickType("Emergency");
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Emergency visit started"));
  await waitFor(() => expect(screen.getByPlaceholderText("First Name")).toHaveValue(""));
  expect(screen.getByTestId("quick-admit-type")).toHaveValue("");
});
