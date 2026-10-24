import { render, screen, waitFor, fireEvent, within, act } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      securePeople: "/sm/people/",
      secureThreads: "/sm/threads/",
      secureThread: (id) => `/sm/threads/${id}/`,
      secureMessages: (id) => `/sm/threads/${id}/messages/`,
      secureRead: (id) => `/sm/threads/${id}/read/`,
      secureMembers: (id) => `/sm/threads/${id}/members/`,
      secureMember: (id, u) => `/sm/threads/${id}/members/${u}/`,
      secureRetract: (id) => `/sm/messages/${id}/retract/`,
      secureAttachment: (id) => `/sm/attachments/${id}/`,
      secureUnread: "/sm/unread-count/",
      secureAudit: "/sm/audit/",
      secureAuditThread: (id) => `/sm/audit/threads/${id}/`,
    },
    WS_BASE_URL: "ws://x",
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({ getAccessToken: () => null }), { virtual: true });
jest.mock("../../utils/secureLive", () => ({ subscribe: () => () => {}, onStatus: () => () => {}, socketStatus: () => "closed" }));

import { api } from "../../api/client";
import SecureMessagesAuditPage from "../../pages/SecureMessagesAuditPage";

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
});

const EV = (id, extra = {}) => ({ id, at: "2026-10-09T12:00:00Z", user: "Dr. Lee", user_id: 2, action: "send", thread: 5, message: id, patient: null, patient_id: null, detail: "", ...extra });

function serve(pages) {
  let call = 0;
  api.get.mockImplementation(async (url, cfg) => {
    if (url === "/sm/people/") return { data: { people: [{ id: 2, name: "Dr. Lee", role: "doctor" }] } };
    if (url === "/sm/audit/") return { data: pages[Math.min(call++, pages.length - 1)] };
    if (url === "/sm/audit/threads/5/")
      return {
        data: {
          thread: { id: 5, title: "Smith, Ann · care team", members: [{ id: 2, name: "Dr. Lee", role: "doctor", joined_at: "2026-10-09T10:00:00Z", left_at: null }] },
          messages: [
            { id: 1, sender: { name: "Dr. Lee", role: "doctor" }, created_at: "2026-10-09T12:00:00Z", priority: "routine", care_setting: "acute", body: "wrong chart note", retracted: true, retracted_by: "Dr. Lee", retracted_at: "2026-10-09T12:01:00Z", retract_reason: "wrong patient", attachments: [{ id: 1, name: "wound.jpg" }] },
          ],
        },
      };
    return { data: {} };
  });
}
const lastAuditParams = () => [...api.get.mock.calls].reverse().find(([u]) => u === "/sm/audit/")[1].params;

test("lists events with plain-language actions and no message text", async () => {
  serve([{ has_more: false, events: [EV(3), EV(2, { action: "open_patient_thread", patient: "Smith, Ann", patient_id: 42, thread: 7 })] }]);
  render(<SecureMessagesAuditPage />);
  expect(await screen.findByTestId("audit-row-3")).toHaveTextContent("Sent a message");
  expect(screen.getByTestId("audit-row-2")).toHaveTextContent("Opened a patient care-team conversation");
  expect(screen.getByTestId("audit-row-2")).toHaveTextContent("Smith, Ann");
  expect(screen.queryByTestId("audit-more")).toBeNull();
});

test("shows an empty message and the server's refusal", async () => {
  serve([{ has_more: false, events: [] }]);
  const { unmount } = render(<SecureMessagesAuditPage />);
  expect(await screen.findByTestId("audit-empty")).toBeInTheDocument();
  unmount();
  api.get.mockImplementation(async (url) => {
    if (url === "/sm/people/") return { data: { people: [] } };
    throw { response: { status: 403, data: { detail: "You do not have permission to perform this action." } } };
  });
  render(<SecureMessagesAuditPage />);
  expect(await screen.findByText(/do not have permission/)).toBeInTheDocument();
});

test("filters by person, by clicking a patient, and clears them", async () => {
  serve([{ has_more: false, events: [EV(2, { patient: "Smith, Ann", patient_id: 42 })] }]);
  render(<SecureMessagesAuditPage />);
  await screen.findByTestId("audit-row-2");
  fireEvent.click(screen.getByText("Smith, Ann"));
  await waitFor(() => expect(lastAuditParams()).toEqual({ patient: 42 }));
  expect(screen.getByTestId("patient-filter-chip")).toHaveTextContent("Smith, Ann");
  fireEvent.change(screen.getByTestId("filter-since"), { target: { value: "2026-10-01T08:00" } });
  await waitFor(() => expect(lastAuditParams().since).toBe(new Date("2026-10-01T08:00").toISOString()));
  fireEvent.click(screen.getByText("Clear"));
  await waitFor(() => expect(lastAuditParams()).toEqual({}));
  expect(screen.queryByTestId("patient-filter-chip")).toBeNull();
});

const MANY = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => EV(to - i));

test("shows 12 events a page with a range and page buttons", async () => {
  serve([{ has_more: false, events: MANY(1, 30) }]);
  render(<SecureMessagesAuditPage />);
  expect(await screen.findByTestId("audit-row-30")).toBeInTheDocument();
  expect(screen.getAllByTestId(/^audit-row-/)).toHaveLength(12);
  expect(screen.getByTestId("audit-range")).toHaveTextContent("Showing 1-12 of 30");
  expect(screen.queryByTestId("audit-more")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /go to page 3/i }));
  expect(screen.getAllByTestId(/^audit-row-/)).toHaveLength(6);
  expect(screen.getByTestId("audit-range")).toHaveTextContent("Showing 25-30 of 30");
  expect(screen.getByTestId("audit-row-1")).toBeInTheDocument();
});

test("reaching the last loaded page fetches older events with the last id", async () => {
  serve([{ has_more: true, events: MANY(8, 20) }, { has_more: false, events: MANY(1, 7) }]);
  render(<SecureMessagesAuditPage />);
  await screen.findByTestId("audit-row-20");
  expect(screen.getByTestId("audit-range")).toHaveTextContent("Showing 1-12 of 13+");
  fireEvent.click(screen.getByRole("button", { name: /go to page 2/i }));
  await waitFor(() => expect(lastAuditParams()).toEqual({ before: 8 }));
  await waitFor(() => expect(screen.getByTestId("audit-range")).toHaveTextContent("of 20"));
  expect(screen.getByTestId("audit-range")).not.toHaveTextContent("20+");
  // still on page 2, now with the older events loaded in
  expect(screen.getByTestId("audit-row-1")).toBeInTheDocument();
});

test("opens a transcript with retracted text, pictures and members", async () => {
  serve([{ has_more: false, events: [EV(3)] }]);
  render(<SecureMessagesAuditPage />);
  fireEvent.click(await screen.findByTestId("open-transcript-3"));
  const msg = await screen.findByTestId("transcript-message-1");
  expect(msg).toHaveTextContent("wrong chart note");
  expect(msg).toHaveTextContent("Retracted by Dr. Lee");
  expect(msg).toHaveTextContent("wrong patient");
  expect(msg).toHaveTextContent("wound.jpg");
  expect(screen.getByText(/recorded in the audit log/)).toBeInTheDocument();
  expect(screen.getByTestId("transcript-members")).toHaveTextContent("Dr. Lee (doctor)");
  fireEvent.click(screen.getByText("Close"));
  await waitFor(() => expect(screen.queryByTestId("transcript-message-1")).toBeNull());
});
