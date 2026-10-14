import { render, screen, within } from "@testing-library/react";
import userEvent from "user-event-14";
import { ApiError, assistantApi } from "./api";
import AssistantPanel from "./AssistantPanel";
import { describeProposal, rehydrate } from "./assistantText";

jest.mock("../api/client", () => ({ __esModule: true, api: { request: jest.fn() } }));
jest.mock("../utils/auth", () => ({ __esModule: true, getValidToken: jest.fn() }));

jest.mock("./api", () => {
  const actual = jest.requireActual("./api");
  return {
    __esModule: true,
    ...actual, assistantApi: { chat: jest.fn() } };
});

const ITEMS = [
  { appointment_id: 3, patient_display: "Cy Longest", session: { id: "s3" } },
  { appointment_id: 4, patient_display: "Di Inside", session: { id: "s4" } },
];
const REF = "v_1a2b3c4d";

const makeActions = () => ({
  admit: jest.fn().mockResolvedValue(true),
  sendLink: jest.fn().mockResolvedValue(true),
  end: jest.fn().mockResolvedValue(true),
  setLocation: jest.fn().mockResolvedValue(true),
});

// The shared test setup doesn't reset browser storage between tests; these components use it.
afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

beforeEach(() => jest.clearAllMocks());

describe("rehydrate and describeProposal", () => {
  it("swaps visit codes for names in the browser and hides unknown ones", () => {
    const refs = { [REF]: { appointment_id: 3 } };
    expect(rehydrate(`${REF} is waiting, v_ffffffff too`, refs, ITEMS)).toBe("Cy Longest is waiting, a visit too");
  });

  it("words each proposal like the matching button", () => {
    expect(describeProposal({ kind: "admit" }, "Cy")).toEqual({ question: "Let Cy into the visit?", confirm: "Admit patient" });
    expect(describeProposal({ kind: "set_location", location: "home" }, "Cy").question).toBe("Record that Cy was at home?");
    expect(describeProposal({ kind: "nope" }, "Cy")).toBeNull();
  });
});

describe("AssistantPanel", () => {
  it("sends codes, never names, in the history it resends, and shows names to the user", async () => {
    assistantApi.chat
      .mockResolvedValueOnce({ reply: `${REF} has waited 4 minutes.`, proposals: [], refs: { [REF]: { appointment_id: 3 } } })
      .mockResolvedValueOnce({ reply: "Anything else?", proposals: [], refs: {} });
    const user = userEvent.setup();
    render(<AssistantPanel items={ITEMS} actions={makeActions()} busy={false} onClose={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Who is waiting?" }));
    expect(await screen.findByText("Cy Longest has waited 4 minutes.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Ask about today's visits"), "thanks{Enter}");
    await screen.findByText("Anything else?");
    const secondCall = assistantApi.chat.mock.calls[1][0];
    expect(secondCall.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(secondCall)).toContain(REF);
    expect(JSON.stringify(secondCall)).not.toContain("Cy Longest");
  });

  it("turns a proposal into a card and runs the matching action only after confirm", async () => {
    assistantApi.chat.mockResolvedValue({
      reply: `Prepared for ${REF}.`,
      proposals: [{ kind: "admit", ref: REF, appointment_id: 3, session_id: "s3" }],
      refs: { [REF]: { appointment_id: 3 } },
    });
    const actions = makeActions();
    const user = userEvent.setup();
    render(<AssistantPanel items={ITEMS} actions={actions} busy={false} onClose={jest.fn()} />);

    await user.type(screen.getByLabelText("Ask about today's visits"), "let them in{Enter}");
    const card = await screen.findByRole("group", { name: "Suggested action" });
    expect(within(card).getByText("Let Cy Longest into the visit?")).toBeInTheDocument();
    expect(actions.admit).not.toHaveBeenCalled();

    await user.click(within(card).getByRole("button", { name: "Admit patient" }));
    expect(actions.admit).toHaveBeenCalledWith(ITEMS[0]);
    expect(screen.queryByRole("group", { name: "Suggested action" })).not.toBeInTheDocument();
  });

  it("runs each kind of proposal through the existing actions", async () => {
    const cases = [
      [{ kind: "send_link" }, "Send link", "sendLink", [ITEMS[0]]],
      [{ kind: "end_visit" }, "End visit", "end", [ITEMS[0], { confirmed: true }]],
      [{ kind: "set_location", location: "other" }, "Save location", "setLocation", [ITEMS[0], "other"]],
    ];
    for (const [proposal, label, action, args] of cases) {
      assistantApi.chat.mockResolvedValueOnce({
        reply: "Done.",
        proposals: [{ ref: REF, appointment_id: 3, session_id: "s3", ...proposal }],
        refs: {},
      });
      const actions = makeActions();
      const user = userEvent.setup();
      const { unmount } = render(<AssistantPanel items={ITEMS} actions={actions} busy={false} onClose={jest.fn()} />);
      await user.type(screen.getByLabelText("Ask about today's visits"), "go{Enter}");
      await user.click(await screen.findByRole("button", { name: label }));
      expect(actions[action]).toHaveBeenCalledWith(...args);
      unmount();
    }
  });

  it("lets the person say not now, and nothing runs", async () => {
    assistantApi.chat.mockResolvedValue({
      reply: "Prepared.",
      proposals: [{ kind: "end_visit", ref: REF, appointment_id: 4, session_id: "s4" }],
      refs: {},
    });
    const actions = makeActions();
    const user = userEvent.setup();
    render(<AssistantPanel items={ITEMS} actions={actions} busy={false} onClose={jest.fn()} />);
    await user.type(screen.getByLabelText("Ask about today's visits"), "end it{Enter}");
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("group", { name: "Suggested action" })).not.toBeInTheDocument();
    expect(Object.values(actions).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it("explains failures in plain words and keeps the question box usable", async () => {
    assistantApi.chat.mockRejectedValue(new ApiError(503, "assistant_unavailable"));
    const user = userEvent.setup();
    render(<AssistantPanel items={ITEMS} actions={makeActions()} busy={false} onClose={jest.fn()} />);
    await user.type(screen.getByLabelText("Ask about today's visits"), "hello{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("The assistant isn't set up yet");
    expect(screen.getByLabelText("Ask about today's visits")).toBeEnabled();
  });

  it("closes with Escape and says plainly what it can't see or do", async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<AssistantPanel items={ITEMS} actions={makeActions()} busy={false} onClose={onClose} />);
    expect(screen.getByText(/not names or contact details/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
