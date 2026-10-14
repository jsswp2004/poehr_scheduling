import { useEffect, useRef, useState } from "react";
import { messageFor } from "./messages";
import { useChimeMeeting } from "./useChimeMeeting";

const ICONS = {
  mic: <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4" />,
  micOff: <path d="M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.11 1.23M12 19v4" />,
  cam: <path d="m22 8-6 4 6 4zM3 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />,
  camOff: <path d="M1 1l22 22M16 16v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2m5 0h4a1 1 0 0 1 1 1v3.34l1 1L22 8v8" />,
  share: <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />,
  leave: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  end: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM15 9l-6 6M9 9l6 6" />,
};

function Control({ icon, label, className = "", ...props }) {
  return (
    <button type="button" className={`th-ctl ${className}`.trim()} {...props}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[icon]}
      </svg>
      <span>{label}</span>
    </button>
  );
}

function Tile({ tileId, bindTile, unbindTile, className, mirrored, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (tileId == null) return undefined;
    bindTile(tileId, ref.current);
    return () => unbindTile(tileId);
  }, [tileId, bindTile, unbindTile]);
  if (tileId == null) return null;
  return (
    <video
      ref={ref}
      className={`${className}${mirrored ? " th-mirrored" : ""}`}
      autoPlay
      playsInline
      muted
      aria-label={label}
    />
  );
}

/**
 * The call itself: remote video, self-view, controls. Joins on mount and hangs up on unmount.
 * onLeft(reason, errorCode) fires once when the call stops: "left" | "meeting-ended" | "disconnected" | "error".
 */
export default function VideoRoom({
  joinInfo,
  devices,
  remoteName = "the other person",
  leaveLabel = "Leave visit",
  onJoined,
  onLeft,
  onEnd,
  sidebar,
  topBar,
}) {
  const meeting = useChimeMeeting();
  const audioRef = useRef(null);
  const joinedOnce = useRef(false);
  const leftOnce = useRef(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const cancelRef = useRef(null);

  const { join, leave, phase, error } = meeting;

  useEffect(() => {
    join(joinInfo, { audioEl: audioRef.current, ...devices });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "live" && !joinedOnce.current) {
      joinedOnce.current = true;
      onJoined?.();
    }
    if (["meeting-ended", "disconnected", "error"].includes(phase) && !leftOnce.current) {
      leftOnce.current = true;
      onLeft?.(phase, error);
    }
  }, [phase, error, onJoined, onLeft]);

  useEffect(() => {
    if (confirmingEnd) cancelRef.current?.focus();
  }, [confirmingEnd]);

  const handleLeave = async () => {
    leftOnce.current = true;
    await leave();
    onLeft?.("left", null);
  };

  const { tiles, bindTile, unbindTile } = meeting;
  const sharingView = tiles.content != null;
  const mainTile = sharingView ? tiles.content : tiles.remote;

  return (
    <section className="th-room" aria-label="Video visit">
      <audio ref={audioRef} autoPlay />
      {topBar}
      <div className="th-room-body">
        <div className="th-stage" data-sharing={sharingView || undefined}>
          <Tile
            tileId={mainTile}
            bindTile={bindTile}
            unbindTile={unbindTile}
            className="th-main"
            label={sharingView ? "Shared screen" : `Video of ${remoteName}`}
          />
          {sharingView && (
            <Tile
              tileId={tiles.remote}
              bindTile={bindTile}
              unbindTile={unbindTile}
              className="th-thumb"
              label={`Video of ${remoteName}`}
            />
          )}
          {phase === "joining" && (
            <p className="th-stage-note" role="status">
              Connecting…
            </p>
          )}
          {phase === "live" && !meeting.remotePresent && (
            <p className="th-stage-note" role="status">
              Waiting for {remoteName} to join
            </p>
          )}
          {phase === "live" && meeting.remotePresent && tiles.remote == null && !sharingView && (
            <p className="th-stage-note" role="status">
              {remoteName[0].toUpperCase() + remoteName.slice(1)}'s camera is off
            </p>
          )}
          <Tile
            tileId={tiles.local}
            bindTile={bindTile}
            unbindTile={unbindTile}
            className="th-pip"
            mirrored
            label="Your camera"
          />
          {meeting.poorConnection && (
            <p className="th-banner" role="status">
              Your connection is weak and video may pause. Turning off your camera keeps the audio clear.
            </p>
          )}
          {meeting.sharing && (
            <p className="th-banner th-banner--info" role="status">
              You're sharing your screen.
            </p>
          )}
        </div>
        {sidebar}
      </div>

      <div className="th-controls" role="group" aria-label="Call controls">
        <Control
          icon={meeting.muted ? "micOff" : "mic"}
          label={meeting.muted ? "Unmute microphone" : "Mute microphone"}
          className={meeting.muted ? "th-ctl--off" : ""}
          onClick={meeting.toggleMute}
          disabled={phase !== "live"}
        />
        <Control
          icon={meeting.cameraOn || !meeting.cameraAvailable ? "cam" : "camOff"}
          label={!meeting.cameraAvailable ? "No camera" : meeting.cameraOn ? "Turn off camera" : "Turn on camera"}
          className={meeting.cameraAvailable && !meeting.cameraOn ? "th-ctl--off" : ""}
          onClick={meeting.toggleCamera}
          disabled={phase !== "live" || !meeting.cameraAvailable}
        />
        {meeting.canShare && (
          <Control
            icon="share"
            label={meeting.sharing ? "Stop sharing" : "Share screen"}
            onClick={meeting.toggleShare}
            disabled={phase !== "live"}
          />
        )}
        <span className="th-controls-gap" aria-hidden="true" />
        <Control icon="leave" label={leaveLabel} onClick={handleLeave} />
        {onEnd && <Control icon="end" label="End session" className="th-ctl--end" onClick={() => setConfirmingEnd(true)} />}
      </div>

      {confirmingEnd && (
        <div className="th-scrim">
          <div className="th-dialog" role="alertdialog" aria-labelledby="th-end-h" aria-describedby="th-end-p">
            <h2 id="th-end-h" className="th-h2">
              End this session for everyone?
            </h2>
            <p id="th-end-p">
              The patient is disconnected and their link stops working. To step away and come back, choose “{leaveLabel}”
              instead.
            </p>
            <div className="th-actions">
              <button type="button" className="th-btn" ref={cancelRef} onClick={() => setConfirmingEnd(false)}>
                Keep session open
              </button>
              <button
                type="button"
                className="th-btn th-btn--danger"
                onClick={() => {
                  leftOnce.current = true;
                  setConfirmingEnd(false);
                  onEnd();
                }}
              >
                End session
              </button>
            </div>
          </div>
        </div>
      )}
      {phase === "error" && (
        <p className="th-banner" role="alert">
          {messageFor(error)}
        </p>
      )}
    </section>
  );
}
