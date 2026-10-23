import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }), { virtual: true });
jest.mock("react-select", () => () => null, { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "registrar" }) }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "tok" }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({ API_BASE_URL: "http://api", apiEndpoints: { patients: "http://api/api/users/patients/", patient: (id) => `http://api/api/users/patients/${id}/` } }),
  { virtual: true }
);
jest.mock("../../components/registration/FullRegistrationForm", () => () => null, { virtual: true });
jest.mock("../../components/registration/PatientsRegisterTable", () => () => null, { virtual: true });

import axios from "axios";
import { toast } from "react-toastify";
import RegisterPage from "../RegisterPage";

const pickSex = (name) => {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: /Sex at birth/ }));
  fireEvent.click(screen.getByRole("option", { name }));
};

const fill = () => {
  fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: "Ann" } });
  fireEvent.change(screen.getByLabelText(/^Last name/), { target: { value: "Lee" } });
  fireEvent.change(screen.getByLabelText(/^Date of birth/), { target: { value: "03141972" } });
  pickSex("Female");
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "Ann@Example.com" } });
};

const show = (props = { adminMode: true }) =>
  render(
    <MemoryRouter>
      <RegisterPage {...props} />
    </MemoryRouter>
  );

const registerCall = () => axios.post.mock.calls.find((c) => c[0].endsWith("/api/auth/register/"));
const visitCall = () => axios.post.mock.calls.find((c) => c[0].endsWith("/api/users/registrations/"));

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockImplementation(async (url, config) => {
    if (url.includes("/api/users/patients/")) {
      if (config?.params?.dob) return { data: { results: [] } };
      return { data: { results: [{ id: 55, user_id: 9, username: "annlee", first_name: "Ann", last_name: "Lee" }] } };
    }
    return { data: [] };
  });
  axios.post.mockResolvedValue({ data: { id: 9 } });
  axios.patch.mockResolvedValue({ data: {} });
});

describe("staff Quick Register", () => {
  test("offers the three arrivals, Scheduled chosen first", async () => {
    show();
    for (const name of ["Scheduled", "Emergency", "Direct admit"]) {
      expect(await screen.findByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Scheduled" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Register and start visit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register only" })).toBeInTheDocument();
  });

  test("Emergency registers the patient, saves DOB and sex, and starts an emergency visit", async () => {
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Emergency" }));
    fireEvent.click(screen.getByRole("button", { name: "Register and start visit" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Emergency visit started"));
    const [, payload] = registerCall();
    expect(payload).not.toHaveProperty("admission_type");
    expect(payload.email).toBe("ann@example.com");
    expect(payload.username).toMatch(/^alee\d{4}$/);
    expect(payload.password).toHaveLength(16);
    expect(payload.role).toBe("patient");
    const [patchUrl, form] = axios.patch.mock.calls[0];
    expect(patchUrl).toBe("http://api/api/users/patients/by-user/9/edit/");
    expect(form.get("date_of_birth")).toBe("1972-03-14");
    expect(form.get("legal_sex")).toBe("F");
    expect(visitCall()[1]).toEqual({ patient: 55, admission_type: "emergency" });
  });

  test("Direct admit starts a direct visit", async () => {
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Direct admit" }));
    fireEvent.click(screen.getByRole("button", { name: "Register and start visit" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Direct admit (Inpatient) visit started"));
    expect(visitCall()[1].admission_type).toBe("direct");
  });

  test("Register only does not start a visit", async () => {
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Register only" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Registration successful!"));
    expect(visitCall()).toBeUndefined();
  });

  test("if the visit cannot be started the patient is still registered and staff are told", async () => {
    axios.post.mockImplementation(async (url) => {
      if (url.endsWith("/registrations/")) throw { response: { data: { detail: "Not allowed." } } };
      return { data: { id: 9 } };
    });
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Register and start visit" }));
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("Patient registered, but the visit could not be started. Not allowed."))
    );
  });

  test("if DOB and sex cannot be saved the patient is still registered and staff are told", async () => {
    axios.patch.mockRejectedValue(new Error("boom"));
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Register only" }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("date of birth and sex were not saved")));
    expect(toast.success).toHaveBeenCalledWith("Registration successful!");
  });

  test("the form is cleared afterwards but the arrival choice stays", async () => {
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Emergency" }));
    fireEvent.click(screen.getByRole("button", { name: "Register and start visit" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Emergency visit started"));
    await waitFor(() => expect(screen.getByLabelText(/^First name/)).toHaveValue(""));
    expect(screen.getByLabelText(/^Date of birth/)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Emergency" })).toHaveAttribute("aria-pressed", "true");
  });

  test("problems show under the fields, not as toasts, and nothing is sent", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Register only" }));
    expect(await screen.findByText("Enter the first name.")).toBeInTheDocument();
    expect(screen.getByText("Enter the last name.")).toBeInTheDocument();
    expect(screen.getByText("Enter the date of birth.")).toBeInTheDocument();
    expect(screen.getByText("Choose a sex.")).toBeInTheDocument();
    expect(screen.getByText("Enter an email address.")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("an error from the server is shown under the right field", async () => {
    axios.post.mockRejectedValue({ response: { data: { email: ["A user with that email already exists."] } } });
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Register only" }));
    expect(await screen.findByText("A user with that email already exists.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^First name/)).toHaveValue("Ann");
  });

  test("a generated username that is already taken is retried once", async () => {
    let calls = 0;
    axios.post.mockImplementation(async (url) => {
      if (url.endsWith("/api/auth/register/")) {
        calls += 1;
        if (calls === 1) throw { response: { data: { username: ["taken"] } } };
      }
      return { data: { id: 9 } };
    });
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Register only" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Registration successful!"));
    expect(calls).toBe(2);
  });

  test("portal login is off by default and, when on, sends the typed username and password", async () => {
    show();
    expect(screen.queryByLabelText(/^Username/)).toBeNull();
    fill();
    fireEvent.click(screen.getByLabelText("Patient portal login"));
    fireEvent.click(screen.getByRole("button", { name: "Register only" }));
    expect(await screen.findByText("Username must be at least 3 characters.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: "annlee" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "secret1" } });
    fireEvent.click(screen.getByRole("button", { name: "Register only" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Registration successful!"));
    expect(registerCall()[1]).toMatchObject({ username: "annlee", password: "secret1" });
  });

  test("a possible duplicate is shown and must be reviewed before registering", async () => {
    axios.get.mockImplementation(async (url, config) => {
      if (url.includes("/api/users/patients/") && config?.params?.dob) {
        return { data: { results: [{ id: 7, first_name: "Ann", last_name: "Lee", date_of_birth: "1972-03-14", mrn: "MRN-000007" }] } };
      }
      return { data: { results: [] } };
    });
    show();
    fill();
    expect(await screen.findByTestId("possible-matches")).toHaveTextContent("1 possible match");
    expect(screen.getByTestId("possible-matches")).toHaveTextContent("MRN-000007");
    fireEvent.click(screen.getByRole("button", { name: "Register only" }));
    expect(await screen.findByText(/Review the possible matches first/)).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Not the same person" }));
    await waitFor(() => expect(screen.queryByTestId("possible-matches")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Register only" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Registration successful!"));
  });

  test("the calendar's modal registers only and hands the patient back", async () => {
    const onPatientRegistered = jest.fn();
    show({ adminMode: true, modalMode: true, onPatientRegistered });
    expect(screen.queryByRole("button", { name: "Emergency" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Register and start visit" })).toBeNull();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    await waitFor(() => expect(onPatientRegistered).toHaveBeenCalledWith(expect.objectContaining({ id: 55 })));
    expect(visitCall()).toBeUndefined();
  });
});

describe("public sign-up", () => {
  test("is its own card, with no staff arrival choice", async () => {
    show({ adminMode: false });
    expect(await screen.findByText("Create your account")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Emergency" })).toBeNull();
    expect(screen.queryByLabelText(/^Username/)).toBeNull();
  });

  test("checks the form first and shows problems under the fields", async () => {
    show({ adminMode: false });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Enter your first name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("uses the email as the username", async () => {
    show({ adminMode: false });
    fireEvent.change(screen.getByLabelText(/^Clinic name/), { target: { value: "Riverside" } });
    fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: "Ann" } });
    fireEvent.change(screen.getByLabelText(/^Last name/), { target: { value: "Lee" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "Ann@Example.com" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "secret1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Registration successful!"));
    expect(registerCall()[1]).toMatchObject({ username: "ann@example.com", email: "ann@example.com", role: "patient" });
  });

  test("an email that already has an account says so on the email field", async () => {
    axios.post.mockRejectedValue({ response: { data: { username: ["A user with that username already exists."] } } });
    show({ adminMode: false });
    fireEvent.change(screen.getByLabelText(/^Clinic name/), { target: { value: "Riverside" } });
    fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: "Ann" } });
    fireEvent.change(screen.getByLabelText(/^Last name/), { target: { value: "Lee" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "ann@example.com" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "secret1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/An account with this email already exists/)).toBeInTheDocument();
  });

  test("choosing No tells the person someone will call", async () => {
    show({ adminMode: false });
    fireEvent.click(screen.getByRole("button", { name: "No, I need one" }));
    expect(screen.getByText(/A member of our team will call you within one business day/)).toBeInTheDocument();
  });
});
