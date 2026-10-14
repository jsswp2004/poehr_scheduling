import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader } from "../patientHeader/headerApi";
import { captureSupported, startCapture } from "./audioCapture";
import { applyVoiceCommands } from "./commands";
import { decodeMessage, encodeAudioEvent, readTranscriptEvent } from "./eventStream";

// Only one microphone at a time: starting a new dictation stops the one already running.
let activeStop = null;

const FINISH_WAIT_MS = 2000; // how long to wait for the last words after the mic stops

function explain(err) {
  const status = err?.response?.status;
  if (status === 403) return "Dictation is not turned on for your account.";
  if (status === 429) return "Too many dictation requests. Try again in a minute.";
  if (status === 503) return "Dictation is not available right now.";
  if (err?.name === "NotAllowedError" || err?.name === "SecurityError") return "The microphone is blocked. Allow it in your browser and try again.";
  if (err?.name === "NotFoundError") return "No microphone was found.";
  return "Dictation could not start.";
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("timeout"));
    }, 8000);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("socket"));
    };
  });
}

/**
 * Dictate with AWS Transcribe Medical.
 *   onText(text)  is called with each finished phrase (voice commands already applied)
 * Returns { supported, status: "idle"|"connecting"|"listening", partial, error, level, start, stop, toggle }.
 */
export default function useDictation({ onText } = {}) {
  const [status, setStatus] = useState("idle");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const run = useRef(null); // the live session: { ws, capture, sessionId, startedAt, stopping }
  const mounted = useRef(true);
  const starting = useRef(false);

  const safe = (fn) => {
    if (mounted.current) fn();
  };

  const stop = useCallback(async () => {
    const session = run.current;
    if (!session || session.stopping) return;
    session.stopping = true;
    session.capture && session.capture.stop();
    safe(() => setLevel(0));
    const { ws } = session;
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(encodeAudioEvent(new Uint8Array(0))); // "that's all the audio"
      } catch (e) {
        /* closing anyway */
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, FINISH_WAIT_MS);
        ws.addEventListener("close", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    try {
      ws.close();
    } catch (e) {
      /* already closed */
    }
    const seconds = Math.round((Date.now() - session.startedAt) / 1000);
    authHeader()
      .then((headers) => api.post(apiEndpoints.dictationSessionEnd, { session_id: session.sessionId, seconds }, { headers }))
      .catch(() => {});
    if (run.current === session) run.current = null;
    if (activeStop === stop) activeStop = null;
    safe(() => {
      setStatus("idle");
      setPartial("");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(async () => {
    if (run.current || starting.current || !captureSupported()) return;
    starting.current = true;
    if (activeStop) await activeStop();
    setError("");
    setPartial("");
    setStatus("connecting");
    let session = null;
    try {
      const headers = await authHeader();
      const { data } = await api.post(apiEndpoints.dictationStreamUrl, {}, { headers });
      const ws = await openSocket(data.url);
      session = { ws, capture: null, sessionId: data.session_id, startedAt: Date.now(), stopping: false };
      run.current = session;

      ws.onmessage = (event) => {
        let parsed = null;
        try {
          parsed = readTranscriptEvent(decodeMessage(event.data));
        } catch (e) {
          return;
        }
        if (!parsed) return;
        if (parsed.type === "error") {
          safe(() => setError("Dictation stopped: the speech service reported a problem."));
          stop();
          return;
        }
        parsed.results.forEach((r) => {
          if (r.partial) {
            safe(() => setPartial(r.text));
            return;
          }
          safe(() => setPartial(""));
          const { text, stop: wantsStop } = applyVoiceCommands(r.text);
          if (text && onTextRef.current) onTextRef.current(text);
          if (wantsStop) stop();
        });
      };
      ws.onclose = () => {
        if (run.current === session && !session.stopping) {
          safe(() => setError("Dictation connection was lost."));
          session.stopping = true;
          session.capture && session.capture.stop();
          run.current = null;
          if (activeStop === stop) activeStop = null;
          safe(() => {
            setStatus("idle");
            setPartial("");
            setLevel(0);
          });
        }
      };

      session.capture = await startCapture({
        onChunk: (bytes) => {
          if (ws.readyState === WebSocket.OPEN && !session.stopping) ws.send(encodeAudioEvent(bytes));
        },
        onLevel: (value) => safe(() => setLevel(value)),
      });
      activeStop = stop;
      safe(() => setStatus("listening"));
    } catch (err) {
      if (session) {
        session.stopping = true;
        try {
          session.ws.close();
        } catch (e) {
          /* ignore */
        }
        run.current = null;
      }
      safe(() => {
        setError(explain(err));
        setStatus("idle");
      });
    } finally {
      starting.current = false;
    }
  }, [stop]);

  const toggle = useCallback(() => (run.current || status === "listening" ? stop() : start()), [start, stop, status]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
    };
  }, [stop]);

  return { supported: captureSupported(), status, partial, error, level, start, stop, toggle };
}
