import { useEffect, useRef, useState } from "react";
import DeviceCheck from "./DeviceCheck";
import PatientHelp from "./PatientHelp";
import VideoRoom from "./VideoRoom";
import { ApiError, patientApi } from "./api";
import { formatWait } from "./format";
import { useNow } from "./hooks";
import { messageFor } from "./messages";
import "./styles";

const REJOIN_KEY = "telehealth.rejoin";

// The link token is single-use. React StrictMode runs effects twice in development, so the
// redeem call is cached per token: a second effect run reuses the first call's result.
const redeemCache = new Map();
function redeemOnce(token) {
  if (!redeemCache.has(token)) redeemCache.set(token, patientApi.redeem(token));
  return redeemCache.get(token);
}

const readToken = () => window.location.hash.replace(/^#/, "").trim();
const loadRejoin = () => {
  try {
    return window.sessionStorage.getItem(REJOIN_KEY);
  } catch {
    return null;
  }
};
const saveRejoin = (value) => {
  try {
    window.sessionStorage.setItem(REJOIN_KEY, value);
  } catch {
    /* a refresh will then need the original link */
  }
};
const noop = () => {};

function Heading({ children }) {
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h1 className="th-h1" tabIndex={-1} ref={ref}>
      {children}
    </h1>
  );
}

/**
 * The page a patient lands on from their text message. No login: the link carries a
 * single-use token in the URL fragment, which this page swaps for a session token and
 * removes from the address bar.
 */
export default function PatientJoinPage({ clinicPhone }) {
  const [step, setStep] = useState("starting");
  // starting | consent | devices | waiting | live | left | ended | unavailable | problem
  const [problem, setProblem] = useState(null);
  const [joinInfo, setJoinInfo] = useState(null);
  const rejoin = useRef(null);
  const devices = useRef(null);
  const waitStart = useRef(Date.now());
  const redeemed = useRef(false);
  const nowMs = useNow(1000);

  const fail = (err) => {
    if (err instanceof ApiError && err.status === 410) {
      setStep(redeemed.current ? "ended" : "unavailable");
    } else {
      setProblem(messageFor(err));
      setStep("problem");
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = readToken();
        if (token) {
          const result = await redeemOnce(token);
          rejoin.current = result.rejoin_token;
          saveRejoin(result.rejoin_token);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        } else {
          rejoin.current = loadRejoin();
          if (!rejoin.current) {
            if (!cancelled) setStep("unavailable");
            return;
          }
        }
        redeemed.current = true;
        const status = await patientApi.status(rejoin.current);
        if (!cancelled) setStep(status.consented ? "devices" : "consent");
      } catch (err) {
        if (!cancelled) fail(err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While waiting, ask the server every few seconds whether the provider has let us in.
  useEffect(() => {
    if (step !== "waiting") return undefined;
    let stop = false;
    let busy = false;
    waitStart.current = Date.now();
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const status = await patientApi.status(rejoin.current);
        if (stop || !status.admitted) return;
        const info = await patientApi.media(rejoin.current);
        if (stop) return;
        setJoinInfo(info);
        setStep("live");
      } catch (err) {
        if (!stop) fail(err);
      } finally {
        busy = false;
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const agree = async () => {
    try {
      await patientApi.consent(rejoin.current);
      setStep("devices");
    } catch (err) {
      fail(err);
    }
  };

  return (
    <main className="th-root th-patient">
      {step === "starting" && <p role="status">Opening your visit…</p>}

      {step === "consent" && (
        <section>
          <Heading>Before you join</Heading>
          <p className="th-lede">You're about to start a video visit with your care team.</p>
          <ul className="th-plain-list">
            <li>Your provider can see and hear you during the visit.</li>
            <li>The visit isn't recorded.</li>
            <li>If you'd rather not use video, close this page and call the clinic to change your visit.</li>
          </ul>
          <div className="th-actions">
            <button type="button" className="th-btn th-btn--primary th-btn--big" onClick={agree}>
              I agree and want to continue
            </button>
          </div>
        </section>
      )}

      {step === "devices" && (
        <DeviceCheck
          continueLabel="Go to the waiting room"
          onReady={(choice) => {
            devices.current = choice;
            setStep("waiting");
          }}
        />
      )}

      {step === "waiting" && (
        <section>
          <Heading>You're in the waiting room</Heading>
          <p className="th-lede">Your provider will let you in shortly. Keep this page open.</p>
          <p className="th-timer th-timer--large" aria-label="Time waiting">
            {formatWait(nowMs - waitStart.current)}
          </p>
        </section>
      )}

      {step === "live" && (
        <div className="th-overlay">
          <VideoRoom
            joinInfo={joinInfo}
            devices={devices.current}
            remoteName="your provider"
            leaveLabel="Leave visit"
            onJoined={() => patientApi.presence(rejoin.current, "joined").catch(noop)}
            onLeft={(reason, code) => {
              patientApi.presence(rejoin.current, "left").catch(noop);
              if (reason === "left") setStep("left");
              else if (reason === "meeting-ended") setStep("ended");
              else {
                setProblem(messageFor(code));
                setStep("problem");
              }
            }}
          />
        </div>
      )}

      {step === "left" && (
        <section>
          <Heading>You left the visit</Heading>
          <p className="th-lede">If that was a mistake, you can go back in.</p>
          <div className="th-actions">
            <button type="button" className="th-btn th-btn--primary th-btn--big" onClick={() => setStep("waiting")}>
              Rejoin visit
            </button>
          </div>
        </section>
      )}

      {step === "ended" && (
        <section>
          <Heading>This visit has ended</Heading>
          <p className="th-lede">You can close this page.</p>
        </section>
      )}

      {step === "unavailable" && (
        <section>
          <Heading>This link can't be used</Heading>
          <p className="th-lede">
            It may have been used already or it may have expired. Call the clinic and ask them to send you a new link.
          </p>
        </section>
      )}

      {step === "problem" && (
        <section>
          <Heading>We couldn't connect you</Heading>
          <p className="th-lede" role="alert">{problem}</p>
          <div className="th-actions">
            <button type="button" className="th-btn th-btn--primary th-btn--big" onClick={() => setStep("devices")}>
              Check my camera and try again
            </button>
          </div>
        </section>
      )}

      {["devices", "waiting", "left", "problem", "unavailable"].includes(step) && <PatientHelp clinicPhone={clinicPhone} />}
    </main>
  );
}
