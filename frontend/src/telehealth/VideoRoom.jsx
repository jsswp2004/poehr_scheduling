import { useEffect, useRef, useState } from "react";
import { messageFor } from "./messages";
import { useChimeMeeting } from "./useChimeMeeting";

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
        <button type="button" className="th-btn th-btn--onDark" onClick={meeting.toggleMute} disabled={phase !== "live"}>
          {meeting.muted ? "Unmute microphone" : "Mute microphone"}
        </button>
        <button
          type="button"
          className="th-btn th-btn--onDark"
          onClick={meeting.toggleCamera}
          disabled={phase !== "live" || !meeting.cameraAvailable}
        >
          {!meeting.cameraAvailable ? "No camera" : meeting.cameraOn ? "Turn off camera" : "Turn on camera"}
        </button>
        {meeting.canShare && (
          <button type="button" className="th-btn th-btn--onDark" onClick={meeting.toggleShare} disabled={phase !== "live"}>
            {meeting.sharing ? "Stop sharing" : "Share screen"}
          </button>
        )}
        <button type="button" className="th-btn th-btn--onDark" onClick={handleLeave}>
          {leaveLabel}
        </button>
        {onEnd && (
          <button type="button" className="th-btn th-btn--danger" onClick={() => setConfirmingEnd(true)}>
            End visit
          </button>
        )}
      </div>

      {confirmingEnd && (
        <div className="th-scrim">
          <div className="th-dialog" role="alertdialog" aria-labelledby="th-end-h" aria-describedby="th-end-p">
            <h2 id="th-end-h" className="th-h2">
              End this visit for everyone?
            </h2>
            <p id="th-end-p">
              The patient is disconnected and their link stops working. To step away and come back, choose “{leaveLabel}”
              instead.
            </p>
            <div className="th-actions">
              <button type="button" className="th-btn" ref={cancelRef} onClick={() => setConfirmingEnd(false)}>
                Keep visit open
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
                End visit
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
