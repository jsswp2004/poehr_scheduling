import { billingLine, needsLocation } from "./billingText";
import { formatClock, formatWait, isLongWait, isWaiting, visitState, waitMs } from "./format";

const TONE = {
  "no-session": "idle",
  "not-arrived": "idle",
  arrived: "wait",
  waiting: "wait",
  "in-visit": "live",
  ended: "done",
};

const STATUS_TEXT = {
  "no-session": "Not started",
  "not-arrived": "Hasn't joined yet",
  arrived: "Opened the link",
  waiting: "In the waiting room",
  "in-visit": "In the visit",
  ended: "Ended",
};

/**
 * One visit on the tracking board. The left edge and status words carry the state;
 * the wait timer is the one number staff scan for.
 */
export default function VisitRow({ item, nowMs, offsetMs, busy, canConduct, canManage, readOnly, actions }) {
  const state = visitState(item.session);
  const waiting = isWaiting(state);
  const disabled = busy || readOnly;
  const canSend = canManage || canConduct;
  // Any session that exists and hasn't ended can be ended, on any day, so stale ones don't linger.
  const canEnd = state !== "no-session" && state !== "ended";

  const waited = waiting ? waitMs(item.session, nowMs, offsetMs) : 0;
  const longWait = waiting && isLongWait(waited);

  return (
    <li className="th-row" data-state={state} data-long={longWait ? "true" : undefined}>
      <span className="th-row-time">{formatClock(item.scheduled_at)}</span>
      <span className="th-row-patient">{item.patient_display}</span>
      <span className="th-row-status">
        <span className={`th-chip th-chip--${TONE[state]}`}>
          <span className="th-chip-dot" aria-hidden="true" />
          {STATUS_TEXT[state]}
        </span>
        {waiting && <span className="th-timer">{formatWait(waited)}</span>}
        {longWait && <span className="th-row-note th-row-note--long">Waiting longer than 10 minutes</span>}
        {needsLocation(item.session) && <span className="th-row-note th-row-note--todo">Patient location needed</span>}
        {state === "ended" && item.session.billing?.confirmed && (
          <span className="th-row-note">{billingLine(item.session.billing)}</span>
        )}
      </span>
      <span className="th-row-actions">
        {!readOnly && (state === "no-session" || state === "not-arrived") && (
          <>
            {canSend && (
              <button type="button" className="th-btn" disabled={disabled} onClick={() => actions.sendLink(item)}>
                {state === "no-session" ? "Send link" : "Send new link"}
              </button>
            )}
            {canConduct && (
              <button type="button" className="th-btn th-btn--primary" disabled={disabled} onClick={() => actions.startVisit(item)}>
                Start visit
              </button>
            )}
          </>
        )}
        {!readOnly && waiting && canConduct && (
          <button type="button" className="th-btn th-btn--primary" disabled={disabled} onClick={() => actions.admit(item)}>
            Admit patient
          </button>
        )}
        {!readOnly && canConduct && needsLocation(item.session) && (
          <button type="button" className="th-btn th-btn--primary" disabled={disabled} onClick={() => actions.reviewVisit(item)}>
            Add visit details
          </button>
        )}
        {!readOnly && state === "in-visit" && (
          <>
            {canConduct && (
              <button type="button" className="th-btn th-btn--primary" disabled={disabled} onClick={() => actions.startVisit(item)}>
                Rejoin visit
              </button>
            )}
          </>
        )}
        {canSend && canEnd && (
          <button type="button" className="th-btn th-btn--quiet" disabled={busy} onClick={() => actions.end(item)}>
            End session
          </button>
        )}
      </span>
    </li>
  );
}
