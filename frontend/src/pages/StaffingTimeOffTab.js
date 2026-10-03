import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Link,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import axios from "axios";
import moment from "moment";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

const POLL_MS = 60000;

const dateRange = (r) =>
  r.start_date === r.end_date
    ? moment(r.start_date).format("ddd MMM D")
    : `${moment(r.start_date).format("MMM D")} - ${moment(r.end_date).format("MMM D")}`;

const shiftLine = (s) =>
  `${moment(s.date).format("ddd MMM D")}: ${s.shift_type_display}${s.unit_name ? ` - ${s.unit_name}` : ""}${
    s.start_time ? ` ${moment(s.start_time, "HH:mm").format("h:mm A")}` : ""
  }`;

function StaffingTimeOffTab({ isAdmin = false }) {
  const token = getAccessToken();
  const headers = getAuthHeaders(token);

  const [view, setView] = useState("attention"); // attention | all
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [coverFor, setCoverFor] = useState(null); // request being covered
  const [candidates, setCandidates] = useState([]);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverNote, setCoverNote] = useState("");

  const [decideFor, setDecideFor] = useState(null); // {request, decision}
  const [decideNote, setDecideNote] = useState("");

  const [logOpen, setLogOpen] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [logForm, setLogForm] = useState({ kind: "emergency", staff_id: "", start_date: "", end_date: "", reason: "" });
  const [logError, setLogError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await axios.get(apiEndpoints.staffingTimeOff, {
        headers,
        params: view === "attention" ? { status: "open,pending" } : {},
      });
      setRows(res.data.results || []);
      setError("");
    } catch (err) {
      console.error("Failed to load time-off requests", err);
      setError("Failed to load time-off requests.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, token]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Every whitespace-separated term must appear somewhere in the request's text.
  const visibleRows = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return rows;
    return rows.filter((r) => {
      const hay = [
        r.staff_name,
        r.kind_display,
        r.kind === "emergency" ? "emergency call-out callout" : "time off request",
        r.status_display,
        r.status,
        r.reason,
        r.admin_note,
        r.cover_staff_name,
        r.start_date,
        r.end_date,
        dateRange(r),
        ...(r.affected_shifts || []).map(shiftLine),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, search]);

  const emergencies = visibleRows.filter((r) => r.kind === "emergency" && r.status === "open");
  const others = visibleRows.filter((r) => !(r.kind === "emergency" && r.status === "open"));

  const openCover = async (req) => {
    setCoverFor(req);
    setCoverNote("");
    setCandidates([]);
    setCoverLoading(true);
    try {
      const res = await axios.get(apiEndpoints.staffingTimeOffCover(req.id), { headers });
      setCandidates(res.data.candidates || []);
    } catch (err) {
      setError("Could not load people available to cover.");
    } finally {
      setCoverLoading(false);
    }
  };

  const resolve = async (body) => {
    try {
      await axios.post(apiEndpoints.staffingTimeOffResolve(coverFor.id), { admin_note: coverNote, ...body }, { headers });
      setCoverFor(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Could not update that call-out.");
    }
  };

  const decide = async () => {
    try {
      await axios.post(
        apiEndpoints.staffingTimeOffDecide(decideFor.request.id),
        { decision: decideFor.decision, admin_note: decideNote },
        { headers }
      );
      setDecideFor(null);
      setDecideNote("");
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Could not save that decision.");
    }
  };

  const openLog = async () => {
    setLogError("");
    setLogForm({ kind: "emergency", staff_id: "", start_date: moment().format("YYYY-MM-DD"), end_date: "", reason: "" });
    setLogOpen(true);
    try {
      const res = await axios.get(apiEndpoints.staffingStaff, { headers, params: { active_only: 1 } });
      setStaffList(res.data.results || res.data || []);
    } catch (err) {
      setLogError("Could not load the roster.");
    }
  };

  const submitLog = async () => {
    try {
      await axios.post(apiEndpoints.staffingTimeOff, { ...logForm, end_date: logForm.end_date || undefined }, { headers });
      setLogOpen(false);
      load();
    } catch (err) {
      setLogError(err.response?.data?.error || "Could not save.");
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(e, v) => v && setView(v)}>
          <ToggleButton value="attention">Needs attention</ToggleButton>
          <ToggleButton value="all">All requests</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          label="Search requests"
          placeholder="Name, type, status, reason, date..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 280 }}
          InputProps={{
            endAdornment: search ? (
              <InputAdornment position="end">
                <Button size="small" onClick={() => setSearch("")}>
                  Clear
                </Button>
              </InputAdornment>
            ) : null,
          }}
        />
        {search.trim() && (
          <Typography variant="body2" color="text.secondary">
            Showing {visibleRows.length} of {rows.length}
          </Typography>
        )}
        {loading && <CircularProgress size={18} />}
        <Box sx={{ flexGrow: 1 }} />
        {isAdmin && (
          <Button variant="contained" color="error" onClick={openLog}>
            Report call-out / log time off
          </Button>
        )}
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {emergencies.length > 0 && (
        <Stack spacing={1.5} sx={{ mb: 1.5 }}>
          <Typography variant="h6" color="error">
            Emergency call-outs - cover needed
          </Typography>
          {emergencies.map((r) => (
            <Card key={r.id} variant="outlined" sx={{ borderColor: "error.main", borderWidth: 2 }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    🚨 {r.staff_name}
                  </Typography>
                  <Chip size="small" label={dateRange(r)} />
                  <Chip
                    size="small"
                    color={r.alert_sent ? "default" : "warning"}
                    label={r.alert_sent ? "Admins alerted" : "Alert not delivered - call admins"}
                  />
                  <Box sx={{ flexGrow: 1 }} />
                  {isAdmin && (
                    <Button variant="contained" size="small" onClick={() => openCover(r)}>
                      Find cover
                    </Button>
                  )}
                </Stack>
                {(r.affected_shifts || []).map((s) => (
                  <Typography key={s.id} variant="body2">
                    {shiftLine(s)}
                  </Typography>
                ))}
                {r.reason && (
                  <Typography variant="body2" color="text.secondary">
                    Reason: {r.reason}
                  </Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>
        {view === "attention" ? "Pending time-off requests" : "All requests"}
      </Typography>
      {others.length === 0 ? (
        <Typography color="text.secondary">
          {rows.length > 0 && search.trim() ? "No requests match your search." : "Nothing here."}
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Staff</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Dates</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Status</TableCell>
              {isAdmin && <TableCell align="right">Action</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {others.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.staff_name}</TableCell>
                <TableCell>{r.kind_display}</TableCell>
                <TableCell>{dateRange(r)}</TableCell>
                <TableCell sx={{ maxWidth: 260 }}>
                  {r.reason}
                  {r.admin_note && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      Note: {r.admin_note}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {r.status_display}
                  {r.cover_staff_name ? ` - covered by ${r.cover_staff_name}` : ""}
                </TableCell>
                {isAdmin && (
                  <TableCell align="right">
                    {r.kind === "off_request" && r.status === "pending" && (
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" variant="contained" onClick={() => { setDecideNote(""); setDecideFor({ request: r, decision: "approved" }); }}>
                          Approve
                        </Button>
                        <Button size="small" color="error" onClick={() => { setDecideNote(""); setDecideFor({ request: r, decision: "denied" }); }}>
                          Deny
                        </Button>
                      </Stack>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Find cover */}
      <Dialog open={!!coverFor} onClose={() => setCoverFor(null)} maxWidth="md" fullWidth>
        <DialogTitle>Find cover for {coverFor?.staff_name}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Free that day, not already working or out. Same role first, then lightest week. Call, then assign.
          </Typography>
          {coverLoading ? (
            <CircularProgress size={22} />
          ) : candidates.length === 0 ? (
            <Alert severity="warning">No available staff found. Consider agency or on-call staff.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell align="right">Hrs this week</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{(c.nursing_role || "").toUpperCase()}</TableCell>
                    <TableCell>
                      {c.phone_number ? <Link href={`tel:${c.phone_number}`}>{c.phone_number}</Link> : c.email || "-"}
                    </TableCell>
                    <TableCell align="right">{c.week_hours}</TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="outlined" onClick={() => resolve({ cover_staff_id: c.id })}>
                        Assign cover
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TextField
            sx={{ mt: 2 }}
            fullWidth
            size="small"
            label="Note (optional)"
            value={coverNote}
            onChange={(e) => setCoverNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button color="error" onClick={() => resolve({ dismiss: true })}>
            Entered in error
          </Button>
          <Button onClick={() => resolve({})}>Handled - no cover needed</Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={() => setCoverFor(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Approve / deny */}
      <Dialog open={!!decideFor} onClose={() => setDecideFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {decideFor?.decision === "approved" ? "Approve" : "Deny"} request from {decideFor?.request.staff_name}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {decideFor && dateRange(decideFor.request)}
            {decideFor?.decision === "approved" &&
              " - once approved, this person is removed from coverage counts on those days."}
          </Typography>
          <TextField fullWidth size="small" label="Note to staff (optional)" value={decideNote} onChange={(e) => setDecideNote(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecideFor(null)}>Cancel</Button>
          <Button variant="contained" color={decideFor?.decision === "approved" ? "primary" : "error"} onClick={decide}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Admin logs a call-out / time off on someone's behalf */}
      <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Report call-out / log time off</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select size="small" label="Type" value={logForm.kind} onChange={(e) => setLogForm({ ...logForm, kind: e.target.value })}>
              <MenuItem value="emergency">Emergency call-out (alerts admins)</MenuItem>
              <MenuItem value="off_request">Time off (recorded as approved)</MenuItem>
            </TextField>
            <TextField select size="small" label="Staff member" value={logForm.staff_id} onChange={(e) => setLogForm({ ...logForm, staff_id: e.target.value })}>
              {staffList.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.last_name}, {s.first_name} ({s.profession})
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" type="date" label="First day" InputLabelProps={{ shrink: true }} value={logForm.start_date} onChange={(e) => setLogForm({ ...logForm, start_date: e.target.value })} />
            <TextField size="small" type="date" label="Last day (optional)" InputLabelProps={{ shrink: true }} value={logForm.end_date} onChange={(e) => setLogForm({ ...logForm, end_date: e.target.value })} />
            <TextField size="small" multiline minRows={2} label="Reason" value={logForm.reason} onChange={(e) => setLogForm({ ...logForm, reason: e.target.value })} />
            {logError && <Typography color="error">{logError}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!logForm.staff_id || !logForm.start_date} onClick={submitLog}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StaffingTimeOffTab;
