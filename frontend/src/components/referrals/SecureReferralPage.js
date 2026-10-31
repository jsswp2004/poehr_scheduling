import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { LinkApiError, linkApi, linkErrorText } from "./secureReferralApi";

const KEY_STORE = "referral.key";
const SESSION_STORE = "referral.session";

const read = (name) => {
  try {
    return window.sessionStorage.getItem(name);
  } catch {
    return null;
  }
};
const write = (name, value) => {
  try {
    if (value == null) window.sessionStorage.removeItem(name);
    else window.sessionStorage.setItem(name, value);
  } catch {
    /* a refresh will then need the original link */
  }
};

// Opening a link is recorded and may send a code, so React StrictMode's second effect run reuses the first call.
const openCache = new Map();
const openOnce = (key) => {
  if (!openCache.has(key)) openCache.set(key, linkApi.open(key));
  return openCache.get(key);
};

const SEX = { M: "Male", F: "Female", X: "Other / unspecified" };
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : "");
const URGENCY_COLOR = { routine: "default", urgent: "warning", emergent: "error" };

const TEXT_FOR = {
  schedule: { label: "Note to the referring clinic (optional)", required: false },
  seen: { label: "Note to the referring clinic (optional)", required: false },
  needs_info: { label: "What information do you need?", required: true },
  decline: { label: "Reason for declining", required: true },
  report: { label: "Findings, impression and recommendations", required: false },
};

function Shell({ organization, children }) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <LockOutlinedIcon fontSize="small" sx={{ mr: 1 }} aria-hidden />
          <Typography variant="h6" component="p" sx={{ flex: 1 }}>
            Secure referral{organization ? ` · from ${organization}` : ""}
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 3 }}>
        {children}
      </Container>
    </Box>
  );
}

function Field({ label, children }) {
  if (children === "" || children == null) return null;
  return (
    <Box sx={{ display: "flex", gap: 1, mb: 0.5, flexWrap: "wrap" }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 130, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ whiteSpace: "pre-wrap", flex: 1, minWidth: 160 }}>
        {children}
      </Typography>
    </Box>
  );
}

function Conversation({ items, organization }) {
  if (!items?.length) return null;
  const line = (c) => {
    if (c.from === "clinic") return `Reply from ${organization}`;
    if (c.type === "scheduled" || c.type === "rescheduled")
      return `You scheduled the appointment for ${fmtDateTime(c.scheduled_for)}${c.location ? ` at ${c.location}` : ""}`;
    if (c.type === "seen") return "You confirmed the patient was seen";
    if (c.type === "needs_info") return "You asked for more information";
    if (c.type === "declined") return "You declined the referral";
    if (c.type === "report_received") return "You sent your consult";
    return "You replied";
  };
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="referral-conversation">
      <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
        Conversation
      </Typography>
      {items.map((c, i) => (
        <Box key={`${c.at}-${i}`} sx={{ mb: 1 }}>
          <Typography variant="body2">
            <strong>{line(c)}</strong> · {fmtDateTime(c.at)}
          </Typography>
          {c.note && (
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
              {c.note}
            </Typography>
          )}
          {c.files?.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              Attached: {c.files.join(", ")}
            </Typography>
          )}
        </Box>
      ))}
    </Paper>
  );
}

function ReplyForm({ packet, session, onSent }) {
  const replies = useMemo(() => packet.replies || [], [packet.replies]);
  const [action, setAction] = useState(replies[0]?.action || "");
  const [message, setMessage] = useState("");
  const [when, setWhen] = useState("");
  const [where, setWhere] = useState("");
  const [seenOn, setSeenOn] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const picker = useRef(null);

  useEffect(() => {
    if (!replies.some((r) => r.action === action)) setAction(replies[0]?.action || "");
  }, [replies, action]);

  const addFiles = (list) => {
    const incoming = Array.from(list || []);
    const limit = packet.max_file_mb * 1024 * 1024;
    const all = [...files, ...incoming];
    if (all.length > packet.max_files) return setError(`You can attach up to ${packet.max_files} files.`);
    if (incoming.some((f) => f.size > limit)) return setError(`Each file must be ${packet.max_file_mb} MB or smaller.`);
    setError("");
    setFiles(all);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const cfg = TEXT_FOR[action] || {};
    if (action === "schedule" && !when) return setError("Give the appointment date and time.");
    if (cfg.required && !message.trim()) return setError("Please fill in the box above before sending.");
    if (action === "report" && !message.trim() && files.length === 0) return setError("Type your findings or attach the consult letter.");
    const form = new FormData();
    form.append("action", action);
    if (message.trim()) form.append("message", message.trim());
    if (action === "schedule") {
      form.append("scheduled_for", new Date(when).toISOString());
      if (where.trim()) form.append("appointment_location", where.trim());
    }
    if ((action === "report" || action === "seen") && seenOn) form.append("seen_on", seenOn);
    files.forEach((f) => form.append("files", f));
    setBusy(true);
    try {
      const updated = await linkApi.reply(session, form);
      setMessage("");
      setWhen("");
      setWhere("");
      setSeenOn("");
      setFiles([]);
      onSent(updated);
    } catch (err) {
      if (err instanceof LinkApiError && err.status === 410) onSent(null);
      else setError(linkErrorText(err, "Your reply could not be sent. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const cfg = TEXT_FOR[action] || {};
  return (
    <Paper variant="outlined" sx={{ p: 2 }} component="form" onSubmit={submit} data-testid="referral-reply">
      <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
        Your reply
      </Typography>
      <Stack spacing={2}>
        {error && (
          <Alert severity="error" role="alert" data-testid="referral-reply-error">
            {error}
          </Alert>
        )}
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={action}
          onChange={(_e, value) => value && setAction(value)}
          aria-label="How you are replying"
          sx={{ flexWrap: "wrap" }}
        >
          {replies.map((r) => (
            <ToggleButton key={r.action} value={r.action} data-testid={`reply-${r.action}`}>
              {r.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {action === "schedule" && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              size="small"
              fullWidth
              type="datetime-local"
              label="Appointment date and time"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ "data-testid": "reply-when" }}
            />
            <TextField
              size="small"
              fullWidth
              label="Where"
              placeholder={packet.destination_name}
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              inputProps={{ "data-testid": "reply-where" }}
            />
          </Stack>
        )}
        {(action === "report" || action === "seen") && (
          <TextField
            size="small"
            type="date"
            label={action === "seen" ? "Date seen (leave blank for today)" : "Date seen"}
            value={seenOn}
            onChange={(e) => setSeenOn(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ maxWidth: 220 }}
            inputProps={{ "data-testid": "reply-seen" }}
          />
        )}
        <TextField
          multiline
          minRows={action === "report" ? 6 : 3}
          label={cfg.label || "Message"}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          inputProps={{ "data-testid": "reply-message", maxLength: 4000 }}
        />

        <Box>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
            data-testid="reply-file-input"
          />
          <Button variant="outlined" size="small" onClick={() => picker.current?.click()} disabled={files.length >= packet.max_files}>
            Attach consult letter or report
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            PDF, JPEG or PNG, up to {packet.max_file_mb} MB each, up to {packet.max_files} files
          </Typography>
          {files.map((f, i) => (
            <Stack key={`${f.name}-${i}`} direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }} data-testid="reply-file">
              <Typography variant="body2">{f.name}</Typography>
              <Button size="small" onClick={() => setFiles(files.filter((_x, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                Remove
              </Button>
            </Stack>
          ))}
        </Box>

        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" variant="contained" disabled={busy || !action} data-testid="reply-send">
            {busy ? <CircularProgress size={18} /> : "Send reply"}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}

function Packet({ packet, session, onUpdated, onGone }) {
  const [sent, setSent] = useState(false);
  const done = (updated) => {
    if (updated === null) return onGone();
    setSent(true);
    onUpdated(updated);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };
  const p = packet.patient || {};
  const allergies = packet.allergies || {};
  return (
    <Stack spacing={2}>
      {sent && (
        <Alert severity="success" role="status" data-testid="referral-reply-sent">
          Your reply was sent. {packet.organization} can see it now.
        </Alert>
      )}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip size="small" label={packet.status_label} data-testid="referral-packet-status" />
        <Chip size="small" variant="outlined" color={URGENCY_COLOR[packet.urgency] || "default"} label={packet.urgency_label} />
      </Stack>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "3fr 2fr" } }}>
        <Paper variant="outlined" sx={{ p: 2 }} data-testid="referral-packet">
          <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
            Referral{packet.specialty ? ` · ${packet.specialty}` : ""}
          </Typography>
          <Field label="Patient">{[p.name, [p.age != null ? `${p.age} years` : "", SEX[p.sex] || ""].filter(Boolean).join(", ")].filter(Boolean).join(" — ")}</Field>
          <Field label="Reason">{packet.reason}</Field>
          <Field label="Question">{packet.clinical_question}</Field>
          <Field label="Diagnosis">{packet.diagnosis}</Field>
          <Field label="Referring">{[packet.referring?.name, packet.referring?.phone].filter(Boolean).join(" · ")}</Field>
          <Field label="Appointment">
            {packet.scheduled_for ? `${fmtDateTime(packet.scheduled_for)}${packet.appointment_location ? ` · ${packet.appointment_location}` : ""}` : ""}
          </Field>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2 }} data-testid="referral-packet-allergies">
          <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
            Allergies when sent
          </Typography>
          {(allergies.items || []).length > 0 ? (
            allergies.items.map((a, i) => (
              <Typography key={`${a.substance}-${i}`} variant="body2">
                {a.substance}
                {a.reaction ? ` (${a.reaction})` : ""}
              </Typography>
            ))
          ) : (
            <Typography variant="body2">{allergies.none_known ? "No known allergies" : "None recorded"}</Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            A snapshot from the day this was sent. The rest of the chart is not shared.
          </Typography>
        </Paper>
      </Box>

      <Conversation items={packet.conversation} organization={packet.organization} />

      {(packet.replies || []).length > 0 ? (
        <ReplyForm packet={packet} session={session} onSent={done} />
      ) : (
        <Alert severity="info" data-testid="referral-no-reply">
          {packet.status === "report_received"
            ? `${packet.organization} has your consult. Thank you.`
            : "No reply is needed right now."}
        </Alert>
      )}
      <Typography variant="caption" color="text.secondary">
        This page is private to you. Please do not forward the link.{" "}
        {packet.expires_at ? `It stops working on ${new Date(packet.expires_at).toLocaleDateString()}.` : ""}
      </Typography>
    </Stack>
  );
}

/**
 * The page a specialist lands on from the text or email. No login. The link's key (after the "#") is swapped
 * for a code check and then a short session; the key is taken out of the address bar straight away.
 */
export default function SecureReferralPage() {
  const [step, setStep] = useState("starting"); // starting | code | ready | unavailable | problem
  const [organization, setOrganization] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [packet, setPacket] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const session = useRef(null);
  const key = useRef(null);

  // keep search engines and referrers away from a page that may show patient details
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Secure referral";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    const referrer = document.createElement("meta");
    referrer.name = "referrer";
    referrer.content = "no-referrer";
    document.head.append(robots, referrer);
    return () => {
      document.title = previousTitle;
      robots.remove();
      referrer.remove();
    };
  }, []);

  const showPacket = useCallback(async (token) => {
    const data = await linkApi.packet(token);
    session.current = token;
    setPacket(data);
    setOrganization(data.organization || "");
    setStep("ready");
  }, []);

  const gone = useCallback(() => {
    write(SESSION_STORE, null);
    write(KEY_STORE, null);
    setStep("unavailable");
  }, []);

  const fail = useCallback(
    (err) => {
      if (err instanceof LinkApiError && err.status === 410) return gone();
      setError(linkErrorText(err));
      setStep("problem");
    },
    [gone]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fromAddress = window.location.hash.replace(/^#/, "").trim();
        if (fromAddress) {
          write(KEY_STORE, fromAddress);
          write(SESSION_STORE, null);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
        const saved = !fromAddress ? read(SESSION_STORE) : null;
        if (saved) {
          try {
            await showPacket(saved);
            return;
          } catch (err) {
            if (!(err instanceof LinkApiError) || err.status !== 410) throw err;
            write(SESSION_STORE, null);
          }
        }
        key.current = read(KEY_STORE);
        if (!key.current) {
          if (!cancelled) setStep("unavailable");
          return;
        }
        const res = await openOnce(key.current);
        if (cancelled) return;
        setOrganization(res.organization || "");
        if (res.needs_code) {
          setSentTo(res.sent_to || "");
          setStep("code");
        } else {
          write(SESSION_STORE, res.session);
          await showPacket(res.session);
        }
      } catch (err) {
        if (!cancelled) fail(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fail, showPacket]);

  const verify = async (e) => {
    e.preventDefault();
    setError("");
    setNote("");
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code.");
    setBusy(true);
    try {
      const res = await linkApi.verify(key.current, code.trim());
      write(SESSION_STORE, res.session);
      await showPacket(res.session);
    } catch (err) {
      if (err instanceof LinkApiError && err.status === 410) gone();
      else setError(linkErrorText(err, "That code isn't right."));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError("");
    setNote("");
    setBusy(true);
    try {
      const res = await linkApi.resendCode(key.current);
      setSentTo(res.sent_to || sentTo);
      setNote("A new code is on its way.");
    } catch (err) {
      if (err instanceof LinkApiError && err.status === 410) gone();
      else setError(linkErrorText(err, "A new code could not be sent."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell organization={organization}>
      {step === "starting" && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }} role="status" aria-label="Opening the referral">
          <CircularProgress />
        </Box>
      )}

      {step === "code" && (
        <Paper variant="outlined" sx={{ p: 3, maxWidth: 440, mx: "auto" }} component="form" onSubmit={verify} data-testid="referral-code-step">
          <Typography variant="h6" component="h1" gutterBottom>
            Confirm it's you
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            We sent a 6-digit code{sentTo ? ` to ${sentTo}` : ""}. It works for 15 minutes.
          </Typography>
          <Stack spacing={2}>
            {error && (
              <Alert severity="error" role="alert" data-testid="referral-code-error">
                {error}
              </Alert>
            )}
            {note && <Alert severity="success" role="status">{note}</Alert>}
            <TextField
              label="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
              autoComplete="one-time-code"
              inputProps={{ inputMode: "numeric", "data-testid": "referral-code-input" }}
            />
            <Button type="submit" variant="contained" disabled={busy} data-testid="referral-code-submit">
              {busy ? <CircularProgress size={18} /> : "Open referral"}
            </Button>
            <Button size="small" onClick={resend} disabled={busy} data-testid="referral-code-resend">
              Send me a new code
            </Button>
          </Stack>
        </Paper>
      )}

      {step === "ready" && packet && (
        <Packet packet={packet} session={session.current} onUpdated={setPacket} onGone={gone} />
      )}

      {step === "unavailable" && (
        <Paper variant="outlined" sx={{ p: 3, maxWidth: 520, mx: "auto" }} data-testid="referral-unavailable">
          <Typography variant="h6" component="h1" gutterBottom>
            This link isn't available
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2">
            It may have expired, been turned off, or the referral may be closed. If you still need to respond, contact the clinic and
            ask them to send a new link.
          </Typography>
        </Paper>
      )}

      {step === "problem" && (
        <Alert severity="error" role="alert" data-testid="referral-problem">
          {error || "Something went wrong."} Please reload the page, or ask the clinic to send the link again.
        </Alert>
      )}
    </Shell>
  );
}
