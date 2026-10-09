import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AuditTranscriptDialog from "../components/secureMessages/AuditTranscriptDialog";
import { secure, errorText } from "../components/secureMessages/secureApi";

export const ACTION_LABEL = {
  send: "Sent a message",
  retract: "Retracted a message",
  create_thread: "Started a conversation",
  open_patient_thread: "Opened a patient care-team conversation",
  joined_patient_thread: "Joined a patient care team",
  add_member: "Added someone",
  remove_member: "Removed someone",
  leave: "Left a conversation",
  view_image: "Viewed a picture",
  audit_read_transcript: "Read a transcript (audit)",
};

const stamp = (iso) => new Date(iso).toLocaleString();
// a datetime-local value ("2026-10-09T08:00") as an ISO time in the viewer's zone
const toIso = (local) => (local ? new Date(local).toISOString() : "");

/** Who sent, opened, joined or retracted what, and when. Message text is never shown here; transcripts are opened separately. */
export default function SecureMessagesAuditPage() {
  const [filters, setFilters] = useState({ action: "", user: "", patient: null, since: "", until: "" });
  const [people, setPeople] = useState([]);
  const [events, setEvents] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState(null);

  const params = useCallback(
    (before) => ({
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.user ? { user: filters.user } : {}),
      ...(filters.patient ? { patient: filters.patient.id } : {}),
      ...(filters.since ? { since: toIso(filters.since) } : {}),
      ...(filters.until ? { until: toIso(filters.until) } : {}),
      ...(before ? { before } : {}),
    }),
    [filters]
  );

  const load = useCallback(
    async (append = false) => {
      setLoading(true);
      try {
        const data = await secure.audit(params(append && events.length ? events[events.length - 1].id : null));
        setEvents((cur) => (append ? [...cur, ...data.events] : data.events));
        setMore(!!data.has_more);
        setError("");
      } catch (err) {
        setError(errorText(err, "Could not load the audit log."));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, events.length]
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    secure
      .people("", true)
      .then((d) => setPeople(d.people || []))
      .catch(() => setPeople([]));
  }, []);

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        Secure Messaging Audit Log
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Who did what, newest first. Message text is not shown here; open a conversation to read its transcript (that is logged too).
      </Typography>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
        <TextField select size="small" label="Action" value={filters.action} onChange={set("action")} sx={{ minWidth: 240 }} inputProps={{ "data-testid": "filter-action" }}>
          <MenuItem value="">All actions</MenuItem>
          {Object.entries(ACTION_LABEL).map(([k, v]) => (
            <MenuItem key={k} value={k}>
              {v}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Person" value={filters.user} onChange={set("user")} sx={{ minWidth: 220 }} inputProps={{ "data-testid": "filter-user" }}>
          <MenuItem value="">Everyone</MenuItem>
          {people.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name} ({p.role})
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" type="datetime-local" label="From" InputLabelProps={{ shrink: true }} value={filters.since} onChange={set("since")} inputProps={{ "data-testid": "filter-since" }} />
        <TextField size="small" type="datetime-local" label="To" InputLabelProps={{ shrink: true }} value={filters.until} onChange={set("until")} inputProps={{ "data-testid": "filter-until" }} />
        {filters.patient && (
          <Chip color="primary" label={`Patient: ${filters.patient.name}`} onDelete={() => setFilters((f) => ({ ...f, patient: null }))} data-testid="patient-filter-chip" />
        )}
        <Button onClick={() => setFilters({ action: "", user: "", patient: null, since: "", until: "" })}>Clear</Button>
      </Paper>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small" data-testid="audit-table">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Who</TableCell>
              <TableCell>What</TableCell>
              <TableCell>Patient</TableCell>
              <TableCell>Conversation</TableCell>
              <TableCell>Detail</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id} data-testid={`audit-row-${e.id}`}>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{stamp(e.at)}</TableCell>
                <TableCell>{e.user || "—"}</TableCell>
                <TableCell>{ACTION_LABEL[e.action] || e.action}</TableCell>
                <TableCell>
                  {e.patient ? (
                    <Button size="small" onClick={() => setFilters((f) => ({ ...f, patient: { id: e.patient_id, name: e.patient } }))}>
                      {e.patient}
                    </Button>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {e.thread ? (
                    <Button size="small" onClick={() => setTranscript(e.thread)} data-testid={`open-transcript-${e.id}`}>
                      Read transcript
                    </Button>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{e.detail}</TableCell>
              </TableRow>
            ))}
            {!loading && events.length === 0 && !error && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: "center", color: "text.secondary" }} data-testid="audit-empty">
                  Nothing matches these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      {more && (
        <Box sx={{ textAlign: "center", mt: 2 }}>
          <Button onClick={() => load(true)} disabled={loading} data-testid="audit-more">
            Show older
          </Button>
        </Box>
      )}
      <AuditTranscriptDialog threadId={transcript} onClose={() => setTranscript(null)} />
    </Box>
  );
}
