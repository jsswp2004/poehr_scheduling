import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      referralMeta: "/referral-meta/",
      referralDestinations: "/referral-destinations/",
      referralDestination: (id) => `/referral-destinations/${id}/`,
      referralSettings: "/referral-settings/",
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import ReferralSettings from "../referrals/ReferralSettings";

const META = (canManage) => ({ specialties: ["Cardiology", "Neurology"], doctors: [{ id: 5, name: "Dr Who" }], can_manage: canManage });
const DEST = { id: 1, name: "Heart Group", specialty: "Cardiology", kind: "external", kind_label: "Outside practice", phone: "555-0101", fax: "", is_active: true };

function serve(canManage = true) {
  api.get.mockImplementation((url) => {
    if (url === "/referral-meta/") return Promise.resolve({ data: META(canManage) });
    if (url === "/referral-destinations/") return Promise.resolve({ data: [DEST] });
    if (url === "/referral-settings/") return Promise.resolve({ data: { schedule_days: { routine: 14, urgent: 3, emergent: 1 }, report_days: 14, can_edit: canManage } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.values(toast).forEach((fn) => fn.mockReset());
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
});

test("an administrator sees the directory and the timers with their current values", async () => {
  serve(true);
  render(<ReferralSettings />);
  expect(await screen.findByTestId("destination-row-1")).toHaveTextContent("Heart Group");
  expect(screen.getByTestId("destination-add")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId("timer-urgent")).toHaveValue(3));
  expect(screen.getByTestId("timer-report")).toHaveValue(14);
});

test("saving the timers sends whole numbers and says they apply from now on", async () => {
  serve(true);
  render(<ReferralSettings />);
  await waitFor(() => expect(screen.getByTestId("timer-urgent")).toHaveValue(3));
  fireEvent.change(screen.getByTestId("timer-urgent"), { target: { value: "2" } });
  fireEvent.change(screen.getByTestId("timer-report"), { target: { value: "21" } });
  fireEvent.click(screen.getByTestId("timers-save"));
  await waitFor(() => expect(api.put).toHaveBeenCalled());
  expect(api.put.mock.calls[0][0]).toBe("/referral-settings/");
  expect(api.put.mock.calls[0][1]).toEqual({ schedule_days: { routine: 14, urgent: 2, emergent: 1 }, report_days: 21 });
  expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/from now on/));
});

test("a timer that is not a whole number of days is refused before it is sent", async () => {
  serve(true);
  render(<ReferralSettings />);
  await waitFor(() => expect(screen.getByTestId("timer-urgent")).toHaveValue(3));
  fireEvent.change(screen.getByTestId("timer-routine"), { target: { value: "0" } });
  fireEvent.click(screen.getByTestId("timers-save"));
  expect(await screen.findByTestId("timers-error")).toHaveTextContent(/1 to 365/);
  expect(api.put).not.toHaveBeenCalled();
});

test("adding a destination posts it and reloads the directory", async () => {
  serve(true);
  render(<ReferralSettings />);
  fireEvent.click(await screen.findByTestId("destination-add"));
  fireEvent.click(await screen.findByTestId("destination-save"));
  expect(await screen.findByTestId("destination-error")).toHaveTextContent(/name/i);
  fireEvent.change(screen.getByTestId("destination-name"), { target: { value: "Brain Clinic" } });
  fireEvent.change(screen.getByTestId("destination-npi"), { target: { value: "1234567890" } });
  fireEvent.click(screen.getByTestId("destination-save"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][0]).toBe("/referral-destinations/");
  expect(api.post.mock.calls[0][1]).toMatchObject({ name: "Brain Clinic", npi: "1234567890", kind: "external", provider: null });
});

test("editing a destination patches it", async () => {
  serve(true);
  render(<ReferralSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit Heart Group" }));
  fireEvent.change(await screen.findByTestId("destination-name"), { target: { value: "Heart Group East" } });
  fireEvent.click(screen.getByTestId("destination-save"));
  await waitFor(() => expect(api.patch).toHaveBeenCalled());
  expect(api.patch.mock.calls[0][0]).toBe("/referral-destinations/1/");
  expect(api.patch.mock.calls[0][1].name).toBe("Heart Group East");
});

test("a server message on a duplicate destination is shown", async () => {
  serve(true);
  api.post.mockRejectedValue({ response: { data: { detail: "That destination is already in the directory." } } });
  render(<ReferralSettings />);
  fireEvent.click(await screen.findByTestId("destination-add"));
  fireEvent.change(await screen.findByTestId("destination-name"), { target: { value: "Heart Group" } });
  fireEvent.click(screen.getByTestId("destination-save"));
  expect(await screen.findByTestId("destination-error")).toHaveTextContent("already in the directory");
});

test("someone who cannot manage sees the directory read-only and the timers locked", async () => {
  serve(false);
  render(<ReferralSettings />);
  await screen.findByTestId("destination-row-1");
  expect(screen.queryByTestId("destination-add")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit Heart Group" })).not.toBeInTheDocument();
  expect(screen.queryByTestId("timers-save")).not.toBeInTheDocument();
  expect(screen.getByTestId("timer-routine")).toBeDisabled();
});
