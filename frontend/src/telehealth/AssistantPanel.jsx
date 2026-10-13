import { useEffect, useRef, useState } from "react";
import { assistantApi } from "./api";
import { describeProposal, rehydrate } from "./assistantText";
import { messageFor } from "./messages";

const SUGGESTIONS = ["Who is waiting?", "What still needs a patient location?", "Which visits haven't started?"];

/**
 * Side panel for the staff assistant. The assistant sees visit codes, times and states, never
 * names. It can't change anything: it prepares cards, and the button on a card runs the same
 * action as the board does, under the staff member's own login.
 */
export default function AssistantPanel({ items, actions, busy, onClose }) {
  const [turns, setTurns] = useState([]); // { role, content (with codes), refs? }
  const [cards, setCards] = useState([]); // pending proposals
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => endRef.current?.scrollIntoView?.({ block: "end" }), [turns, cards]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || sending) return;
    const next = [...turns, { role: "user", content }];
    setTurns(next);
    setInput("");
    setError(null);
    setSending(true);
    try {
      // History goes back as typed/returned (codes, not names). The server scrubs it again.
      const result = await assistantApi.chat(next.map(({ role, content: c }) => ({ role, content: c })));
      setTurns([...next, { role: "assistant", content: result.reply, refs: result.refs }]);
      setCards((existing) => [
        ...existing,
        ...result.proposals.map((p) => ({ ...p, key: `${p.kind}-${p.ref}-${Date.now()}-${Math.random()}`, refs: result.refs })),
      ]);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSending(false);
    }
  };

  const confirm = async (card) => {
    const item = items.find((i) => i.appointment_id === card.appointment_id);
    if (!item) {
      setError("That visit isn't on today's schedule any more.");
      return;
    }
    setCards((existing) => existing.filter((c) => c.key !== card.key));
    if (card.kind === "admit") await actions.admit(item);
    else if (card.kind === "send_link") await actions.sendLink(item);
    else if (card.kind === "end_visit") await actions.end(item, { confirmed: true });
    else if (card.kind === "set_location") await actions.setLocation(item, card.location);
  };

  const dismiss = (card) => setCards((existing) => existing.filter((c) => c.key !== card.key));

  return (
    <aside
      className="th-assistant"
      aria-label="Assistant"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <header className="th-assistant-head">
        <h2 className="th-h2">Assistant</h2>
        <button type="button" className="th-btn th-btn--quiet" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="th-hint">
        It sees visit times and status, not names or contact details. Please don't type them. It can't act
        on its own: anything it suggests waits for you to confirm.
      </p>

      <div className="th-assistant-log" role="log" aria-live="polite" aria-label="Conversation">
        {turns.length === 0 && (
          <div className="th-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="th-btn th-btn--quiet" disabled={sending} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((turn, index) => (
          <p key={index} className={`th-turn th-turn--${turn.role}`}>
            <span className="th-visually-hidden">{turn.role === "user" ? "You: " : "Assistant: "}</span>
            {turn.role === "assistant" ? rehydrate(turn.content, turn.refs, items) : rehydrate(turn.content, {}, items)}
          </p>
        ))}
        {sending && (
          <p className="th-turn th-turn--assistant" role="status">
            Thinking…
          </p>
        )}

        {cards.map((card) => {
          const item = items.find((i) => i.appointment_id === card.appointment_id);
          const text = item ? describeProposal(card, item.patient_display) : null;
          if (!text) return null;
          return (
            <div key={card.key} className="th-card" role="group" aria-label="Suggested action">
              <p className="th-card-q">{text.question}</p>
              <div className="th-actions">
                <button type="button" className="th-btn th-btn--primary" disabled={busy} onClick={() => confirm(card)}>
                  {text.confirm}
                </button>
                <button type="button" className="th-btn th-btn--quiet" onClick={() => dismiss(card)}>
                  Not now
                </button>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="th-callout th-callout--alert" role="alert">
          {error}
        </p>
      )}

      <form
        className="th-assistant-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label className="th-visually-hidden" htmlFor="th-assistant-input">
          Ask about today's visits
        </label>
        <textarea
          id="th-assistant-input"
          ref={inputRef}
          rows={2}
          value={input}
          maxLength={1000}
          placeholder="Ask about today's visits"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button type="submit" className="th-btn th-btn--primary" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
