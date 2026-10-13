import { useCallback, useEffect, useRef, useState } from "react";

// Wraps amazon-chime-sdk-js so components only deal with plain state and a few actions.
// The SDK is loaded on first join, which keeps it out of the staff shell and the patient
// page until it's needed.

const canShareScreen = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices && !!navigator.mediaDevices.getDisplayMedia;

const INITIAL = {
  phase: "idle", // idle | joining | live | left | meeting-ended | disconnected | error
  error: null,
  muted: false,
  cameraAvailable: false,
  cameraOn: false,
  sharing: false,
  remotePresent: false,
  poorConnection: false,
  tiles: { local: null, remote: null, content: null },
};

export function useChimeMeeting() {
  const sessionRef = useRef(null);
  const joiningRef = useRef(false); // blocks a second join() while the first is still setting up
  const cancelledRef = useRef(false); // set when the component using this hook unmounts
  const videoInputRef = useRef(null);
  const [state, setState] = useState(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const patch = useCallback((p) => setState((prev) => ({ ...prev, ...p })), []);
  const patchTiles = useCallback(
    (p) => setState((prev) => ({ ...prev, tiles: { ...prev.tiles, ...p } })),
    []
  );

  const releaseDevices = useCallback(async (av) => {
    try {
      av.stopContentShare();
      av.stopLocalVideoTile();
      await av.stopVideoInput();
      await av.stopAudioInput();
    } catch {
      /* best effort */
    }
  }, []);

  const leave = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null; // observers use this to tell "we left" from "we were dropped"
    const av = session.audioVideo;
    try {
      av.stop();
    } catch {
      /* ignore */
    }
    await releaseDevices(av);
    setState({ ...INITIAL, phase: "left" });
  }, [releaseDevices]);

  const join = useCallback(
    async (joinInfo, { audioEl, audioInputId, videoInputId } = {}) => {
      if (sessionRef.current || joiningRef.current) return;
      joiningRef.current = true;
      patch({ phase: "joining", error: null });
      let session = null;
      try {
        const sdk = await import("amazon-chime-sdk-js");
        if (cancelledRef.current) return; // unmounted while the SDK was loading
        const logger = new sdk.ConsoleLogger("telehealth", sdk.LogLevel.WARN);
        const deviceController = new sdk.DefaultDeviceController(logger);
        const configuration = new sdk.MeetingSessionConfiguration(joinInfo.Meeting, joinInfo.Attendee);
        session = new sdk.DefaultMeetingSession(configuration, logger, deviceController);
        sessionRef.current = session;
        const av = session.audioVideo;
        const myAttendeeId = joinInfo.Attendee.AttendeeId;
        const present = new Set();

        av.addObserver({
          audioVideoDidStart: () => {
            if (sessionRef.current === session) patch({ phase: "live" });
          },
          audioVideoDidStop: (status) => {
            if (sessionRef.current !== session) return; // we left on purpose
            sessionRef.current = null;
            const ended = status.statusCode() === sdk.MeetingSessionStatusCode.AudioCallEnded;
            releaseDevices(av);
            patch(
              ended
                ? { phase: "meeting-ended" }
                : { phase: "disconnected", error: "connection_lost", sharing: false }
            );
          },
          videoTileDidUpdate: (tile) => {
            if (!tile.boundAttendeeId) return;
            const base = tile.boundAttendeeId.split("#")[0];
            const mine = base === myAttendeeId;
            if (tile.isContent) {
              if (!mine) patchTiles({ content: tile.tileId });
            } else if (tile.localTile) {
              patchTiles({ local: tile.tileId });
            } else {
              patchTiles({ remote: tile.tileId });
            }
          },
          videoTileWasRemoved: (tileId) => {
            setState((prev) => {
              const tiles = { ...prev.tiles };
              Object.keys(tiles).forEach((k) => {
                if (tiles[k] === tileId) tiles[k] = null;
              });
              return { ...prev, tiles };
            });
          },
          connectionDidBecomePoor: () => patch({ poorConnection: true }),
          connectionDidSuggestStopVideo: () => patch({ poorConnection: true }),
          connectionDidBecomeGood: () => patch({ poorConnection: false }),
        });
        av.addContentShareObserver({
          contentShareDidStart: () => patch({ sharing: true }),
          contentShareDidStop: () => patch({ sharing: false }),
        });
        av.realtimeSubscribeToAttendeeIdPresence((attendeeId, isPresent) => {
          if (attendeeId.includes("#") || attendeeId.split("#")[0] === myAttendeeId) return;
          if (isPresent) present.add(attendeeId);
          else present.delete(attendeeId);
          patch({ remotePresent: present.size > 0 });
        });
        av.realtimeSubscribeToMuteAndUnmuteLocalAudio((_id, muted) => patch({ muted }));

        // Microphone is required. Camera is optional: a visit can proceed audio-only.
        try {
          const micId = audioInputId || (await av.listAudioInputDevices())[0]?.deviceId;
          if (!micId) throw new Error("no mic");
          await av.startAudioInput(micId);
        } catch {
          throw Object.assign(new Error("microphone_unavailable"), { code: "microphone_unavailable" });
        }
        let cameraOk = false;
        if (videoInputId) {
          try {
            await av.startVideoInput(videoInputId);
            videoInputRef.current = videoInputId;
            cameraOk = true;
          } catch {
            cameraOk = false;
          }
        }
        if (sessionRef.current !== session) {
          releaseDevices(av); // left while the microphone and camera were starting
          return;
        }
        if (audioEl) av.bindAudioElement(audioEl);
        av.start();
        if (cameraOk) av.startLocalVideoTile();
        patch({ cameraAvailable: cameraOk, cameraOn: cameraOk });
      } catch (err) {
        if (session && sessionRef.current === session) {
          sessionRef.current = null;
          releaseDevices(session.audioVideo);
          try {
            session.audioVideo.stop();
          } catch {
            /* ignore */
          }
        }
        patch({ phase: "error", error: err.code || "connection_lost" });
      } finally {
        joiningRef.current = false;
      }
    },
    [patch, patchTiles, releaseDevices]
  );

  const toggleMute = useCallback(() => {
    const av = sessionRef.current?.audioVideo;
    if (!av) return;
    if (stateRef.current.muted) av.realtimeUnmuteLocalAudio();
    else av.realtimeMuteLocalAudio();
  }, []);

  const toggleCamera = useCallback(async () => {
    const av = sessionRef.current?.audioVideo;
    if (!av || !stateRef.current.cameraAvailable) return;
    if (stateRef.current.cameraOn) {
      av.stopLocalVideoTile();
      await av.stopVideoInput(); // releases the camera so its light goes off
      patch({ cameraOn: false });
    } else {
      try {
        await av.startVideoInput(videoInputRef.current);
        av.startLocalVideoTile();
        patch({ cameraOn: true });
      } catch {
        patch({ cameraAvailable: false });
      }
    }
  }, [patch]);

  const toggleShare = useCallback(async () => {
    const av = sessionRef.current?.audioVideo;
    if (!av) return;
    if (stateRef.current.sharing) {
      av.stopContentShare();
      return;
    }
    try {
      await av.startContentShareFromScreenCapture();
    } catch {
      /* the person cancelled the browser's share picker */
    }
  }, []);

  const bindTile = useCallback((tileId, el) => {
    if (tileId != null && el) sessionRef.current?.audioVideo.bindVideoElement(tileId, el);
  }, []);
  const unbindTile = useCallback((tileId) => {
    if (tileId != null) {
      try {
        sessionRef.current?.audioVideo.unbindVideoElement(tileId);
      } catch {
        /* tile already gone */
      }
    }
  }, []);

  // Always hang up when the component using this hook goes away.
  useEffect(() => {
    cancelledRef.current = false; // StrictMode runs mount, cleanup, mount; the second mount revives us
    return () => {
      cancelledRef.current = true;
      leave();
    };
  }, [leave]);

  return {
    ...state,
    canShare: canShareScreen(),
    join,
    leave,
    toggleMute,
    toggleCamera,
    toggleShare,
    bindTile,
    unbindTile,
  };
}
