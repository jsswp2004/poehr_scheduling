import { useCallback, useEffect, useRef, useState } from "react";
import AssistantPanel from "./AssistantPanel";
import ProviderRoom from "./ProviderRoom";
import { ScheduleTab, SettingsTab, TodayTab, WaitingRoomTab } from "./tabs";
import { staffApi } from "./api";
import { loadSoundSetting } from "./devicePrefs";
import { formatDay, isWaiting, todayISO, visitState } from "./format";
import { useNow, useSchedule } from "./hooks";
import { messageFor } from "./messages";
import { playChime } from "./sound";
import "./styles";

// Why a text did not go out, in words staff can act on. "failed" covers the text service being down
// or not set up for this organization.
const TEXT_PROBLEMS = {
  no_consent: "This patient has not agreed to receive texts.",
  opted_out: "This patient has opted out of texts.",
  no_phone: "This patient has no mobile number on file.",
  failed: "The text could not be sent. The text service reported a problem.",
};

const TABS = [
  { id: "today", label: "Today" },
  { id: "waiting", label: "Waiting room" },
  { id: "schedule", label: "Schedule" },
  { id: "settings", label: "Settings" },
];

/**
 * Staff shell for /telehealth. Gate it with your own role check; the props say what this
 * person may do (the server enforces the same rules either way).
 */
export default function TelehealthApp({ canConduct = true, canManage = true, wsUrl, title = "Telehealth", assistant = false }) {
  const [tab, setTab] = useState("today");
  const today = todayISO();
  const [scheduleDate, setScheduleDate] = useState(today);
  const viewingOtherDay = tab === "schedule" && scheduleDate !== today;
  const todaySched = useSchedule(today, { wsUrl });
  const otherSched = useSchedule(scheduleDate, { enabled: viewingOtherDay });
  const schedule = viewingOtherDay ? otherSched : todaySched;
  const nowMs = useNow(1000);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [room, setRoom] = useState(null); // { appointmentId, sessionId }
  const [assistantOpen, setAssistantOpen] = useState(false);
  const assistantButton = useRef(null);

  // Publish the pinned header's height so the filter pills and the side panel can pin just beneath it.
  const headObserver = useRef(null);
  const headRef = useCallback((node) => {
    if (headObserver.current) {
      headObserver.current.disconnect();
      headObserver.current = null;
    }
    if (!node) return;
    const publish = () => document.documentElement.style.setProperty("--th-head-h", `${node.getBoundingClientRect().height}px`);
    publish();
    if (typeof ResizeObserver !== "undefined") {
      headObserver.current = new ResizeObserver(publish);
      headObserver.current.observe(node);
    }
  }, []);

  const waitingCount = todaySched.items.filter((i) => isWaiting(visitState(i.session))).length;
  const previousCount = useRef(0);
  useEffect(() => {
    if (waitingCount > previousCount.current && loadSoundSetting()) playChime();
    previousCount.current = waitingCount;
  }, [waitingCount]);

  useEffect(() => {
    const original = document.title;
    if (waitingCount > 0) document.title = `(${waitingCount} waiting) ${original.replace(/^\(\d+ waiting\) /, "")}`;
    return () => {
      document.title = original;
    };
  }, [waitingCount]);

  const reloadToday = todaySched.reload;

  const run = useCallback(async (fn) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setNotice({ kind: "error", text: messageFor(err) });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const ensureSession = async (item) => item.session ?? staffApi.createSession(item.appointment_id);

  const actions = {
    sendLink: (item) =>
      run(async () => {
        const session = await ensureSession(item);
        const result = await staffApi.sendJoinLink(session.id);
        if (result.sent) {
          setNotice({ kind: "info", text: `Link sent to ${item.patient_display}.` });
        } else {
          // Texting was suppressed (for example, the patient opted out): hand staff the link instead.
          const manual = await staffApi.sendJoinLink(session.id, false);
          let copied = false;
          try {
            await navigator.clipboard.writeText(manual.url);
            copied = true;
          } catch {
            /* fall through to showing the link */
          }
          const why = TEXT_PROBLEMS[result.reason] || TEXT_PROBLEMS.failed;
          setNotice({
            kind: "info",
            text: copied
              ? `${why} The link is copied. Send it another way.`
              : `${why} Send them this link another way: ${manual.url}`,
          });
        }
        await reloadToday();
      }),
    startVisit: (item) =>
      run(async () => {
        const session = await ensureSession(item);
        setRoom({ appointmentId: item.appointment_id, sessionId: session.id });
        reloadToday();
      }),
    setLocation: (item, patient_location) =>
      run(async () => {
        await staffApi.saveVisitRecord(item.session.id, { patient_location });
        setNotice({ kind: "info", text: `Saved where ${item.patient_display} was.` });
        await reloadToday();
      }),
    reviewVisit: (item) => setRoom({ appointmentId: item.appointment_id, sessionId: item.session.id, startAt: "ended" }),
    admit: (item) =>
      run(async () => {
        await staffApi.admit(item.session.id);
        setRoom({ appointmentId: item.appointment_id, sessionId: item.session.id });
        reloadToday();
      }),
    end: (item, { confirmed = false } = {}) =>
      run(async () => {
        if (!confirmed && !window.confirm(`End the session with ${item.patient_display} for everyone?`)) return;
        await staffApi.end(item.session.id);
        setNotice({ kind: "info", text: `Session with ${item.patient_display} ended.` });
        await Promise.all([reloadToday(), schedule.reload()]);
      }),
  };

  const boardProps = { nowMs, offsetMs: schedule.offsetMs, busy, canConduct, canManage, actions };

  const onTabKeyDown = (event, index) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length].id;
    setTab(next);
    requestAnimationFrame(() => document.getElementById(`th-tab-${next}`)?.focus());
  };

  const roomItem = room && todaySched.items.find((i) => i.appointment_id === room.appointmentId);

  return (
    <main className="th-root th-app">
      <header className="th-header" ref={headRef}>
        <div className="th-titlebar">
          <div>
            <h1 className="th-h1">{title}</h1>
            <p className="th-subtitle">Video visits for today. Send links, admit patients and start visits.</p>
          </div>
          <div className="th-titlebar-end">
            {tab === "today" && <span className="th-day">{formatDay(today)}</span>}
          {assistant && (
            <button
              type="button"
              ref={assistantButton}
              className="th-btn"
              aria-expanded={assistantOpen}
              onClick={() => setAssistantOpen((open) => !open)}
            >
              Ask the assistant
            </button>
          )}
          </div>
        </div>
        <div className="th-tabs" role="tablist" aria-label="Telehealth sections">
          {TABS.map((t, index) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`th-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="th-tabpanel"
              tabIndex={tab === t.id ? 0 : -1}
              className="th-tab"
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKeyDown(e, index)}
            >
              {t.label}
              {t.id === "waiting" && waitingCount > 0 && (
                <span className="th-count">
                  <span className="th-visually-hidden"> </span>
                  {waitingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {notice && (
        <p className={`th-callout th-callout--${notice.kind === "error" ? "alert" : "info"}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}{" "}
          <button type="button" className="th-link" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      )}

      <div role="tabpanel" id="th-tabpanel" aria-labelledby={`th-tab-${tab}`} className="th-tabpanel">
        {tab === "today" && <TodayTab schedule={todaySched} boardProps={boardProps} />}
        {tab === "waiting" && <WaitingRoomTab schedule={todaySched} boardProps={boardProps} />}
        {tab === "schedule" && (
          <ScheduleTab
            schedule={schedule}
            date={scheduleDate}
            onDateChange={setScheduleDate}
            isToday={scheduleDate === today}
            boardProps={boardProps}
          />
        )}
        {tab === "settings" && <SettingsTab />}
      </div>

      {assistant && assistantOpen && (
        <AssistantPanel
          items={todaySched.items}
          actions={actions}
          busy={busy}
          onClose={() => {
            setAssistantOpen(false);
            assistantButton.current?.focus();
          }}
        />
      )}

      {room && (
        <ProviderRoom
          sessionId={room.sessionId}
          startAt={room.startAt}
          item={roomItem}
          nowMs={nowMs}
          offsetMs={todaySched.offsetMs}
          reload={reloadToday}
          onClose={() => {
            setRoom(null);
            reloadToday();
          }}
        />
      )}
    </main>
  );
}
