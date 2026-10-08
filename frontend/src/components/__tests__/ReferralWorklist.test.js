import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      referrals: "/referrals/",
      referralQueues: "/referrals/queues/",
      referral: (id) => `/referrals/${id}/`,
      referralAction: (id) => `/referrals/${id}/action/`,
      referralMeta: "/referral-meta/",
      referralDestinations: "/referral-destinations/",
      patients: "/patients/",
      icd10Search: "/icd/",
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import { toast } from "../SimpleToast";
import ReferralWorklist from "../referrals/ReferralWorklist";

const META = {
  specialties: ["Cardiology", "Neurology"],
  urgencies: [{ value: "routine", label: "Routine" }, { value: "urgent", label: "Urgent" }, { value: "emergent", label: "Emergent" }],
  queues: [
    { value: "needs_action", label: "Needs action" },
    { value: "overdue", label: "Overdue" },
    { value: "all", label: "All" },
    { value: "mine", label: "Assigned to me" },
  ],
  action_labels: { sign_send: "Sign and send", schedule: "Mark scheduled", cancel: "Cancel", note: "Add note", report: "Report received" },
  staff: [{ id: 7, name: "Nina Nurse", role: "nurse" }],
  doctors: [{ id: 5, name: "Dr Who" }],
  can_manage: false,
};

const REF = (over = {}) => ({
  id: 11,
  patient: 3,
  patient_name: "Ann Lee",
  referring_provider: 5,
  referring_provider_name: "Dr Who",
  destination: 1,
  destination_name: "Heart Group",
  specialty: "Cardiology",
  urgency: "urgent",
  urgency_label: "Urgent",
  reason: "Chest pain on exertion",
  clinical_question: "",
  diagnosis_code: "",
  diagnosis_text: "",
  status: "draft",
  status_label: "Draft",
  status_note: "",
  assigned_to: null,
  assigned_to_name: "",
  scheduled_for: null,
  schedule_due: null,
  report_due: null,
  overdue: false,
  overdue_reason: "",
  actions: ["cancel", "note"],
  events: [{ id: 1, type: "created", user: "Dr Who", at: "2026-10-01T10:00:00Z", detail: {} }],
  clinical_snapshot: {},
  ...over,
});

const COUNTS = { needs_action: 2, overdue: 1, all: 5, mine: 0 };
let list;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.values(toast).forEach((fn) => fn.mockReset());
  list = [REF()];
  api.get.mockImplementation((url, cfg) => {
    if (url === "/referral-meta/") return Promise.resolve({ data: META });
    if (url === "/referrals/queues/") return Promise.resolve({ data: { counts: COUNTS } });
    if (url === "/referrals/") return Promise.resolve({ data: { count: list.length, results: list } });
    if (url === "/referral-destinations/") return Promise.resolve({ data: [{ id: 1, name: "Heart Group", specialty: "Cardiology", kind: "external" }] });
    if (url === "/patients/") return Promise.resolve({ data: { results: [{ user_id: 3, first_name: "Ann", last_name: "Lee" }] } });
    const m = /^\/referrals\/(\d+)\/$/.exec(url);
    if (m) return Promise.resolve({ data: list.find((r) => String(r.id) === m[1]) });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
});

const ME = { role: "doctor", id: 5 };

test("worklist shows queue counts and the referral rows", async () => {
  render(<ReferralWorklist me={ME} />);
  await screen.findByTestId("referral-row-11");
  expect(await screen.findByTestId("referral-queue-needs_action")).toHaveTextContent("Needs action (2)");
  expect(screen.getByTestId("referral-queue-overdue")).toHaveTextContent("Overdue (1)");
  expect(screen.getByTestId("referral-row-11")).toHaveTextContent("Ann Lee");
  expect(screen.getByTestId("referral-row-11")).toHaveTextContent("Heart Group");
  // the first list request asks for the default queue
  const call = api.get.mock.calls.find((c) => c[0] === "/referrals/");
  expect(call[1].params.queue).toBe("needs_action");
});

test("a patient-scoped list asks only for that patient and defaults to All", async () => {
  render(<ReferralWorklist patient={{ id: 3, name: "Ann Lee" }} me={ME} />);
  await screen.findByTestId("referral-row-11");
  const call = api.get.mock.calls.find((c) => c[0] === "/referrals/");
  expect(call[1].params).toMatchObject({ patient: 3, queue: "all" });
  expect(screen.queryByText("Patient")).not.toBeInTheDocument();
});

test("an overdue referral is flagged in words", async () => {
  list = [REF({ status: "sent", status_label: "Sent", overdue: true, overdue_reason: "schedule", schedule_due: "2026-09-20T00:00:00Z" })];
  render(<ReferralWorklist me={ME} />);
  expect(await screen.findByTestId("referral-overdue-11")).toHaveTextContent(/Not scheduled by/);
});

test("changing a filter asks the server again", async () => {
  render(<ReferralWorklist me={ME} />);
  await screen.findByTestId("referral-row-11");
  fireEvent.click(screen.getByTestId("referral-queue-overdue"));
  await waitFor(() => {
    const calls = api.get.mock.calls.filter((c) => c[0] === "/referrals/");
    expect(calls[calls.length - 1][1].params.queue).toBe("overdue");
  });
});

test("opening a referral shows only the steps the server allows, and a step needing a reason asks for it", async () => {
  render(<ReferralWorklist me={ME} />);
  fireEvent.click(await screen.findByTestId("referral-row-11"));
  await screen.findByTestId("referral-detail");
  await screen.findByTestId("referral-action-cancel");
  expect(screen.queryByTestId("referral-action-sign_send")).not.toBeInTheDocument();
  expect(screen.getByTestId("referral-timeline")).toHaveTextContent("Draft created");

  fireEvent.click(screen.getByTestId("referral-action-cancel"));
  fireEvent.click(await screen.findByTestId("referral-action-confirm"));
  expect(await screen.findByTestId("referral-action-error")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();

  api.post.mockResolvedValue({ data: REF({ status: "cancelled", status_label: "Cancelled", actions: ["note"], status_note: "Duplicate" }) });
  fireEvent.change(screen.getByTestId("referral-action-text"), { target: { value: "Duplicate" } });
  fireEvent.click(screen.getByTestId("referral-action-confirm"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(api.post.mock.calls[0][0]).toBe("/referrals/11/action/");
  expect(api.post.mock.calls[0][1]).toEqual({ action: "cancel", note: "Duplicate" });
  await waitFor(() => expect(screen.getByTestId("referral-status")).toHaveTextContent("Cancelled"));
});

test("the physician sees Sign and send and it posts the action", async () => {
  list = [REF({ actions: ["sign_send", "cancel", "note"] })];
  render(<ReferralWorklist me={ME} />);
  fireEvent.click(await screen.findByTestId("referral-row-11"));
  fireEvent.click(await screen.findByTestId("referral-action-sign_send"));
  api.post.mockResolvedValue({
    data: REF({ status: "sent", status_label: "Sent", actions: ["schedule"], signed_at: "2026-10-02T10:00:00Z", signed_by_name: "Dr Who", clinical_snapshot: { allergies: [{ substance: "Penicillin", reaction: "Rash" }] } }),
  });
  fireEvent.click(await screen.findByTestId("referral-action-confirm"));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/referrals/11/action/", { action: "sign_send" }, expect.anything()));
  expect(await screen.findByTestId("referral-allergies")).toHaveTextContent("Penicillin (Rash)");
});

test("the server's refusal is shown in the step dialog", async () => {
  list = [REF({ actions: ["sign_send"] })];
  render(<ReferralWorklist me={ME} />);
  fireEvent.click(await screen.findByTestId("referral-row-11"));
  fireEvent.click(await screen.findByTestId("referral-action-sign_send"));
  api.post.mockRejectedValue({ response: { data: { detail: "Before sending, add the specialty." } } });
  fireEvent.click(await screen.findByTestId("referral-action-confirm"));
  expect(await screen.findByTestId("referral-action-error")).toHaveTextContent("Before sending, add the specialty.");
});

test("scheduling asks for a date and sends it", async () => {
  list = [REF({ status: "sent", status_label: "Sent", actions: ["schedule"] })];
  render(<ReferralWorklist me={ME} />);
  fireEvent.click(await screen.findByTestId("referral-row-11"));
  fireEvent.click(await screen.findByTestId("referral-action-schedule"));
  fireEvent.click(await screen.findByTestId("referral-action-confirm"));
  expect(await screen.findByTestId("referral-action-error")).toBeInTheDocument();
  fireEvent.change(screen.getByTestId("referral-action-when"), { target: { value: "2026-11-02T09:30" } });
  fireEvent.change(screen.getByTestId("referral-action-where"), { target: { value: "Suite 4" } });
  api.post.mockResolvedValue({ data: REF({ status: "scheduled", status_label: "Scheduled", actions: ["seen"] }) });
  fireEvent.click(screen.getByTestId("referral-action-confirm"));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const body = api.post.mock.calls[0][1];
  expect(body.action).toBe("schedule");
  expect(body.appointment_location).toBe("Suite 4");
  expect(new Date(body.scheduled_for).getTime()).toBe(new Date("2026-11-02T09:30").getTime());
});

test("a patient-scoped New referral validates, then creates a draft for that patient", async () => {
  render(<ReferralWorklist patient={{ id: 3, name: "Ann Lee" }} me={ME} />);
  await screen.findByTestId("referral-row-11");
  fireEvent.click(screen.getByTestId("referral-new"));
  fireEvent.click(await screen.findByTestId("referral-form-save"));
  expect(await screen.findByTestId("referral-form-error")).toHaveTextContent(/why the patient/i);

  fireEvent.change(screen.getByTestId("referral-reason"), { target: { value: "Murmur" } });
  fireEvent.change(screen.getByTestId("referral-destination-name"), { target: { value: "Valley Cardiology" } });
  fireEvent.mouseDown(within(screen.getByTestId("referral-form")).getAllByRole("combobox")[1]);
  fireEvent.click(await screen.findByRole("option", { name: "Cardiology" }));
  api.post.mockImplementation((url) => {
    if (url === "/referral-destinations/") return Promise.resolve({ data: { id: 9, name: "Valley Cardiology", specialty: "Cardiology" } });
    return Promise.resolve({ data: REF({ id: 12, status: "draft", reason: "Murmur" }) });
  });
  fireEvent.click(screen.getByTestId("referral-form-save"));
  await waitFor(() => expect(api.post.mock.calls.some((c) => c[0] === "/referrals/")).toBe(true));
  const created = api.post.mock.calls.find((c) => c[0] === "/referrals/")[1];
  expect(created).toMatchObject({ patient: 3, destination: 9, destination_name: "Valley Cardiology", specialty: "Cardiology", reason: "Murmur", referring_provider: 5 });
  const dir = api.post.mock.calls.find((c) => c[0] === "/referral-destinations/")[1];
  expect(dir).toMatchObject({ name: "Valley Cardiology", kind: "external" });
});

test("on the manager page New referral asks for the patient first", async () => {
  render(<ReferralWorklist me={ME} />);
  await screen.findByTestId("referral-row-11");
  fireEvent.click(screen.getByTestId("referral-new"));
  const input = await screen.findByTestId("referral-patient-search");
  expect(screen.getByTestId("referral-patient-continue")).toBeDisabled();
  fireEvent.change(input, { target: { value: "Ann" } });
  fireEvent.click(await screen.findByRole("option", { name: /Ann Lee/ }));
  fireEvent.click(screen.getByTestId("referral-patient-continue"));
  expect(await screen.findByTestId("referral-form")).toHaveTextContent("New referral — Ann Lee");
});

test("someone who may not use referrals sees a plain message", async () => {
  api.get.mockRejectedValue({ response: { status: 403, data: { detail: "Not allowed." } } });
  render(<ReferralWorklist me={{ role: "patient" }} />);
  expect(await screen.findByTestId("referrals-denied")).toBeInTheDocument();
});
