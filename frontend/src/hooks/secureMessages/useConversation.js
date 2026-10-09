import { useCallback, useEffect, useRef, useState } from "react";
import { secure, errorText, announceChange } from "../../components/secureMessages/secureApi";
import useLiveRefresh from "./useLiveRefresh";

const mergeById = (current, incoming) => {
  const byId = new Map(current.map((m) => [m.id, m]));
  incoming.forEach((m) => byId.set(m.id, m));
  return [...byId.values()].sort((a, b) => a.id - b.id);
};

/**
 * One open conversation: its latest messages, who is in it, and sending. New messages are fetched with
 * `after=<last id>`; every few refreshes (and when the tab is shown again) the latest page is fetched whole,
 * so a message someone else retracted disappears too.
 */
export default function useConversation(threadId) {
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const messagesRef = useRef([]);
  const lastRead = useRef(0);
  const ticks = useRef(0);
  const current = useRef(threadId);
  current.current = threadId;

  const markRead = useCallback(async (list) => {
    const newest = list.length ? list[list.length - 1].id : 0;
    if (!newest || newest <= lastRead.current || document.visibilityState === "hidden") return;
    lastRead.current = newest;
    try {
      await secure.read(current.current, newest);
      announceChange();
    } catch (err) {
      lastRead.current = 0; // try again next time
    }
  }, []);

  const refresh = useCallback(
    async (reason = "poll", full = false) => {
      const id = current.current;
      if (!id) return;
      try {
        ticks.current += 1;
        const whole = full || reason === "focus" || ticks.current % 4 === 0;
        const have = messagesRef.current;
        const params = !whole && have.length ? { after: have[have.length - 1].id } : {};
        const [page, detail] = await Promise.all([secure.messages(id, params), secure.thread(id)]);
        if (id !== current.current) return; // moved to another conversation meanwhile
        setThread(detail);
        setError("");
        setMessages((cur) => {
          const merged = params.after ? mergeById(cur, page.messages) : mergeById([], page.messages);
          messagesRef.current = merged;
          return merged;
        });
        if (!params.after) setHasOlder(page.has_more_older);
        const all = params.after ? mergeById(have, page.messages) : page.messages;
        markRead(all);
      } catch (err) {
        if (id === current.current) setError(errorText(err, "Could not load this conversation."));
      } finally {
        setLoading(false);
      }
    },
    [markRead]
  );

  useEffect(() => {
    lastRead.current = 0;
    ticks.current = 0;
    messagesRef.current = [];
    setMessages([]);
    setThread(null);
    setHasOlder(false);
    setSendError("");
    if (threadId) {
      setLoading(true);
      refresh("open", true);
    } else {
      setLoading(false);
    }
  }, [threadId, refresh]);
  useLiveRefresh((reason) => refresh(reason), { enabled: !!threadId });

  const loadOlder = useCallback(async () => {
    const have = messagesRef.current;
    if (!have.length) return;
    try {
      const page = await secure.messages(current.current, { before: have[0].id });
      setMessages((cur) => {
        const merged = mergeById(cur, page.messages);
        messagesRef.current = merged;
        return merged;
      });
      setHasOlder(page.has_more_older);
    } catch (err) {
      setError(errorText(err, "Could not load earlier messages."));
    }
  }, []);

  const send = useCallback(
    async ({ body, priority, replyTo, files }) => {
      setSending(true);
      setSendError("");
      try {
        const sent = await secure.send(current.current, { body, priority, replyTo, files });
        setMessages((cur) => {
          const merged = mergeById(cur, [sent]);
          messagesRef.current = merged;
          return merged;
        });
        lastRead.current = Math.max(lastRead.current, sent.id);
        announceChange();
        return true;
      } catch (err) {
        setSendError(errorText(err, "Could not send. Your message is still here."));
        return false;
      } finally {
        setSending(false);
      }
    },
    []
  );

  const retract = useCallback(async (messageId) => {
    try {
      const updated = await secure.retract(messageId);
      setMessages((cur) => {
        const merged = mergeById(cur, [updated]);
        messagesRef.current = merged;
        return merged;
      });
      announceChange();
    } catch (err) {
      setSendError(errorText(err, "Could not retract that message."));
    }
  }, []);

  return { thread, setThread, messages, hasOlder, loading, error, sending, sendError, send, retract, loadOlder, reload: () => refresh("open", true) };
}
