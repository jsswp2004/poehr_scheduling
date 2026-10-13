import { useCallback, useEffect, useRef, useState } from "react";
import { patientApi } from "./api";
import { loadDevicePrefs, saveDevicePrefs } from "./devicePrefs";
import { measureLatency } from "./network";
import { playChime } from "./sound";

const NET_COPY = {
  checking: "Checking your connection…",
  good: "Your connection to the visit service is fast.",
  fair: "Your connection is usable. Video may be less sharp.",
  slow: "Your connection is slow. Move closer to your router, or plan to turn your camera off.",
  unreachable: "We can't reach the visit service. Check your internet connection.",
};

function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Pre-join check: permissions, camera preview, microphone level, speaker test and a
 * connection check. Calls onReady({ audioInputId, videoInputId }) when the person continues.
 * Camera is optional; microphone is required.
 */
export default function DeviceCheck({ onReady, pingFn = patientApi.ping, continueLabel = "Continue", heading }) {
  const [phase, setPhase] = useState("asking"); // asking | ready | blocked | unsupported
  const [blockReason, setBlockReason] = useState(null);
  const [mics, setMics] = useState([]);
  const [cams, setCams] = useState([]);
  const [micId, setMicId] = useState("");
  const [camId, setCamId] = useState("");
  const [level, setLevel] = useState(0);
  const [net, setNet] = useState({ status: "checking" });
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const headingRef = useRef(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    !!window.RTCPeerConnection;

  const acquire = useCallback(async (wantMic, wantCam) => {
    stopStream(streamRef.current);
    streamRef.current = null;
    const audio = wantMic ? { deviceId: { exact: wantMic } } : true;
    const video = wantCam ? { deviceId: { exact: wantCam } } : true;
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio, video });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio });
      } catch (err) {
        setBlockReason(err?.name === "NotAllowedError" ? "permission" : "no-device");
        setPhase("blocked");
        return;
      }
    }
    streamRef.current = stream;
    const all = await navigator.mediaDevices.enumerateDevices();
    setMics(all.filter((d) => d.kind === "audioinput"));
    setCams(all.filter((d) => d.kind === "videoinput"));
    setMicId(stream.getAudioTracks()[0]?.getSettings().deviceId || "");
    setCamId(stream.getVideoTracks()[0]?.getSettings().deviceId || "");
    setPhase("ready");
  }, []);

  useEffect(() => {
    if (!supported) {
      setPhase("unsupported");
      return undefined;
    }
    const prefs = loadDevicePrefs();
    acquire(prefs.audioInputId, prefs.videoInputId);
    return () => stopStream(streamRef.current);
  }, [supported, acquire]);

  // Camera preview
  useEffect(() => {
    const el = videoRef.current;
    if (el && streamRef.current && phase === "ready") {
      el.srcObject = streamRef.current;
    }
  }, [phase, camId, micId]);

  // Microphone level meter
  useEffect(() => {
    if (phase !== "ready" || !streamRef.current?.getAudioTracks().length) return undefined;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return undefined;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream(streamRef.current.getAudioTracks())).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let raf;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      setLevel(Math.min(100, Math.round(Math.sqrt(sum / data.length) * 300)));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ctx.close();
    };
  }, [phase, micId]);

  const runNetworkCheck = useCallback(async () => {
    setNet({ status: "checking" });
    setNet(await measureLatency(pingFn));
  }, [pingFn]);

  useEffect(() => {
    runNetworkCheck();
  }, [runNetworkCheck]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const proceed = () => {
    const choice = { audioInputId: micId || null, videoInputId: camId || null };
    stopStream(streamRef.current); // the meeting opens its own streams
    streamRef.current = null;
    saveDevicePrefs({ audioInputId: choice.audioInputId, videoInputId: choice.videoInputId });
    onReady(choice);
  };

  return (
    <section className="th-check" aria-labelledby="th-check-h">
      <h1 id="th-check-h" className="th-h1" tabIndex={-1} ref={headingRef}>
        {heading || "Check your camera and microphone"}
      </h1>

      {phase === "unsupported" && (
        <p className="th-callout th-callout--alert" role="alert">
          This browser can't run video visits. Open this page in the latest Chrome, Safari, Edge or Firefox.
        </p>
      )}

      {phase === "blocked" && (
        <div className="th-callout th-callout--alert" role="alert">
          <p>
            {blockReason === "permission"
              ? "Your browser blocked the microphone. Choose Allow when it asks, or turn it on in the site settings next to the web address."
              : "We couldn't find a microphone. Plug one in or check that another app isn't using it."}
          </p>
          <button type="button" className="th-btn" onClick={() => acquire(micId, camId)}>
            Try again
          </button>
        </div>
      )}

      {phase === "asking" && <p role="status">Waiting for your browser to ask for camera and microphone access…</p>}

      {phase === "ready" && (
        <>
          <div className="th-preview">
            {streamRef.current?.getVideoTracks().length ? (
              <video ref={videoRef} autoPlay muted playsInline aria-label="Your camera preview" />
            ) : (
              <p className="th-preview-empty">No camera found. You can still join with audio only.</p>
            )}
          </div>

          <div className="th-fields">
            <label className="th-field">
              <span>Microphone</span>
              <select
                value={micId}
                onChange={(e) => {
                  setMicId(e.target.value);
                  acquire(e.target.value, camId);
                }}
              >
                {mics.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            {cams.length > 0 && (
              <label className="th-field">
                <span>Camera</span>
                <select
                  value={camId}
                  onChange={(e) => {
                    setCamId(e.target.value);
                    acquire(micId, e.target.value);
                  }}
                >
                  {cams.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="th-meter-row">
            <span id="th-meter-label">Say something to test your microphone</span>
            <div
              className="th-meter"
              role="meter"
              aria-labelledby="th-meter-label"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={level}
            >
              <span style={{ width: `${level}%` }} />
            </div>
          </div>

          <button type="button" className="th-btn th-btn--quiet" onClick={playChime}>
            Play a test sound
          </button>
        </>
      )}

      <p className={`th-net th-net--${net.status}`} role="status">
        {NET_COPY[net.status]}
        {net.ms != null && ` (${net.ms} ms)`}{" "}
        {net.status !== "checking" && (
          <button type="button" className="th-link" onClick={runNetworkCheck}>
            Check again
          </button>
        )}
      </p>

      <div className="th-actions">
        <button type="button" className="th-btn th-btn--primary" disabled={phase !== "ready"} onClick={proceed}>
          {continueLabel}
        </button>
      </div>
    </section>
  );
}
