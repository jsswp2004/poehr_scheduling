import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Pagination, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
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

// Twelve events a screen. The server hands them over 100 at a time; more are fetched when the last loaded page is reached.
export const AUDIT_ROWS_PER_PAGE = 12;

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
  const [page, setPage] = useState(1);
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("md"));

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
    // a new filter starts again from the newest event
    setPage(1);
    setMore(false);
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(events.length / AUDIT_ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = events.slice((currentPage - 1) * AUDIT_ROWS_PER_PAGE, currentPage * AUDIT_ROWS_PER_PAGE);

  // reaching the last loaded page fetches the next batch of older events
  useEffect(() => {
    if (more && !loading && currentPage >= totalPages) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [more, loading, currentPage, totalPages]);

  useEffect(() => {
    secure
      .people("", true)
      .then((d) => setPeople(d.people || []))
      .catch(() => setPeople([]));
  }, []);

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const clearAll = () => setFilters({ action: "", user: "", patient: null, since: "", until: "" });
  const filtering = !!(filters.action || filters.user || filters.patient || filters.since || filters.until);
  const from = events.length ? (currentPage - 1) * AUDIT_ROWS_PER_PAGE + 1 : 0;
  const to = Math.min(currentPage * AUDIT_ROWS_PER_PAGE, events.length);

  return (
    <Box
      sx={{
        height: "calc(100vh - 140px)",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        borderRadius: 2,
        px: 2,
        pt: 1,
        pb: 1,
        overflow: "hidden",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.75, flexWrap: "wrap", flexShrink: 0 }}>
        <Typography variant="h5">Secure Messaging Audit Log</Typography>
        <Typography variant="body2" color="text.secondary" aria-live="polite">
          {events.length}
          {more ? "+" : ""} {events.length === 1 ? "event" : "events"}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1, flexShrink: 0 }}>
        Who did what, newest first. Message text is not shown here; open a conversation to read its transcript (that is logged too).
      </Typography>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center", mb: 1, flexShrink: 0 }}>
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
        <Button onClick={clearAll} disabled={!filtering}>
          Clear
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 1, flexShrink: 0 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", opacity: loading && events.length ? 0.6 : 1, transition: "opacity 120ms" }}>
        {events.length === 0 ? (
          !error && (
            <Paper variant="outlined" sx={{ textAlign: "center", py: 6, px: 2, color: "text.secondary" }} data-testid={loading ? "audit-loading" : "audit-empty"}>
              {loading ? "Loading the audit log…" : "Nothing matches these filters."}
            </Paper>
          )
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, minHeight: 0 }}>
            <Table stickyHeader size="small" sx={{ tableLayout: "fixed", minWidth: 900 }} data-testid="audit-table">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 170 }}>When</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 150 }}>Who</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 230 }}>What</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 170 }}>Patient</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 150 }}>Conversation</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Detail</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map((e) => (
                  <TableRow key={e.id} hover data-testid={`audit-row-${e.id}`}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{stamp(e.at)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap title={e.user || ""}>
                        {e.user || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap title={ACTION_LABEL[e.action] || e.action}>
                        {ACTION_LABEL[e.action] || e.action}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {e.patient ? (
                        <Button
                          size="small"
                          onClick={() => setFilters((f) => ({ ...f, patient: { id: e.patient_id, name: e.patient } }))}
                          sx={{ maxWidth: "100%", justifyContent: "flex-start", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", textAlign: "left" }}
                        >
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
                    <TableCell>
                      <Typography variant="body2" noWrap title={e.detail || ""}>
                        {e.detail}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {events.length > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mt: 1, flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary" data-testid="audit-range">
            Showing {from}-{to} of {events.length}
            {more ? "+" : ""}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {totalPages > 1 && (
            <Pagination count={totalPages} page={currentPage} onChange={(e, p) => setPage(p)} color="primary" showFirstButton showLastButton size={narrow ? "small" : "medium"} />
          )}
        </Box>
      )}
      <AuditTranscriptDialog threadId={transcript} onClose={() => setTranscript(null)} />
    </Box>
  );
}
