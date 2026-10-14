import { useCallback, useRef, useState } from "react";
import DeviceCheck from "./DeviceCheck";
import PatientPanel from "./PatientPanel";
import VideoRoom from "./VideoRoom";
import { staffApi } from "./api";
import VisitSummary from "./VisitSummary";
import { formatClock } from "./format";
import { messageFor } from "./messages";

/**
 * Full-screen room for the provider: device check, then the call with a patient panel.
 * `item` is the live schedule row (kept fresh by the parent's polling).
 */
export default function ProviderRoom({ sessionId, item, nowMs, offsetMs, onClose, reload, startAt = "check" }) {
  const [step, setStep] = useState(startAt); // check | live | left | ended | problem
  const [joinInfo, setJoinInfo] = useState(null);
  const [problem, setProblem] = useState(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [panelError, setPanelError] = useState(null);
  const devicesRef = useRef(null);

  const connect = useCallback(
    async (devices) => {
      devicesRef.current = devices;
      try {
        setJoinInfo(await staffApi.providerToken(sessionId));
        setStep("live");
      } catch (err) {
        setProblem(messageFor(err));
        setStep("problem");
      }
    },
    [sessionId]
  );

  const onJoined = useCallback(() => {
    staffApi.presence(sessionId, "joined").catch(() => {});
  }, [sessionId]);

  const onLeft = useCallback(
    (reason, code) => {
      staffApi.presence(sessionId, "left").catch(() => {});
      reload();
      if (reason === "left") setStep("left");
      else if (reason === "meeting-ended") setStep("ended");
      else {
        setProblem(messageFor(code));
        setStep("problem");
      }
    },
    [sessionId, reload]
  );

  const endVisit = useCallback(async () => {
    try {
      await staffApi.end(sessionId);
      setStep("ended");
    } catch (err) {
      setPanelError(messageFor(err));
    }
    reload();
  }, [sessionId, reload]);

  const act = async (fn) => {
    setPanelBusy(true);
    setPanelError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setPanelError(messageFor(err));
    } finally {
      setPanelBusy(false);
    }
  };

  const topBar = (
    <header className="th-room-bar">
      <strong>{item?.patient_display ?? "Video visit"}</strong>
      {item?.scheduled_at && <span className="th-room-sub">Booked for {formatClock(item.scheduled_at)}</span>}
    </header>
  );

  return (
    <div className="th-overlay" role="dialog" aria-modal="true" aria-label="Video visit">
      {step === "check" && (
        <div className="th-overlay-page">
          <DeviceCheck onReady={connect} continueLabel="Join the visit" heading="Check your camera and microphone" />
          <button type="button" className="th-btn th-btn--onDark" onClick={onClose}>
            Cancel
          </button>
        </div>
      )}

      {step === "live" && (
        <VideoRoom
          joinInfo={joinInfo}
          devices={devicesRef.current}
          remoteName="the patient"
          leaveLabel="Leave, keep visit open"
          onJoined={onJoined}
          onLeft={onLeft}
          onEnd={endVisit}
          topBar={topBar}
          sidebar={
            <PatientPanel
              item={item}
              nowMs={nowMs}
              offsetMs={offsetMs}
              busy={panelBusy}
              error={panelError}
              onAdmit={() => act(() => staffApi.admit(sessionId))}
              onResend={() => act(() => staffApi.sendJoinLink(sessionId))}
              onLocation={(patient_location) => act(() => staffApi.saveVisitRecord(sessionId, { patient_location }))}
            />
          }
        />
      )}

      {step === "left" && (
        <div className="th-overlay-page">
          <h1 className="th-h1">You left the visit</h1>
          <p>The visit is still open. The patient can stay in the waiting room, and you can come back.</p>
          <div className="th-actions">
            <button type="button" className="th-btn th-btn--primary" onClick={() => setStep("check")}>
              Rejoin visit
            </button>
            <button type="button" className="th-btn th-btn--onDark" onClick={onClose}>
              Back to the schedule
            </button>
          </div>
        </div>
      )}

      {step === "ended" && (
        <div className="th-overlay-page">
          <h1 className="th-h1">The visit has ended</h1>
          <VisitSummary sessionId={sessionId} onSaved={reload} />
          <div className="th-actions">
            <button type="button" className="th-btn th-btn--primary" onClick={onClose}>
              Back to the schedule
            </button>
          </div>
        </div>
      )}

      {step === "problem" && (
        <div className="th-overlay-page">
          <h1 className="th-h1">We couldn't start the call</h1>
          <p role="alert">{problem}</p>
          <div className="th-actions">
            <button type="button" className="th-btn th-btn--primary" onClick={() => setStep("check")}>
              Try again
            </button>
            <button type="button" className="th-btn th-btn--onDark" onClick={onClose}>
              Back to the schedule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
