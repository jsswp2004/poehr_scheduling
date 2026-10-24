import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock("../../config/api", () => ({ API_BASE_URL: "http://api.test" }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({ getAccessToken: () => "tok" }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../../components/CalendarView", () => ({ __esModule: true, default: () => <div data-testid="calendar-view" /> }), { virtual: true });
jest.mock("../../components/AnnouncementDisplay", () => ({ __esModule: true, default: () => <div data-testid="announcements">Clinic closed Nov 27</div> }), { virtual: true });
// react-select is a third-party widget; a native select keeps these tests about our page.
jest.mock("react-select", () => ({
  __esModule: true,
  default: (props) => (
    <select
      aria-label="Doctor"
      value={props.value ? String(props.value.value) : ""}
      onChange={(e) => props.onChange(props.options.find((o) => String(o.value) === e.target.value) || null)}
    >
      <option value="">--</option>
      {props.options.map((o) => (
        <option key={o.value} value={String(o.value)}>{o.label}</option>
      ))}
    </select>
  ),
}));

import axios from "axios";
import { toast } from "react-toastify";
import DashboardPage from "../DashboardPage";

const patient = {
  id: 5, first_name: "Demo", last_name: "Patient", email: "demo@example.com", role: "patient",
  phone_number: "301-555-0142", sms_consent: true, sms_consent_date: "2026-10-01T12:00:00Z",
};
const doctors = [{ id: 8, first_name: "Jeffrey", last_name: "Lee" }];
const day = 86400000;
const future = (n, hour = 9) => { const d = new Date(Date.now() + n * day); d.setHours(hour, 30, 0, 0); return d.toISOString(); };
const appts = [
  { id: 1, title: "Annual physical", appointment_datetime: future(3), status: "scheduled", provider: 8, description: "", duration_minutes: 30 },
  { id: 2, title: "Old visit", appointment_datetime: future(-10), status: "completed", provider: 8 },
  { id: 3, title: "Follow-up", appointment_datetime: future(7), status: "pending", provider: 8, description: "", duration_minutes: 30 },
];

let user, slots;
const serve = () =>
  axios.get.mockImplementation(async (url) => {
    if (url.endsWith("/api/users/doctors/")) return { data: doctors };
    if (url.endsWith("/api/appointments/")) return { data: appts };
    if (url.endsWith("/api/users/me/")) return { data: user };
    if (url.endsWith("/organization-admin-info/")) return { data: { admin_email: "admin@clinic.org", admin_phone: "+13015550100", admin_name: "Admin" } };
    if (url.includes("/available-dates/")) return { data: slots };
    return { data: {} };
  });

const open = async () => {
  render(<DashboardPage />);
  await screen.findByText("Your details");
};

beforeEach(() => {
  jest.clearAllMocks();
  user = { ...patient };
  slots = [new Date(2030, 0, 15, 9, 30).toISOString(), new Date(2030, 0, 15, 10, 15).toISOString(), new Date(2030, 0, 16, 14, 0).toISOString()];
  serve();
  axios.patch.mockImplementation(async (url, data) => ({ data: { ...user, ...data } }));
  axios.post.mockResolvedValue({ data: {} });
  axios.delete.mockResolvedValue({ data: {} });
  axios.put.mockResolvedValue({ data: {} });
  window.confirm = jest.fn(() => true);
  jest.spyOn(console, "log").mockImplementation(() => {});
});

test("one title, the tabs, details and announcements", async () => {
  await open();
  expect(screen.getByRole("heading", { name: "Patient Portal" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "My Information" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Manage Appointments" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Message my Provider" })).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Calendar" })).toBeNull();
  expect(screen.getByText("demo@example.com")).toBeInTheDocument();
  expect(screen.getByText("301-555-0142")).toBeInTheDocument();
  expect(screen.getByTestId("announcements")).toBeInTheDocument();
});

test("staff see the Calendar tab and no SMS consent card", async () => {
  user = { ...patient, role: "admin" };
  await open();
  expect(screen.queryByText("Text message reminders")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Calendar" }));
  expect(await screen.findByTestId("calendar-view")).toBeInTheDocument();
});

test("phone: Edit, change, Save sends the new number", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Edit phone" }));
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "301-555-9999" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith("http://api.test/api/users/me/", { phone_number: "301-555-9999" }, expect.any(Object)));
  expect(toast.success).toHaveBeenCalledWith("Phone number updated successfully!");
});

test("SMS consent: the full wording and date show, and the switch is locked until Update Preferences", async () => {
  await open();
  expect(screen.getByText(/you consent to receive automated appointment reminders/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Privacy Policy and Terms" })).toHaveAttribute("href", "https://powerhealthcareit.com/terms");
  expect(screen.getByText(/Consented on/)).toBeInTheDocument();
  const sw = screen.getByRole("checkbox", { name: "Text message reminders" });
  expect(sw).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Update Preferences" }));
  expect(sw).toBeEnabled();
  fireEvent.click(sw);
  fireEvent.click(screen.getByRole("button", { name: "Save Preferences" }));
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith("http://api.test/api/users/me/", { sms_consent: false }, expect.any(Object)));
});

test("turning consent on without a phone number asks for one", async () => {
  user = { ...patient, phone_number: "", sms_consent: false, sms_consent_date: null };
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Update Preferences" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Text message reminders" }));
  expect(await screen.findByText(/A phone number is required to receive SMS/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save Preferences" })).toBeDisabled();
});

test("password: the button stays off until the form is valid, then posts", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
  const update = screen.getByRole("button", { name: "Update password" });
  expect(update).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Current Password/), { target: { value: "oldpass123" } });
  fireEvent.change(screen.getByLabelText(/^New Password/), { target: { value: "newpass1234" } });
  fireEvent.change(screen.getByLabelText(/Confirm New Password/), { target: { value: "different" } });
  expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
  expect(update).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Confirm New Password/), { target: { value: "newpass1234" } });
  expect(update).toBeEnabled();
  fireEvent.click(update);
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith("http://api.test/api/users/change-password/",
    { current_password: "oldpass123", new_password: "newpass1234", confirm_password: "newpass1234" }, expect.any(Object)));
});

const openManage = async () => {
  await open();
  fireEvent.click(screen.getByRole("tab", { name: "Manage Appointments" }));
  await screen.findByText("Annual physical");
};

test("appointments: only upcoming ones, with status and doctor", async () => {
  await openManage();
  expect(screen.getByText("Follow-up")).toBeInTheDocument();
  expect(screen.queryByText("Old visit")).toBeNull();
  expect(screen.getByText("Scheduled")).toBeInTheDocument();
  expect(screen.getByText("Pending")).toBeInTheDocument();
  expect(screen.getAllByText(/Dr\. Jeffrey Lee/).length).toBeGreaterThan(0);
});

test("the row menu deletes after confirming", async () => {
  await openManage();
  fireEvent.click(screen.getByRole("button", { name: "Actions for Annual physical" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  expect(window.confirm).toHaveBeenCalled();
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("http://api.test/api/appointments/1/", expect.any(Object)));
  await waitFor(() => expect(screen.queryByText("Annual physical")).toBeNull());
});

test("the row menu Edit loads the appointment into the form", async () => {
  await openManage();
  fireEvent.click(screen.getByRole("button", { name: "Actions for Follow-up" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
  expect(await screen.findByRole("heading", { name: "Edit appointment" })).toBeInTheDocument();
  expect(screen.getByLabelText(/Title/)).toHaveValue("Follow-up");
  expect(screen.getByRole("button", { name: "Update Appointment" })).toBeInTheDocument();
});

test("pick a doctor, pick a time by day, and request the appointment", async () => {
  await openManage();
  fireEvent.click(screen.getByRole("button", { name: "Clear Form" }));
  fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Check-up" } });
  fireEvent.change(screen.getByLabelText("Doctor"), { target: { value: "8" } });
  expect(await screen.findByText("Available times for Dr. Jeffrey Lee")).toBeInTheDocument();
  expect(await screen.findByText(/Tue, Jan 15|Mon, Jan 15|Sun, Jan 15|Wed, Jan 15|Thu, Jan 15|Fri, Jan 15|Sat, Jan 15/)).toBeInTheDocument();
  fireEvent.click(await screen.findByText(/^9:30\sAM$/));
  expect(screen.getByLabelText(/Date & Time/)).toHaveValue("2030-01-15T09:30");
  fireEvent.click(screen.getByRole("button", { name: "Request Appointment" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith("http://api.test/api/appointments/",
    expect.objectContaining({ title: "Check-up", provider: 8, patient: 5 }), expect.any(Object)));
});

test("a doctor with no open times says so", async () => {
  slots = [];
  await openManage();
  fireEvent.change(screen.getByLabelText("Doctor"), { target: { value: "8" } });
  expect(await screen.findByText("No available slots")).toBeInTheDocument();
});

test("no upcoming appointments says what to do", async () => {
  appts.length = 0;
  await open();
  fireEvent.click(screen.getByRole("tab", { name: "Manage Appointments" }));
  expect(await screen.findByText(/No upcoming appointments yet/)).toBeInTheDocument();
  appts.push({ id: 1, title: "Annual physical", appointment_datetime: future(3), status: "scheduled", provider: 8, description: "", duration_minutes: 30 });
});

test("email: prefilled recipient, send posts the form", async () => {
  await open();
  fireEvent.click(screen.getByRole("tab", { name: "Message my Provider" }));
  await waitFor(() => expect(screen.getByLabelText("To")).toHaveValue("admin@clinic.org"));
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Question" } });
  fireEvent.click(screen.getByRole("button", { name: "Send Email" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith("http://api.test/api/messages/send-email/", expect.any(FormData), expect.any(Object)));
  expect(await screen.findByText(/Your email has been sent successfully/)).toBeInTheDocument();
});

test("text message: sends to the admin phone with the patient's name", async () => {
  await open();
  fireEvent.click(screen.getByRole("tab", { name: "Message my Provider" }));
  await waitFor(() => expect(screen.getByLabelText(/Admin\/Provider Phone Number/)).toHaveValue("+13015550100"));
  fireEvent.change(screen.getByLabelText("Message", { selector: "textarea" , exact: false }) , { target: { value: "hello" } });
  fireEvent.click(screen.getByRole("button", { name: "Send Text Message" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith("http://api.test/api/messages/send-sms/",
    { phone: "+13015550100", message: expect.stringContaining("A message from Demo Patient:") }, expect.any(Object)));
});
