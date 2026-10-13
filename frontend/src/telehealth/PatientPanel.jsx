import { formatWait, isWaiting, patientOf, visitState, waitMs } from "./format";

/** Provider's side panel inside the video room: who the patient is and whether to let them in. */
export default function PatientPanel({ item, nowMs, offsetMs, busy, error, onAdmit, onResend, onLocation }) {
  const state = visitState(item?.session);
  const patient = patientOf(item?.session);

  return (
    <aside className="th-panel" aria-label="Patient">
      <h2 className="th-h2">{item?.patient_display ?? "Patient"}</h2>

      {state === "not-arrived" && (
        <>
          <p>Hasn't opened the link yet.</p>
          <button type="button" className="th-btn" disabled={busy} onClick={onResend}>
            Send a new link
          </button>
        </>
      )}

      {isWaiting(state) && (
        <>
          <p className="th-timer th-timer--large">{formatWait(waitMs(item.session, nowMs, offsetMs))}</p>
          <p>
            {state === "arrived"
              ? "Opened the link and is reading the visit notice."
              : "Agreed to the visit notice and is in the waiting room."}
          </p>
          <button type="button" className="th-btn th-btn--primary" disabled={busy} onClick={onAdmit}>
            Admit patient
          </button>
        </>
      )}

      {state === "in-visit" && (
        <p>{patient?.left_at && !patient?.joined_at ? "Admitted." : patient?.left_at ? "Left the call. They can rejoin." : "In the visit."}</p>
      )}

      {state === "in-visit" && onLocation && (
        <div role="group" aria-labelledby="th-locate-label" className="th-locate">
          <p className="th-h3" id="th-locate-label">
            Where is the patient?
          </p>
          <div className="th-segment">
            <button
              type="button"
              className="th-btn"
              aria-pressed={item.session.billing?.place_of_service === "10"}
              disabled={busy}
              onClick={() => onLocation("home")}
            >
              At home
            </button>
            <button
              type="button"
              className="th-btn"
              aria-pressed={item.session.billing?.place_of_service === "02"}
              disabled={busy}
              onClick={() => onLocation("other")}
            >
              Somewhere else
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="th-callout th-callout--alert" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
