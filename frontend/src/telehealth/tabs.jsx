import { useState } from "react";
import Board from "./Board";
import DeviceCheck from "./DeviceCheck";
import { clearDevicePrefs, loadSoundSetting, saveSoundSetting } from "./devicePrefs";
import { formatClock, formatDay, formatWait, isLongWait, isWaiting, patientOf, visitState, waitMs } from "./format";

const FILTERS = [
  { id: "all", label: "All", match: () => true },
  { id: "waiting", label: "Waiting", match: (state) => isWaiting(state) },
  { id: "in-visit", label: "In visit", match: (state) => state === "in-visit" },
  { id: "upcoming", label: "Upcoming", match: (state) => state === "no-session" || state === "not-arrived" },
  { id: "done", label: "Done", match: (state) => state === "ended" },
];

/** The waiting patients, longest wait first. */
function waitingOf(items) {
  return items
    .filter((i) => isWaiting(visitState(i.session)))
    .sort((a, b) => Date.parse(patientOf(a.session).arrived_at) - Date.parse(patientOf(b.session).arrived_at));
}

/** Side panel on the Today tab: who is waiting, how long, and one button to bring them in. */
function WaitingPanel({ items, nowMs, offsetMs, busy, canConduct, actions }) {
  const waiting = waitingOf(items);
  return (
    <aside className="th-aside" aria-label="Waiting room">
      <div className="th-aside-head">
        <h2 className="th-h3">Waiting room</h2>
        {waiting.length > 0 && <span className="th-chip th-chip--wait">{waiting.length} waiting</span>}
      </div>
      {waiting.length === 0 ? (
        <p className="th-aside-empty">No one is waiting. Patients appear here as soon as they open their link.</p>
      ) : (
        <ul className="th-waitlist">
          {waiting.map((item) => {
            const waited = waitMs(item.session, nowMs, offsetMs);
            const long = isLongWait(waited);
            return (
              <li key={item.appointment_id} className="th-waitcard" data-long={long ? "true" : undefined}>
                <div className="th-waitcard-top">
                  <span className="th-waitcard-name">{item.patient_display}</span>
                  <span className="th-waitcard-timer">{formatWait(waited)}</span>
                </div>
                {long && <div className="th-waitcard-long">Waiting longer than 10 minutes</div>}
                <div className="th-waitcard-meta">Booked for {formatClock(item.scheduled_at)}</div>
                {canConduct && (
                  <button
                    type="button"
                    className="th-btn th-btn--primary th-btn--block"
                    aria-label={`Admit ${item.patient_display}`}
                    disabled={busy}
                    onClick={() => actions.admit(item)}
                  >
                    Admit patient
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="th-aside-note">Admitting a patient brings them into your room. The timer turns red after 10 minutes so no one is missed.</p>
    </aside>
  );
}

export function TodayTab({ schedule, boardProps }) {
  const [filter, setFilter] = useState("all");
  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.id, schedule.items.filter((i) => f.match(visitState(i.session))).length])
  );
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const shown = schedule.items.filter((i) => active.match(visitState(i.session)));
  return (
    <>
      <div className="th-filterbar">
        <div className="th-filters" role="group" aria-label="Filter visits">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="th-pill"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label} {counts[f.id]}
            </button>
          ))}
        </div>
      </div>
      <div className="th-today">
        <div className="th-today-main">
          <Board
            items={shown}
            loading={schedule.loading}
            error={schedule.error}
            label="Today's video visits"
            empty={
              schedule.items.length === 0
                ? "No video visits today. A visit booked as video appears here with a button to send the patient their link."
                : "No visits match this filter."
            }
            {...boardProps}
          />
        </div>
        <WaitingPanel items={schedule.items} {...boardProps} />
      </div>
    </>
  );
}

export function WaitingRoomTab({ schedule, boardProps }) {
  const waiting = waitingOf(schedule.items);
  return (
    <>
      <h2 className="th-h2">Waiting room</h2>
      <p className="th-lede">Longest wait first.</p>
      <Board
        items={waiting}
        loading={schedule.loading}
        error={schedule.error}
        label="Patients in the waiting room"
        empty="No one is waiting. Patients appear here as soon as they open their link."
        {...boardProps}
      />
    </>
  );
}

export function ScheduleTab({ schedule, date, onDateChange, isToday, boardProps }) {
  return (
    <>
      <div className="th-schedule-head">
        <h2 className="th-h2">{formatDay(date)}</h2>
        <label className="th-field th-field--inline">
          <span>Day</span>
          <input type="date" value={date} onChange={(e) => e.target.value && onDateChange(e.target.value)} />
        </label>
      </div>
      {!isToday && (
        <p className="th-lede">You can start visits and send links on the day of the visit.</p>
      )}
      <Board
        items={schedule.items}
        loading={schedule.loading}
        error={schedule.error}
        label="Video visits on this day"
        empty="No video visits on this day."
        {...boardProps}
        readOnly={!isToday}
      />
    </>
  );
}

export function SettingsTab() {
  const [sound, setSound] = useState(loadSoundSetting);
  const [testing, setTesting] = useState(false);
  const [forgot, setForgot] = useState(false);

  return (
    <>
      <h2 className="th-h2">Settings</h2>

      <section className="th-setting" aria-labelledby="th-set-rec">
        <h3 id="th-set-rec" className="th-h3">Recording</h3>
        <p>Visits aren't recorded. This system doesn't store video or audio.</p>
      </section>

      <section className="th-setting" aria-labelledby="th-set-alert">
        <h3 id="th-set-alert" className="th-h3">Arrival alert</h3>
        <label className="th-check-row">
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              setSound(e.target.checked);
              saveSoundSetting(e.target.checked);
            }}
          />
          <span>Play a sound when a patient joins the waiting room</span>
        </label>
      </section>

      <section className="th-setting" aria-labelledby="th-set-dev">
        <h3 id="th-set-dev" className="th-h3">Camera and microphone</h3>
        {testing ? (
          <DeviceCheck
            heading="Test your camera and microphone"
            continueLabel="Save and close"
            onReady={() => setTesting(false)}
          />
        ) : (
          <div className="th-actions">
            <button type="button" className="th-btn" onClick={() => setTesting(true)}>
              Test camera and microphone
            </button>
            <button
              type="button"
              className="th-btn th-btn--quiet"
              onClick={() => {
                clearDevicePrefs();
                setForgot(true);
              }}
            >
              Forget saved devices
            </button>
          </div>
        )}
        {forgot && !testing && (
          <p role="status">Saved devices cleared. You'll choose again at your next visit.</p>
        )}
      </section>
    </>
  );
}
