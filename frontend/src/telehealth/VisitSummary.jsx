import { useEffect, useState } from "react";
import { staffApi } from "./api";
import { billingLine } from "./billingText";
import { messageFor } from "./messages";

/**
 * After a visit: the provider says where the patient was and how the visit was held,
 * and gets the draft note and the billing labels that follow from those answers.
 * Only the provider can save. Others see the result.
 */
export default function VisitSummary({ sessionId, canAttest = true, onSaved }) {
  const [record, setRecord] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [location, setLocation] = useState("");
  const [state, setState] = useState("");
  const [modality, setModality] = useState("audio_video");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const apply = (next) => {
    setRecord(next);
    setLocation(next.patient_location || "");
    setState(next.patient_state || "");
    setModality(next.modality || "audio_video");
  };

  useEffect(() => {
    let cancelled = false;
    staffApi
      .visitRecord(sessionId)
      .then((next) => !cancelled && apply(next))
      .catch((err) => {
        // 404 just means the note hasn't been drafted yet. Anything else is worth saying.
        if (!cancelled && err.status !== 404) setError(messageFor(err));
      })
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const save = async (event) => {
    event.preventDefault();
    if (!location) {
      setError("Choose where the patient was during the visit.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      apply(await staffApi.saveVisitRecord(sessionId, { patient_location: location, patient_state: state, modality }));
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSaving(false);
    }
  };

  const copyNote = async () => {
    try {
      await navigator.clipboard.writeText(record.note_text);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Couldn't copy. Select the text and copy it yourself.");
    }
  };

  const line = billingLine(record);

  return (
    <div className="th-summary">
      {canAttest ? (
        <form onSubmit={save} noValidate>
          <fieldset className="th-fieldset">
            <legend className="th-h3">Where was the patient during the visit?</legend>
            <label className="th-choice">
              <input type="radio" name="th-location" value="home" checked={location === "home"} onChange={() => setLocation("home")} />
              At home
            </label>
            <label className="th-choice">
              <input type="radio" name="th-location" value="other" checked={location === "other"} onChange={() => setLocation("other")} />
              Somewhere else, such as work, a facility or a car
            </label>
          </fieldset>

          <label className="th-field th-field--short">
            State the patient was in (optional)
            <input
              type="text"
              value={state}
              maxLength={2}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setState(e.target.value.replace(/[^a-zA-Z]/g, ""))}
            />
          </label>

          <fieldset className="th-fieldset">
            <legend className="th-h3">How was the visit held?</legend>
            <label className="th-choice">
              <input type="radio" name="th-modality" value="audio_video" checked={modality === "audio_video"} onChange={() => setModality("audio_video")} />
              Audio and video
            </label>
            <label className="th-choice">
              <input type="radio" name="th-modality" value="audio_only" checked={modality === "audio_only"} onChange={() => setModality("audio_only")} />
              Audio only, because video didn't work
            </label>
          </fieldset>

          <div className="th-actions">
            <button type="submit" className="th-btn th-btn--primary" disabled={saving}>
              {saving ? "Saving…" : "Save visit details"}
            </button>
          </div>
        </form>
      ) : (
        loaded && !record?.location_confirmed && <p>The provider hasn't confirmed where the patient was yet.</p>
      )}

      {error && (
        <p className="th-callout th-callout--alert" role="alert">
          {error}
        </p>
      )}

      {saved && (
        <p className="th-callout th-callout--info" role="status">
          Saved.
        </p>
      )}

      {line && (
        <p className="th-billing">
          <strong>For billing:</strong> {line}. The provider or coder still chooses the visit code.
        </p>
      )}

      {record?.note_text && (
        <div className="th-note">
          <label className="th-h3" htmlFor="th-note-text">
            Draft note
          </label>
          <p className="th-hint">
            {record.note_pushed
              ? "A draft was started in the chart. This is the same text."
              : "This hasn't gone to the chart. Copy it into the visit note."}
          </p>
          <textarea id="th-note-text" className="th-note-text" readOnly rows={8} value={record.note_text} />
          <div className="th-actions">
            <button type="button" className="th-btn" onClick={copyNote}>
              Copy note
            </button>
            {copied && (
              <span role="status" className="th-hint">
                Copied.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
