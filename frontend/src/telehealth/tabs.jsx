import { useState } from "react";
import Board from "./Board";
import DeviceCheck from "./DeviceCheck";
import { clearDevicePrefs, loadSoundSetting, saveSoundSetting } from "./devicePrefs";
import { formatDay, isWaiting, patientOf, visitState } from "./format";

export function TodayTab({ schedule, date, boardProps }) {
  return (
    <>
      <h2 className="th-h2">{formatDay(date)}</h2>
      <Board
        items={schedule.items}
        loading={schedule.loading}
        error={schedule.error}
        label="Today's video visits"
        empty="No video visits today. A visit booked as video appears here with a button to send the patient their link."
        {...boardProps}
      />
    </>
  );
}

export function WaitingRoomTab({ schedule, boardProps }) {
  const waiting = schedule.items
    .filter((i) => isWaiting(visitState(i.session)))
    .sort((a, b) => Date.parse(patientOf(a.session).arrived_at) - Date.parse(patientOf(b.session).arrived_at));
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
