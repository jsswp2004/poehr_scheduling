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
    },
    WS_BASE_URL: "ws://x",
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({ getAccessToken: () => null }), { virtual: true });
jest.mock("../../utils/secureLive", () => ({ subscribe: () => () => {}, onStatus: () => () => {}, socketStatus: () => "closed" }));

import { api } from "../../api/client";
import ThreadList from "../secureMessages/ThreadList";
import Conversation from "../secureMessages/Conversation";
import Composer from "../secureMessages/Composer";
import NewConversationDialog from "../secureMessages/NewConversationDialog";
import PatientMessages from "../secureMessages/PatientMessages";
import useSecureUnread from "../../hooks/secureMessages/useSecureUnread";

beforeAll(() => {
  let blobN = 0;
  global.URL.createObjectURL = jest.fn(() => `blob:x${++blobN}`);
  global.URL.revokeObjectURL = jest.fn();
});
beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
});

const msg = (id, extra = {}) => ({
  id, thread: 5, sender: { id: 2, name: "Dr. Lee", role: "doctor" }, mine: false, kind: "text", body: `hello ${id}`, retracted: false,
  priority: "routine", reply_to: null, care_setting: "acute", visit: 1, created_at: "2026-10-09T12:00:00Z", attachments: [], ...extra,
});
const THREAD = (extra = {}) => ({
  id: 5, kind: "direct", me: 1, title: "Dr. Lee", patient: null, unread: 0, urgent_unread: 0, last_message: null,
  members: [
    { id: 1, name: "Me Nurse", role: "nurse", last_read: 0, owner: true },
    { id: 2, name: "Dr. Lee", role: "doctor", last_read: 0, owner: false },
  ], ...extra,
});

function serve({ thread = THREAD(), messages = [msg(1)], hasOlder = false } = {}) {
  api.get.mockImplementation(async (url, cfg) => {
    if (url === "/sm/threads/5/") return { data: thread };
    if (url === "/sm/threads/5/messages/") {
      const after = cfg && cfg.params && cfg.params.after;
      return { data: { messages: after ? messages.filter((m) => m.id > after) : messages, has_more_older: hasOlder } };
    }
    if (url === "/sm/people/") return { data: { people: [], limited_to_my_facilities: false } };
    return { data: {} };
  });
  api.post.mockResolvedValue({ data: {} });
}

describe("ThreadList", () => {
  test("shows threads with unread count and urgent chip, and selects one", () => {
    const onSelect = jest.fn();
    const threads = [
      { id: 1, kind: "direct", title: "Dr. Lee", unread: 3, urgent_unread: 1, last_message: { sender: "Dr. Lee", preview: "stat labs", at: "2026-10-09T12:00:00Z" } },
      { id: 2, kind: "patient", title: "Smith, Ann · care team", unread: 0, urgent_unread: 0, last_message: null },
    ];
    render(<ThreadList threads={threads} selectedId={2} onSelect={onSelect} />);
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Lee: stat labs/)).toBeInTheDocument();
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("thread-1"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
  test("empty and error states", () => {
    const { rerender } = render(<ThreadList threads={[]} />);
    expect(screen.getByTestId("thread-list-empty")).toBeInTheDocument();
    rerender(<ThreadList threads={[]} error="Boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    rerender(<ThreadList threads={[]} loading />);
    expect(screen.getByTestId("thread-list-loading")).toBeInTheDocument();
  });
});

describe("Composer", () => {
  test("sends text as routine, and urgent when toggled, then clears", async () => {
    const onSend = jest.fn().mockResolvedValue(true);
    render(<Composer onSend={onSend} />);
    const input = screen.getByTestId("message-input");
    fireEvent.change(input, { target: { value: "  need a bed  " } });
    fireEvent.click(screen.getByTestId("urgent-toggle"));
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ body: "need a bed", priority: "urgent", replyTo: null, files: [] }));
    await waitFor(() => expect(input.value).toBe(""));
  });
  test("keeps the text when sending fails", async () => {
    const onSend = jest.fn().mockResolvedValue(false);
    render(<Composer onSend={onSend} />);
    fireEvent.change(screen.getByTestId("message-input"), { target: { value: "keep me" } });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(screen.getByTestId("message-input").value).toBe("keep me");
  });
  test("attaches pictures, rejects non-images, oversized files and more than four", () => {
    render(<Composer onSend={jest.fn()} />);
    const pic = (n, size = 100, type = "image/jpeg") => {
      const f = new File(["x"], n, { type });
      Object.defineProperty(f, "size", { value: size });
      return f;
    };
    const input = screen.getByTestId("file-input");
    fireEvent.change(input, { target: { files: [pic("a.jpg")] } });
    expect(within(screen.getByTestId("attachment-previews")).getAllByRole("img").length).toBe(1);
    fireEvent.change(input, { target: { files: [pic("doc.pdf", 10, "application/pdf")] } });
    expect(screen.getByTestId("composer-error")).toHaveTextContent("Only pictures");
    fireEvent.change(input, { target: { files: [pic("big.jpg", 16 * 1024 * 1024)] } });
    expect(screen.getByTestId("composer-error")).toHaveTextContent("larger than 15 MB");
    fireEvent.change(input, { target: { files: [pic("b.jpg"), pic("c.jpg"), pic("d.jpg"), pic("e.jpg")] } });
    expect(screen.getByTestId("composer-error")).toHaveTextContent("up to 4");
    expect(within(screen.getByTestId("attachment-previews")).getAllByRole("img").length).toBe(4);
  });
  test("a picture alone can be sent", async () => {
    const onSend = jest.fn().mockResolvedValue(true);
    render(<Composer onSend={onSend} />);
    const f = new File(["x"], "p.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [f] } });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ body: "", files: [f] })));
  });
});

describe("Conversation", () => {
  test("loads the messages and marks them read", async () => {
    serve({ messages: [msg(1), msg(2, { mine: true, body: "mine" })] });
    render(<Conversation threadId={5} />);
    expect(await screen.findByText("hello 1")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-title")).toHaveTextContent("Dr. Lee");
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/sm/threads/5/read/", { upto: 2 }, expect.anything()));
  });
  test("sends a message", async () => {
    serve();
    api.post.mockImplementation(async (url, body) => (url.endsWith("/messages/") ? { data: msg(9, { mine: true, body: body.body }) } : { data: {} }));
    render(<Conversation threadId={5} />);
    await screen.findByText("hello 1");
    fireEvent.change(screen.getByTestId("message-input"), { target: { value: "on my way" } });
    fireEvent.click(screen.getByTestId("send-button"));
    expect(await screen.findByText("on my way")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/sm/threads/5/messages/", { body: "on my way", priority: "routine" }, expect.anything());
  });
  test("sends pictures as multipart form data", async () => {
    serve();
    api.post.mockImplementation(async (url) => (url.endsWith("/messages/") ? { data: msg(9, { mine: true, body: "" }) } : { data: {} }));
    render(<Conversation threadId={5} />);
    await screen.findByText("hello 1");
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [new File(["x"], "p.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByTestId("send-button"));
    await waitFor(() => expect(api.post.mock.calls.some(([u, b]) => u.endsWith("/messages/") && b instanceof FormData)).toBe(true));
    const form = api.post.mock.calls.find(([u]) => u.endsWith("/messages/"))[1];
    expect(form.getAll("images").length).toBe(1);
  });
  test("shows the error and keeps the text when a send fails", async () => {
    serve();
    api.post.mockRejectedValue({ response: { data: { detail: "You are not in this conversation." } } });
    render(<Conversation threadId={5} />);
    await screen.findByText("hello 1");
    fireEvent.change(screen.getByTestId("message-input"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("send-button"));
    expect(await screen.findByTestId("composer-error")).toBeInTheDocument();
    expect(screen.getByTestId("message-input").value).toBe("x");
  });
  test("retracts my own message; others' messages have no retract", async () => {
    serve({ messages: [msg(1), msg(2, { mine: true, body: "oops" })] });
    api.post.mockImplementation(async (url) => (url.includes("retract") ? { data: msg(2, { mine: true, body: null, retracted: true }) } : { data: {} }));
    render(<Conversation threadId={5} />);
    await screen.findByText("oops");
    const others = within(screen.getByTestId("message-1"));
    fireEvent.click(others.getByLabelText("Message options"));
    expect(screen.queryByText("Retract")).toBeNull();
    fireEvent.keyDown(document.activeElement, { key: "Escape" });
    fireEvent.click(within(screen.getByTestId("message-2")).getByLabelText("Message options"));
    fireEvent.click(await screen.findByText("Retract"));
    expect(await screen.findByText("Message retracted")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/sm/messages/2/retract/", { reason: "" }, expect.anything());
  });
  test("system messages, urgent chip, reply quote, and Seen by", async () => {
    serve({
      thread: THREAD({ members: [{ id: 1, name: "Me Nurse", role: "nurse", last_read: 0 }, { id: 2, name: "Dr. Lee", role: "doctor", last_read: 3 }] }),
      messages: [
        msg(1, { kind: "system", body: "Dr. Lee joined the care team" }),
        msg(2, { priority: "urgent", body: "stat" }),
        msg(3, { mine: true, body: "ok", reply_to: { id: 2, sender: "Dr. Lee", preview: "stat" } }),
      ],
    });
    render(<Conversation threadId={5} />);
    expect(await screen.findByText("Dr. Lee joined the care team")).toBeInTheDocument();
    expect(screen.getAllByText("Urgent").length).toBeGreaterThan(0);
    expect(screen.getByText(/Dr\. Lee: stat/)).toBeInTheDocument();
    expect(screen.getByTestId("seen-3")).toHaveTextContent("Seen by Dr. Lee");
  });
  test("patient thread shows the care-team notice and a chip when the care setting changes", async () => {
    serve({
      thread: THREAD({ kind: "patient", title: "Smith, Ann · care team" }),
      messages: [msg(1, { care_setting: "emergency" }), msg(2, { care_setting: "emergency" }), msg(3, { care_setting: "acute" })],
    });
    render(<Conversation threadId={5} />);
    await screen.findByText("hello 3");
    expect(screen.getByText(/Everyone who cares for this patient/)).toBeInTheDocument();
    expect(screen.getAllByText("ED visit").length).toBe(1);
    expect(screen.getAllByText("Inpatient visit").length).toBe(1);
  });
  test("loads earlier messages", async () => {
    serve({ messages: [msg(5)], hasOlder: true });
    render(<Conversation threadId={5} />);
    await screen.findByText("hello 5");
    api.get.mockImplementation(async (url, cfg) => {
      if (url.endsWith("/messages/")) return { data: { messages: [msg(2)], has_more_older: false } };
      return { data: THREAD() };
    });
    fireEvent.click(screen.getByTestId("load-older"));
    expect(await screen.findByText("hello 2")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/sm/threads/5/messages/", expect.objectContaining({ params: { before: 5 } }));
    expect(screen.queryByTestId("load-older")).toBeNull();
  });
  test("shows a message instead of a conversation when it cannot be opened", async () => {
    api.get.mockRejectedValue({ response: { data: { detail: "Conversation not found." } } });
    render(<Conversation threadId={5} />);
    expect(await screen.findByText("Conversation not found.")).toBeInTheDocument();
  });
  test("with no thread chosen it invites you to pick one", () => {
    render(<Conversation threadId={null} />);
    expect(screen.getByText(/Choose a conversation/)).toBeInTheDocument();
  });
  test("members dialog lists people and leaves a group", async () => {
    serve({ thread: THREAD({ kind: "group", title: "Rounds" }) });
    api.delete.mockResolvedValue({ data: { ok: true } });
    const onLeft = jest.fn();
    render(<Conversation threadId={5} onLeft={onLeft} />);
    await screen.findByText("hello 1");
    fireEvent.click(screen.getByTestId("open-members"));
    const list = await screen.findByTestId("member-list");
    expect(within(list).getByText("Me Nurse (you)")).toBeInTheDocument();
    fireEvent.click(within(list).getByLabelText("Leave"));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/sm/threads/5/members/1/", expect.anything()));
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
  });
});

describe("NewConversationDialog", () => {
  const people = [
    { id: 2, name: "Dr. Lee", role: "doctor" },
    { id: 3, name: "Pat Nurse", role: "nurse" },
  ];
  const open = async (props = {}) => {
    api.get.mockResolvedValue({ data: { people, limited_to_my_facilities: true } });
    const onCreated = jest.fn();
    render(<NewConversationDialog open isAdmin={false} onClose={jest.fn()} onCreated={onCreated} {...props} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    return onCreated;
  };
  test("starts a direct conversation", async () => {
    const onCreated = await open();
    api.post.mockResolvedValue({ data: { id: 8 } });
    expect(screen.getByTestId("start-conversation")).toBeDisabled();
    fireEvent.mouseDown(screen.getByLabelText("Who do you want to message?"));
    fireEvent.click(await screen.findByText("Dr. Lee (doctor)"));
    fireEvent.click(screen.getByTestId("start-conversation"));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 8 }));
    expect(api.post).toHaveBeenCalledWith("/sm/threads/", { kind: "direct", user: 2 }, expect.anything());
  });
  test("a group needs a name and at least one person", async () => {
    const onCreated = await open();
    api.post.mockResolvedValue({ data: { id: 9 } });
    fireEvent.click(screen.getByText("Group"));
    fireEvent.change(screen.getByTestId("conversation-title"), { target: { value: "Rounds" } });
    expect(screen.getByTestId("start-conversation")).toBeDisabled();
    fireEvent.mouseDown(screen.getByLabelText("People"));
    fireEvent.click(await screen.findByText("Pat Nurse (nurse)"));
    fireEvent.click(screen.getByTestId("start-conversation"));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith("/sm/threads/", { kind: "group", title: "Rounds", members: [3] }, expect.anything());
  });
  test("channels are for administrators only", async () => {
    await open();
    expect(screen.queryByText("Channel")).toBeNull();
  });
  test("an administrator can start a channel", async () => {
    await open({ isAdmin: true });
    expect(screen.getByText("Channel")).toBeInTheDocument();
  });
  test("the show-everyone switch asks for the whole organization", async () => {
    await open();
    fireEvent.click(screen.getByLabelText(/Show everyone/));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/sm/people/", expect.objectContaining({ params: { all: 1 } })));
  });
  test("shows the server's reason when it cannot start", async () => {
    await open();
    api.post.mockRejectedValue({ response: { data: { detail: "Everyone must be an active colleague." } } });
    fireEvent.mouseDown(screen.getByLabelText("Who do you want to message?"));
    fireEvent.click(await screen.findByText("Dr. Lee (doctor)"));
    fireEvent.click(screen.getByTestId("start-conversation"));
    expect(await screen.findByText("Everyone must be an active colleague.")).toBeInTheDocument();
  });
});

describe("PatientMessages", () => {
  test("opens an existing care-team conversation straight away", async () => {
    api.get.mockImplementation(async (url, cfg) => {
      if (url === "/sm/threads/") return { data: { threads: [{ id: 5, kind: "patient", title: "Smith · care team" }] } };
      if (url === "/sm/threads/5/") return { data: THREAD({ kind: "patient", title: "Smith · care team" }) };
      if (url === "/sm/threads/5/messages/") return { data: { messages: [msg(1)], has_more_older: false } };
      return { data: {} };
    });
    api.post.mockResolvedValue({ data: {} });
    render(<PatientMessages patient={{ id: 42 }} />);
    expect(await screen.findByText("hello 1")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/sm/threads/", expect.objectContaining({ params: { patient: 42 } }));
  });
  test("explains and then joins when you are not on the care team yet", async () => {
    let joined = false;
    api.get.mockImplementation(async (url) => {
      if (url === "/sm/threads/") return { data: { threads: joined ? [{ id: 5, kind: "patient", title: "Smith · care team" }] : [] } };
      if (url === "/sm/threads/5/") return { data: THREAD({ kind: "patient" }) };
      if (url === "/sm/threads/5/messages/") return { data: { messages: [], has_more_older: false } };
      return { data: {} };
    });
    api.post.mockImplementation(async (url, body) => {
      if (url === "/sm/threads/" && body.kind === "patient") {
        joined = true;
        return { data: { id: 5 } };
      }
      return { data: {} };
    });
    render(<PatientMessages patient={{ id: 42 }} />);
    fireEvent.click(await screen.findByTestId("open-care-team"));
    expect(screen.queryByTestId("patient-messages-start")).toBeInTheDocument();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/sm/threads/", { kind: "patient", patient: 42 }, expect.anything()));
    expect(await screen.findByTestId("patient-messages")).toBeInTheDocument();
  });
  test("shows the server's reason when the role cannot open it", async () => {
    api.get.mockResolvedValue({ data: { threads: [] } });
    api.post.mockRejectedValue({ response: { data: { detail: "Your role cannot open a patient care-team thread." } } });
    render(<PatientMessages patient={{ id: 42 }} />);
    fireEvent.click(await screen.findByTestId("open-care-team"));
    expect(await screen.findByText(/cannot open a patient care-team/)).toBeInTheDocument();
  });
});

describe("useSecureUnread", () => {
  const Probe = ({ enabled }) => {
    const c = useSecureUnread(enabled);
    return <div data-testid="probe">{`${c.unread}/${c.urgent}/${c.denied}`}</div>;
  };
  test("reports the counts", async () => {
    api.get.mockResolvedValue({ data: { unread: 4, urgent: 1, threads: 2 } });
    render(<Probe enabled />);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("4/1/false"));
  });
  test("does nothing when not enabled", async () => {
    render(<Probe enabled={false} />);
    await act(async () => {});
    expect(api.get).not.toHaveBeenCalled();
  });
  test("stops and shows nothing when the server says the person may not use it", async () => {
    api.get.mockRejectedValue({ response: { status: 403 } });
    render(<Probe enabled />);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("0/0/true"));
  });
});
