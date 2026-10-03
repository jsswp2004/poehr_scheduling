import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  FormControlLabel,
  Checkbox,
  Alert,
  Button,
  MenuItem,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrash,
  faPen,
  faCommentSms,
  faEnvelope,
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

const EMPTY_EDIT_FORM = {
  id: null,
  first_name: "",
  last_name: "",
  profession: "",
  nursing_role: "other",
  email: "",
  phone_number: "",
  is_active: true,
};

// Only RN / LPN / CNA count toward HPPD (nursing hours per patient day).
const NURSING_ROLES = [
  { value: "rn", label: "RN" },
  { value: "lpn", label: "LPN" },
  { value: "cna", label: "CNA / Nursing assistant" },
  { value: "other", label: "Other (not counted toward HPPD)" },
];

function StaffingRosterTab({ isAdmin = false }) {
  const token = getAccessToken();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Facility-wide messaging kill switch (Organization.staffing_messaging_enabled).
  // Turning this off stops the hourly automated jobs (shift reminders +
  // understaffing coverage alerts) from sending anything for this org; it
  // does not affect the ad-hoc SMS/Email buttons below, which are a
  // deliberate action taken by an admin.
  const [orgId, setOrgId] = useState(null);
  const [facilityMessagingEnabled, setFacilityMessagingEnabled] = useState(true);
  const [facilityMessagingLoading, setFacilityMessagingLoading] = useState(true);
  const [facilityMessagingSaving, setFacilityMessagingSaving] = useState(false);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // SMS/Email quick-message dialog state
  const [messageDialog, setMessageDialog] = useState(null); // { staff, channel } | null
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [messageSuccess, setMessageSuccess] = useState("");

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(apiEndpoints.staffingStaff, {
        headers: getAuthHeaders(token),
      });
      setStaff(res.data.results || res.data || []);
    } catch (err) {
      console.error("Failed to load staff roster", err);
      setError("Failed to load the staff roster.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchFacilityMessaging = useCallback(async () => {
    setFacilityMessagingLoading(true);
    try {
      const res = await axios.get(apiEndpoints.organizations, {
        headers: getAuthHeaders(token),
      });
      const rows = res.data.results || res.data || [];
      const org = rows[0];
      if (org) {
        setOrgId(org.id);
        setFacilityMessagingEnabled(org.staffing_messaging_enabled !== false);
      }
    } catch (err) {
      console.error("Failed to load facility messaging setting", err);
    } finally {
      setFacilityMessagingLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStaff();
    fetchFacilityMessaging();
  }, [fetchStaff, fetchFacilityMessaging]);

  const handleToggleFacilityMessaging = async () => {
    if (!orgId) return;
    const next = !facilityMessagingEnabled;
    // Optimistic update.
    setFacilityMessagingEnabled(next);
    setFacilityMessagingSaving(true);
    try {
      await axios.patch(
        apiEndpoints.organizationDetail(orgId),
        { staffing_messaging_enabled: next },
        { headers: getAuthHeaders(token) }
      );
    } catch (err) {
      console.error("Failed to update facility messaging setting", err);
      setError("Failed to update Facility Messaging.");
      // Revert on failure.
      setFacilityMessagingEnabled(!next);
    } finally {
      setFacilityMessagingSaving(false);
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm("Remove this staff member from the roster?")) return;
    try {
      await axios.delete(apiEndpoints.staffingStaffDetail(id), {
        headers: getAuthHeaders(token),
      });
      fetchStaff();
    } catch (err) {
      console.error("Failed to remove staff member", err);
      setError("Failed to remove that staff member.");
    }
  };

  const handleToggleReminders = async (s) => {
    // Optimistic update so the switch feels immediate.
    setStaff((prev) =>
      prev.map((row) =>
        row.id === s.id ? { ...row, reminders_enabled: !row.reminders_enabled } : row
      )
    );
    try {
      await axios.patch(
        apiEndpoints.staffingStaffDetail(s.id),
        { reminders_enabled: !s.reminders_enabled },
        { headers: getAuthHeaders(token) }
      );
    } catch (err) {
      console.error("Failed to update messaging toggle", err);
      setError(`Failed to update reminders for ${s.full_name}.`);
      // Revert on failure.
      setStaff((prev) =>
        prev.map((row) =>
          row.id === s.id ? { ...row, reminders_enabled: s.reminders_enabled } : row
        )
      );
    }
  };

  const handleInvite = async (s) => {
    const verb = s.has_login ? "Resend the invite to" : "Send an app invite to";
    if (!window.confirm(`${verb} ${s.full_name} (${s.email})?`)) return;
    setError("");
    setNotice("");
    try {
      await axios.post(
        apiEndpoints.staffingStaffInvite(s.id),
        {},
        { headers: getAuthHeaders(token) }
      );
      setNotice(`Invite emailed to ${s.email}. Ask them to check spam the first time.`);
      fetchStaff();
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.error;
      setError(msg || `Failed to invite ${s.full_name}.`);
    }
  };

  const openEdit = (s) => {
    setEditForm({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      profession: s.profession,
      nursing_role: s.nursing_role || "other",
      email: s.email || "",
      phone_number: s.phone_number || "",
      is_active: s.is_active,
    });
    setEditError("");
    setEditOpen(true);
  };

  const closeEdit = () => {
    if (editSaving) return;
    setEditOpen(false);
    setEditForm(EMPTY_EDIT_FORM);
  };

  const handleEditSave = async () => {
    if (!editForm.first_name.trim() || !editForm.last_name.trim() || !editForm.profession.trim()) {
      setEditError("First name, last name, and profession are required.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      await axios.patch(
        apiEndpoints.staffingStaffDetail(editForm.id),
        {
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim(),
          profession: editForm.profession.trim(),
          nursing_role: editForm.nursing_role,
          email: editForm.email.trim() || null,
          phone_number: editForm.phone_number.trim() || null,
          is_active: editForm.is_active,
        },
        { headers: getAuthHeaders(token) }
      );
      setEditOpen(false);
      setEditForm(EMPTY_EDIT_FORM);
      fetchStaff();
    } catch (err) {
      setEditError(
        JSON.stringify(err.response?.data) || err.message || "Failed to save changes."
      );
    } finally {
      setEditSaving(false);
    }
  };

  const openMessageDialog = (s, channel) => {
    setMessageDialog({ staff: s, channel });
    setMessageSubject("Schedule message");
    setMessageBody("");
    setMessageError("");
    setMessageSuccess("");
  };

  const closeMessageDialog = () => {
    if (messageSending) return;
    setMessageDialog(null);
  };

  const handleSendMessage = async () => {
    if (!messageDialog) return;
    if (!messageBody.trim()) {
      setMessageError("Message can't be empty.");
      return;
    }
    setMessageSending(true);
    setMessageError("");
    setMessageSuccess("");
    try {
      await axios.post(
        apiEndpoints.staffingStaffSendMessage(messageDialog.staff.id),
        {
          channel: messageDialog.channel,
          message: messageBody.trim(),
          subject: messageSubject.trim(),
        },
        { headers: getAuthHeaders(token) }
      );
      setMessageSuccess(
        `${messageDialog.channel === "sms" ? "Text" : "Email"} sent to ${messageDialog.staff.full_name}.`
      );
      setMessageBody("");
    } catch (err) {
      setMessageError(
        err.response?.data?.error || err.message || "Failed to send message."
      );
    } finally {
      setMessageSending(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: "wrap" }}>
        <Typography variant="h6">
          Staff Roster ({staff.length})
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Facility Messaging
          </Typography>
          {isAdmin ? (
            <Tooltip
              title={
                facilityMessagingEnabled
                  ? "SMS/email shift reminders and understaffing alerts are ON for this facility"
                  : "SMS/email shift reminders and understaffing alerts are OFF for this facility -- the automated jobs will not send anything"
              }
            >
              <span>
                <Switch
                  checked={!!facilityMessagingEnabled}
                  onChange={handleToggleFacilityMessaging}
                  disabled={facilityMessagingLoading || facilityMessagingSaving || !orgId}
                />
              </span>
            </Tooltip>
          ) : (
            <Chip
              size="small"
              label={facilityMessagingEnabled ? "On" : "Off"}
              color={facilityMessagingEnabled ? "success" : "default"}
              variant="outlined"
            />
          )}
        </Stack>
      </Stack>

      {notice && (
        <Alert severity="success" sx={{ mb: 1 }} onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Profession</TableCell>
            <TableCell>Nursing Role</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Phone</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Messaging</TableCell>
            {isAdmin && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {staff.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{s.full_name}</TableCell>
              <TableCell>{s.profession_display || s.profession}</TableCell>
              <TableCell>{s.nursing_role_display || "—"}</TableCell>
              <TableCell>{s.email || "—"}</TableCell>
              <TableCell>{s.phone_number || "—"}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={s.is_active ? "Active" : "Inactive"}
                  color={s.is_active ? "success" : "default"}
                />
              </TableCell>
              <TableCell>
                {isAdmin ? (
                  <Tooltip
                    title={
                      s.reminders_enabled
                        ? "Auto SMS/email reminders ON (sent 3 hours before shift start)"
                        : "Auto SMS/email reminders OFF"
                    }
                  >
                    <Switch
                      size="small"
                      checked={!!s.reminders_enabled}
                      onChange={() => handleToggleReminders(s)}
                    />
                  </Tooltip>
                ) : (
                  <Chip
                    size="small"
                    label={s.reminders_enabled ? "Enabled" : "Disabled"}
                    color={s.reminders_enabled ? "success" : "default"}
                    variant="outlined"
                  />
                )}
              </TableCell>
              {isAdmin && (
                <TableCell align="right">
                  <Tooltip title="Edit staff member">
                    <IconButton size="small" onClick={() => openEdit(s)}>
                      <FontAwesomeIcon icon={faPen} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={s.phone_number ? "Send SMS" : "No phone number on file"}>
                    <span>
                      <IconButton
                        size="small"
                        color="primary"
                        disabled={!s.phone_number}
                        onClick={() => openMessageDialog(s, "sms")}
                      >
                        <FontAwesomeIcon icon={faCommentSms} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={s.email ? "Send Email" : "No email on file"}>
                    <span>
                      <IconButton
                        size="small"
                        color="primary"
                        disabled={!s.email}
                        onClick={() => openMessageDialog(s, "email")}
                      >
                        <FontAwesomeIcon icon={faEnvelope} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip
                    title={
                      !s.email
                        ? "Add an email to invite"
                        : s.has_login
                        ? "Resend app invite"
                        : "Invite to POWER Staffing app"
                    }
                  >
                    <span>
                      <IconButton
                        size="small"
                        color={s.has_login ? "success" : "primary"}
                        disabled={!s.email || !s.is_active}
                        onClick={() => handleInvite(s)}
                      >
                        <FontAwesomeIcon icon={faUserPlus} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Remove from roster">
                    <IconButton size="small" color="error" onClick={() => handleDeactivate(s.id)}>
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Edit staff dialog */}
      <Dialog open={editOpen} onClose={closeEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Staff Member</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {editError && <Alert severity="error">{editError}</Alert>}
            <Stack direction="row" spacing={2}>
              <TextField
                label="First Name"
                fullWidth
                value={editForm.first_name}
                onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
              />
              <TextField
                label="Last Name"
                fullWidth
                value={editForm.last_name}
                onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
              />
            </Stack>
            <TextField
              label="Profession"
              fullWidth
              value={editForm.profession}
              onChange={(e) => setEditForm((f) => ({ ...f, profession: e.target.value }))}
              helperText="Free text -- Nurse, Physician, CNA, Tech, etc."
            />
            <TextField
              select
              label="Nursing Role"
              fullWidth
              value={editForm.nursing_role}
              onChange={(e) => setEditForm((f) => ({ ...f, nursing_role: e.target.value }))}
              helperText="Used for HPPD staffing requirements: only RN, LPN and CNA hours are counted."
            >
              {NURSING_ROLES.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Email"
              type="email"
              fullWidth
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
            />
            <TextField
              label="Phone Number"
              fullWidth
              value={editForm.phone_number}
              onChange={(e) => setEditForm((f) => ({ ...f, phone_number: e.target.value }))}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
              }
              label="Active"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit} disabled={editSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editSaving}>
            {editSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* SMS / Email quick-message dialog */}
      <Dialog open={!!messageDialog} onClose={closeMessageDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {messageDialog?.channel === "sms" ? "Send SMS" : "Send Email"} to{" "}
          {messageDialog?.staff?.full_name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {messageError && <Alert severity="error">{messageError}</Alert>}
            {messageSuccess && <Alert severity="success">{messageSuccess}</Alert>}
            {messageDialog?.channel === "email" && (
              <TextField
                label="Subject"
                fullWidth
                value={messageSubject}
                onChange={(e) => setMessageSubject(e.target.value)}
              />
            )}
            <TextField
              label="Message"
              fullWidth
              multiline
              minRows={4}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeMessageDialog} disabled={messageSending}>
            Close
          </Button>
          <Button variant="contained" onClick={handleSendMessage} disabled={messageSending}>
            {messageSending ? "Sending..." : "Send"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StaffingRosterTab;
