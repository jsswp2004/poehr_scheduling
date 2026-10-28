import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import { SubscribeDialog } from "../components/staffing/ReportSubscribe";

const authConfig = () => ({ headers: getAuthHeaders(getAccessToken()) });

const STATUS_COLOR = { sent: "success", partial: "error", failed: "error" };

const formatNext = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
const formatDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

/** Reports > Subscriptions: every emailed report, with pause / edit / send now / delete. */
export default function StaffingSubscriptionsPanel({ people = [], units = [], onOpenReport, refreshKey = 0 }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(null); // { el, sub }
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(apiEndpoints.staffingReportSubscriptions, authConfig());
      setRows(res.data.results || res.data || []);
      setError("");
    } catch (err) {
      setRows([]);
      setError(err.response?.status === 403 ? "Only administrators can manage report subscriptions." : "Could not load subscriptions.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const replace = (sub) => setRows((rs) => rs.map((r) => (r.id === sub.id ? sub : r)));

  const toggle = async (sub) => {
    setBusyId(sub.id);
    try {
      const res = await axios.patch(apiEndpoints.staffingReportSubscription(sub.id), { is_active: !sub.is_active }, authConfig());
      replace(res.data);
    } catch (err) {
      const d = err.response?.data;
      setError((d && (d.start_date?.[0] || d.error)) || "Could not change that subscription.");
    } finally {
      setBusyId(null);
    }
  };

  const sendNow = async (sub, to) => {
    setMenu(null);
    setBusyId(sub.id);
    try {
      const res = await axios.post(apiEndpoints.staffingReportSubscriptionSendNow(sub.id), { to }, authConfig());
      setToast(to === "everyone" ? `Sent: ${res.data.detail}` : "Sent to your email.");
      if (to === "everyone") load();
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || "Could not send that report.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (sub) => {
    setMenu(null);
    if (!window.confirm(`Delete the ${sub.report_label} subscription? Nobody will receive it any more.`)) return;
    try {
      await axios.delete(apiEndpoints.staffingReportSubscription(sub.id), authConfig());
      setRows((rs) => rs.filter((r) => r.id !== sub.id));
    } catch (err) {
      setError("Could not delete that subscription.");
    }
  };

  if (rows === null) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box className="no-print">
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderStyle: "dashed", maxWidth: 520, mx: "auto", mt: 2 }}>
          <Box sx={{ fontSize: 28, mb: 1 }}>
            <FontAwesomeIcon icon={faBell} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>No subscriptions yet</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Open any report and choose Subscribe to get it by email on a schedule.
          </Typography>
          <Button variant="contained" onClick={() => onOpenReport && onOpenReport("labor_hours")}>
            Go to Labor hours
          </Button>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Report subscriptions">
            <TableHead>
              <TableRow>
                {["Report", "Schedule", "Covers", "Format", "Recipients", "Next email", "Last result", "On", ""].map((h) => (
                  <TableCell key={h || "menu"} sx={{ fontWeight: 700, textTransform: "uppercase", fontSize: 12 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((sub) => (
                <TableRow key={sub.id} hover sx={{ opacity: sub.is_active ? 1 : 0.6 }}>
                  <TableCell sx={{ fontWeight: 600 }}>{sub.report_label}</TableCell>
                  <TableCell>{sub.schedule_text}</TableCell>
                  <TableCell>{sub.covers_text}</TableCell>
                  <TableCell>{(sub.formats || []).map((f) => f.toUpperCase()).join(", ")}</TableCell>
                  <TableCell title={(sub.recipients || []).join(", ")}>
                    {sub.recipients.length} {sub.recipients.length === 1 ? "person" : "people"}
                  </TableCell>
                  <TableCell>
                    {sub.is_active
                      ? formatNext(sub.next_run_at)
                      : sub.frequency === "once" && sub.last_status
                      ? "Sent once"
                      : "Paused"}
                  </TableCell>
                  <TableCell>
                    {sub.last_status ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={STATUS_COLOR[sub.last_status] || "default"}
                        label={`${formatDay(sub.last_run_at)}: ${sub.last_detail.split(";")[0]}`}
                        title={sub.last_detail}
                      />
                    ) : (
                      <Chip size="small" variant="outlined" label="Not sent yet" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={sub.is_active}
                      disabled={busyId === sub.id}
                      onChange={() => toggle(sub)}
                      inputProps={{ "aria-label": `${sub.is_active ? "Pause" : "Resume"} ${sub.report_label}` }}
                    />
                  </TableCell>
                  <TableCell padding="checkbox">
                    <IconButton aria-label={`Actions for ${sub.report_label}`} onClick={(e) => setMenu({ el: e.currentTarget, sub })}>
                      <FontAwesomeIcon icon={faEllipsisVertical} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { setEditing(menu.sub); setMenu(null); }}>Edit</MenuItem>
        <MenuItem onClick={() => sendNow(menu.sub, "me")}>Send now to me</MenuItem>
        <MenuItem onClick={() => sendNow(menu.sub, "everyone")}>Send now to everyone</MenuItem>
        <MenuItem onClick={() => { const s = menu.sub; setMenu(null); toggle(s); }}>{menu?.sub.is_active ? "Pause" : "Resume"}</MenuItem>
        <MenuItem sx={{ color: "error.main" }} onClick={() => remove(menu.sub)}>Delete</MenuItem>
      </Menu>

      {editing && (
        <SubscribeDialog
          open
          onClose={() => setEditing(null)}
          report={editing.report}
          reportLabel={editing.report_label}
          params={editing.params}
          people={people}
          units={units}
          subscription={editing}
          customReportId={editing.custom_report}
          patientData={!!editing.patient_data}
          onSaved={(sub) => {
            replace(sub);
            setToast("Subscription saved.");
          }}
        />
      )}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
