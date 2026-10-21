import { useState, useEffect, useCallback, useMemo } from "react";
import {
  alpha,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faEllipsis,
  faMagnifyingGlass,
  faUserPlus,
  faXmark,
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
const COUNTED_ROLES = ["rn", "lpn", "cna"];
const ROLE_OPTIONS = [
  { value: "rn", label: "RN" },
  { value: "lpn", label: "LPN" },
  { value: "cna", label: "CNA" },
  { value: "other", label: "Other" },
];
const ROLE_TONE = { rn: "primary", lpn: "secondary", cna: "success", other: "warning" };
const ROWS_PER_PAGE = 14;

const roleOf = (s) => s.nursing_role || "other";
const initialsOf = (s) =>
  `${(s.first_name || "").charAt(0)}${(s.last_name || "").charAt(0)}`.toUpperCase() || "?";

// Tiles at the top double as filters. Each test says who belongs in the tile.
const TILES = [
  { key: "all", label: "All staff", hint: "Everyone on the roster", test: () => true },
  { key: "counted", label: "Counted for compliance", hint: "RN, LPN and CNA", test: (s) => COUNTED_ROLES.includes(roleOf(s)) },
  { key: "other", label: "Role set to Other", hint: "Set a nursing role to count them", test: (s) => !COUNTED_ROLES.includes(roleOf(s)) },
  { key: "nocontact", label: "Missing contact info", hint: "No email or no phone", test: (s) => !s.email || !s.phone_number },
  { key: "noapp", label: "Not on the app", hint: "Not invited to POWER Staffing", test: (s) => !s.has_login },
];

function formatApiError(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  if (data.error) return data.error;
  if (typeof data === "object") {
    const parts = Object.entries(data).map(
      ([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(" ") : v}`
    );
    if (parts.length) return parts.join(" ");
  }
  return fallback;
}

function RoleChip({ role, label }) {
  const tone = ROLE_TONE[role] || "warning";
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        fontWeight: 600,
        bgcolor: (th) => alpha(th.palette[tone].main, 0.12),
        color: (th) => th.palette[tone].dark,
      }}
    />
  );
}

function Avatar({ s, size = 36 }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: "grey.200",
        color: "text.secondary",
        fontSize: size * 0.36,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      {initialsOf(s)}
    </Box>
  );
}

function StaffingRosterTab({ isAdmin = false }) {
  const token = getAccessToken();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Facility-wide messaging kill switch (Organization.staffing_messaging_enabled).
  // Turning this off stops the hourly automated jobs (shift reminders +
  // understaffing coverage alerts) from sending anything for this org; it
  // does not affect the ad-hoc text/email buttons, which are a deliberate
  // action taken by an admin.
  const [orgId, setOrgId] = useState(null);
  const [facilityMessagingEnabled, setFacilityMessagingEnabled] = useState(true);
  const [facilityMessagingLoading, setFacilityMessagingLoading] = useState(true);
  const [facilityMessagingSaving, setFacilityMessagingSaving] = useState(false);

  // Staff panel (add / edit) state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Row action menu
  const [menu, setMenu] = useState(null); // { anchorEl, staff } | null

  // Text / email dialog state
  const [messageDialog, setMessageDialog] = useState(null); // { staff, channel } | null
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [messageSuccess, setMessageSuccess] = useState("");

  // Tiles, search, filters and paging (all client-side; the whole roster is loaded).
  const [tile, setTile] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | inactive
  const [roleFilter, setRoleFilter] = useState("all"); // all | rn | lpn | cna | other
  const [page, setPage] = useState(0);

  const tileCounts = useMemo(() => {
    const out = {};
    TILES.forEach((t) => {
      out[t.key] = staff.filter(t.test).length;
    });
    return out;
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const tileTest = TILES.find((t) => t.key === tile).test;
    return staff.filter((s) => {
      if (!tileTest(s)) return false;
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;
      if (roleFilter !== "all" && roleOf(s) !== roleFilter) return false;
      if (terms.length === 0) return true;
      const haystack = [
        s.full_name,
        s.first_name,
        s.last_name,
        s.profession_display,
        s.profession,
        s.nursing_role_display,
        s.email,
        s.phone_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      // Phone numbers: also match on digits only, so "301880" finds (301) 880-xxxx.
      const digits = (s.phone_number || "").replace(/\D/g, "");
      return terms.every((t) => haystack.includes(t) || (/^\d+$/.test(t) && digits.includes(t)));
    });
  }, [staff, tile, search, statusFilter, roleFilter]);

  const lastPage = Math.max(0, Math.ceil(filteredStaff.length / ROWS_PER_PAGE) - 1);
  const safePage = Math.min(page, lastPage);
  const pageStaff = filteredStaff.slice(safePage * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const filtersActive = tile !== "all" || search.trim() !== "" || statusFilter !== "all" || roleFilter !== "all";

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(apiEndpoints.staffingStaff, { headers: getAuthHeaders(token) });
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
      const res = await axios.get(apiEndpoints.organizations, { headers: getAuthHeaders(token) });
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
      setFacilityMessagingEnabled(!next);
    } finally {
      setFacilityMessagingSaving(false);
    }
  };

  const handleDeactivate = async (s) => {
    if (!window.confirm(`Remove ${s.full_name} from the roster? To keep their history and just stop scheduling them, mark them inactive instead.`)) {
      return false;
    }
    try {
      await axios.delete(apiEndpoints.staffingStaffDetail(s.id), { headers: getAuthHeaders(token) });
      setNotice(`${s.full_name} was removed from the roster.`);
      fetchStaff();
      return true;
    } catch (err) {
      console.error("Failed to remove staff member", err);
      setError("Failed to remove that staff member.");
      return false;
    }
  };

  const handleToggleReminders = async (s) => {
    // Optimistic update so the switch feels immediate.
    setStaff((prev) => prev.map((row) => (row.id === s.id ? { ...row, reminders_enabled: !row.reminders_enabled } : row)));
    try {
      await axios.patch(
        apiEndpoints.staffingStaffDetail(s.id),
        { reminders_enabled: !s.reminders_enabled },
        { headers: getAuthHeaders(token) }
      );
    } catch (err) {
      console.error("Failed to update messaging toggle", err);
      setError(`Failed to update reminders for ${s.full_name}.`);
      setStaff((prev) => prev.map((row) => (row.id === s.id ? { ...row, reminders_enabled: s.reminders_enabled } : row)));
    }
  };

  const handleInvite = async (s) => {
    const verb = s.has_login ? "Resend the invite to" : "Send an app invite to";
    if (!window.confirm(`${verb} ${s.full_name} (${s.email})?`)) return;
    setError("");
    setNotice("");
    try {
      await axios.post(apiEndpoints.staffingStaffInvite(s.id), {}, { headers: getAuthHeaders(token) });
      setNotice(`Invite emailed to ${s.email}. Ask them to check spam the first time.`);
      fetchStaff();
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.error;
      setError(msg || `Failed to invite ${s.full_name}.`);
    }
  };

  // ---- staff panel ----

  const openEdit = (s) => {
    setEditForm({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      profession: s.profession,
      nursing_role: roleOf(s),
      email: s.email || "",
      phone_number: s.phone_number || "",
      is_active: s.is_active,
    });
    setEditError("");
    setFieldErrors({});
    setEditOpen(true);
  };

  const openAdd = () => {
    setEditForm(EMPTY_EDIT_FORM);
    setEditError("");
    setFieldErrors({});
    setEditOpen(true);
  };

  const closeEdit = () => {
    if (editSaving) return;
    setEditOpen(false);
  };

  const setField = (name, value) => {
    setEditForm((f) => ({ ...f, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((e) => ({ ...e, [name]: undefined }));
  };

  const handleEditSave = async () => {
    const errs = {};
    if (!editForm.first_name.trim()) errs.first_name = "First name is required.";
    if (!editForm.last_name.trim()) errs.last_name = "Last name is required.";
    if (!editForm.profession.trim()) errs.profession = "Profession is required.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setEditSaving(true);
    setEditError("");
    try {
      const body = {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        profession: editForm.profession.trim(),
        nursing_role: editForm.nursing_role,
        email: editForm.email.trim() || null,
        phone_number: editForm.phone_number.trim() || null,
        is_active: editForm.is_active,
      };
      if (editForm.id) {
        await axios.patch(apiEndpoints.staffingStaffDetail(editForm.id), body, { headers: getAuthHeaders(token) });
      } else {
        await axios.post(apiEndpoints.staffingStaff, body, { headers: getAuthHeaders(token) });
        setNotice(`${body.first_name} ${body.last_name} was added to the roster.`);
      }
      setEditOpen(false);
      fetchStaff();
    } catch (err) {
      setEditError(formatApiError(err.response?.data, err.message || "Failed to save changes."));
    } finally {
      setEditSaving(false);
    }
  };

  // The person open in the panel, as last loaded (for contact buttons and invite state).
  const editingStaff = editForm.id ? staff.find((x) => x.id === editForm.id) : null;

  // ---- text / email dialog ----

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
      setMessageSuccess(`${messageDialog.channel === "sms" ? "Text" : "Email"} sent to ${messageDialog.staff.full_name}.`);
      setMessageBody("");
    } catch (err) {
      setMessageError(err.response?.data?.error || err.message || "Failed to send message.");
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

  const menuStaff = menu && menu.staff;
  const msgStaff = messageDialog && messageDialog.staff;
  const msgChannel = messageDialog && messageDialog.channel;

  return (
    <Box sx={{ maxWidth: 1200 }}>
      {/* Header */}
      <Stack direction="row" spacing={2} alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
          Roster{" "}
          <Box component="span" sx={{ fontWeight: 400, color: "text.secondary" }}>
            ({staff.length})
          </Box>
        </Typography>
        {isAdmin && (
          <Button variant="contained" startIcon={<FontAwesomeIcon icon={faUserPlus} />} onClick={openAdd} sx={{ minHeight: 44, px: 2.5 }}>
            Add staff
          </Button>
        )}
      </Stack>

      {/* Facility messaging banner */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
          borderColor: facilityMessagingEnabled ? "info.main" : "warning.main",
          bgcolor: (th) => alpha(facilityMessagingEnabled ? th.palette.info.main : th.palette.warning.main, 0.07),
        }}
      >
        <Box sx={{ flex: "1 1 360px", minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>
            Automated messages: {facilityMessagingEnabled ? "On" : "Paused"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {facilityMessagingEnabled
              ? "Shift reminders (3 hours before a shift) and understaffing alerts are being sent. The text and email buttons on a person always work."
              : "Nothing automated is being sent for this facility. Individual reminder switches are dimmed until you turn this back on."}
          </Typography>
        </Box>
        {isAdmin ? (
          <Switch
            checked={!!facilityMessagingEnabled}
            onChange={handleToggleFacilityMessaging}
            disabled={facilityMessagingLoading || facilityMessagingSaving || !orgId}
            inputProps={{ "aria-label": "Facility messaging" }}
          />
        ) : (
          <Chip
            size="small"
            label={facilityMessagingEnabled ? "On" : "Paused"}
            color={facilityMessagingEnabled ? "success" : "default"}
            variant="outlined"
          />
        )}
      </Paper>

      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {/* Filter tiles */}
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        {TILES.map((t) => {
          const selected = tile === t.key;
          return (
            <Paper
              key={t.key}
              component="button"
              type="button"
              variant="outlined"
              aria-pressed={selected}
              onClick={() => {
                setTile(t.key);
                setPage(0);
              }}
              sx={{
                flex: "1 1 170px",
                minHeight: 96,
                p: 1.75,
                textAlign: "left",
                font: "inherit",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 0.5,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? "primary.main" : "divider",
                boxShadow: (th) => (selected ? `0 0 0 3px ${alpha(th.palette.primary.main, 0.18)}` : "none"),
                bgcolor: "background.paper",
                color: "text.primary",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {t.label}
              </Typography>
              <Typography sx={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1 }}>{tileCounts[t.key]}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t.hint}
              </Typography>
            </Paper>
          );
        })}
      </Stack>

      {/* Search + filters */}
      <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search name, email, phone or profession"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          slotProps={{
            htmlInput: { "aria-label": "Search roster" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <FontAwesomeIcon icon={faMagnifyingGlass} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ flex: "1 1 320px", maxWidth: 460, "& .MuiInputBase-root": { minHeight: 44 } }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="inactive">Inactive</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Nursing role"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="rn">RN</MenuItem>
          <MenuItem value="lpn">LPN</MenuItem>
          <MenuItem value="cna">CNA</MenuItem>
          <MenuItem value="other">Other</MenuItem>
        </TextField>
        <Typography variant="body2" color="text.secondary">
          Showing {filteredStaff.length} of {staff.length}
        </Typography>
        {filtersActive && (
          <Button
            size="small"
            onClick={() => {
              setTile("all");
              setSearch("");
              setStatusFilter("all");
              setRoleFilter("all");
              setPage(0);
            }}
          >
            Clear filters
          </Button>
        )}
      </Stack>

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table sx={{ minWidth: 880 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ pl: 2.5 }}>Person</TableCell>
              <TableCell>Nursing role</TableCell>
              <TableCell>Contact</TableCell>
              <TableCell>Staffing app</TableCell>
              <TableCell>Shift reminders</TableCell>
              {isAdmin && (
                <TableCell align="right" sx={{ pr: 2.5 }}>
                  <Box component="span" sx={{ position: "absolute", left: -9999 }}>
                    Actions
                  </Box>
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {pageStaff.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 6 : 5} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    {staff.length === 0 ? "No staff on the roster yet." : "No staff match these filters."}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {pageStaff.map((s) => {
              const role = roleOf(s);
              const isOther = !COUNTED_ROLES.includes(role);
              return (
                <TableRow key={s.id} hover>
                  <TableCell sx={{ pl: 2.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Avatar s={s} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 500 }}>{s.full_name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {s.profession_display || s.profession}
                        </Typography>
                      </Box>
                      {!s.is_active && <Chip size="small" variant="outlined" label="Inactive" />}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <RoleChip role={role} label={s.nursing_role_display || "Other"} />
                    {isOther && (
                      <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "warning.dark" }}>
                        Not counted for compliance
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: s.email ? "text.primary" : "warning.dark" }}>
                      {s.email || "No email"}
                    </Typography>
                    <Typography variant="body2" sx={{ color: s.phone_number ? "text.secondary" : "warning.dark" }}>
                      {s.phone_number || "No phone"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {s.has_login ? (
                      <Typography variant="body2" sx={{ color: "success.dark", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                        <FontAwesomeIcon icon={faCheck} /> Signed in
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Not invited yet
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Tooltip
                        title={
                          !facilityMessagingEnabled
                            ? "Automated messages are paused for the facility, so nothing will send until they are turned back on"
                            : s.reminders_enabled
                            ? "Auto text/email reminders ON (sent 3 hours before shift start)"
                            : "Auto text/email reminders OFF"
                        }
                      >
                        <span>
                          <Switch
                            size="small"
                            checked={!!s.reminders_enabled}
                            onChange={() => handleToggleReminders(s)}
                            inputProps={{ "aria-label": `Shift reminders for ${s.full_name}` }}
                            sx={{ opacity: facilityMessagingEnabled ? 1 : 0.5 }}
                          />
                        </span>
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
                    <TableCell align="right" sx={{ pr: 2.5, whiteSpace: "nowrap" }}>
                      <Button variant="outlined" color="inherit" onClick={() => openEdit(s)} sx={{ minHeight: 44, borderColor: "grey.400" }}>
                        Edit
                      </Button>
                      <IconButton
                        aria-label={`More actions for ${s.full_name}`}
                        aria-haspopup="menu"
                        onClick={(e) => setMenu({ anchorEl: e.currentTarget, staff: s })}
                        sx={{ ml: 0.75, width: 44, height: 44 }}
                      >
                        <FontAwesomeIcon icon={faEllipsis} />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {filteredStaff.length > ROWS_PER_PAGE && (
        <TablePagination
          component="div"
          count={filteredStaff.length}
          page={safePage}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={ROWS_PER_PAGE}
          rowsPerPageOptions={[]}
        />
      )}

      {/* Row action menu */}
      <Menu anchorEl={menu && menu.anchorEl} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { minWidth: 220 } } }}>
        <MenuItem
          disabled={!menuStaff || !menuStaff.phone_number}
          onClick={() => {
            openMessageDialog(menuStaff, "sms");
            setMenu(null);
          }}
          sx={{ minHeight: 44 }}
        >
          Send a text{menuStaff && !menuStaff.phone_number ? " (no phone on file)" : ""}
        </MenuItem>
        <MenuItem
          disabled={!menuStaff || !menuStaff.email}
          onClick={() => {
            openMessageDialog(menuStaff, "email");
            setMenu(null);
          }}
          sx={{ minHeight: 44 }}
        >
          Send an email{menuStaff && !menuStaff.email ? " (no email on file)" : ""}
        </MenuItem>
        <MenuItem
          disabled={!menuStaff || !menuStaff.email || !menuStaff.is_active}
          onClick={() => {
            handleInvite(menuStaff);
            setMenu(null);
          }}
          sx={{ minHeight: 44 }}
        >
          {menuStaff && menuStaff.has_login ? "Resend app invite" : "Invite to the app"}
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            handleDeactivate(menuStaff);
            setMenu(null);
          }}
          sx={{ minHeight: 44, color: "error.main", fontWeight: 600 }}
        >
          Remove from roster
        </MenuItem>
      </Menu>

      {/* Staff panel (add / edit) */}
      <Drawer anchor="right" open={editOpen} onClose={closeEdit} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 480 } } } }}>
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2.5, borderBottom: 1, borderColor: "divider" }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
              <Avatar s={editForm} size={44} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" component="h3" sx={{ lineHeight: 1.2 }}>
                  {editForm.id ? `${editForm.first_name} ${editForm.last_name}`.trim() || "Staff member" : "Add staff member"}
                </Typography>
                {editForm.id && (
                  <Typography variant="body2" color="text.secondary">
                    {editForm.profession}
                    {editForm.profession ? " · " : ""}
                    {editForm.is_active ? "Active" : "Inactive"}
                  </Typography>
                )}
              </Box>
            </Stack>
            <IconButton aria-label="Close panel" onClick={closeEdit} sx={{ width: 44, height: 44 }}>
              <FontAwesomeIcon icon={faXmark} />
            </IconButton>
          </Stack>

          <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5 }}>
            <Stack spacing={2.5}>
              {editError && <Alert severity="error">{editError}</Alert>}
              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="First name"
                  fullWidth
                  value={editForm.first_name}
                  onChange={(e) => setField("first_name", e.target.value)}
                  error={!!fieldErrors.first_name}
                  helperText={fieldErrors.first_name}
                />
                <TextField
                  label="Last name"
                  fullWidth
                  value={editForm.last_name}
                  onChange={(e) => setField("last_name", e.target.value)}
                  error={!!fieldErrors.last_name}
                  helperText={fieldErrors.last_name}
                />
              </Stack>
              <TextField
                label="Profession"
                fullWidth
                value={editForm.profession}
                onChange={(e) => setField("profession", e.target.value)}
                error={!!fieldErrors.profession}
                helperText={fieldErrors.profession || "Free text: Nurse, Physician, CNA, Tech, whatever you schedule."}
              />

              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} id="roster-role-label">
                  Nursing role
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  aria-labelledby="roster-role-label"
                  value={editForm.nursing_role}
                  onChange={(e, v) => v && setField("nursing_role", v)}
                  color={editForm.nursing_role === "other" ? "warning" : "primary"}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <ToggleButton key={r.value} value={r.value} sx={{ minHeight: 44 }}>
                      {r.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                {editForm.nursing_role === "other" && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>
                    Other is not counted toward care hours, the staff ratio or the RN requirement. Choose RN, LPN or CNA to include this person.
                  </Alert>
                )}
              </Box>

              <TextField
                label="Email"
                type="email"
                fullWidth
                value={editForm.email}
                onChange={(e) => setField("email", e.target.value)}
                helperText={!editForm.email.trim() ? "Add an email to send messages or an app invite." : undefined}
              />
              <TextField label="Phone number" fullWidth value={editForm.phone_number} onChange={(e) => setField("phone_number", e.target.value)} />

              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ py: 1.5, borderTop: 1, borderBottom: 1, borderColor: "divider" }}>
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>Active</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Inactive people stay on the roster but are not scheduled.
                  </Typography>
                </Box>
                <Switch
                  checked={editForm.is_active}
                  onChange={(e) => setField("is_active", e.target.checked)}
                  inputProps={{ "aria-label": "Active" }}
                />
              </Stack>

              {editingStaff && (
                <Box>
                  <Typography variant="caption" sx={{ display: "block", mb: 1, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "text.secondary" }}>
                    Reach out
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <Button variant="outlined" disabled={!editingStaff.phone_number} onClick={() => openMessageDialog(editingStaff, "sms")} sx={{ flex: "1 1 120px", minHeight: 44 }}>
                      Send a text
                    </Button>
                    <Button variant="outlined" disabled={!editingStaff.email} onClick={() => openMessageDialog(editingStaff, "email")} sx={{ flex: "1 1 120px", minHeight: 44 }}>
                      Send an email
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={!editingStaff.email || !editingStaff.is_active}
                      onClick={() => handleInvite(editingStaff)}
                      sx={{ flex: "1 1 120px", minHeight: 44 }}
                    >
                      {editingStaff.has_login ? "Resend invite" : "Invite to app"}
                    </Button>
                  </Stack>
                  {(!editingStaff.email || !editingStaff.phone_number) && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Save an email or phone number to turn these on.
                    </Typography>
                  )}
                </Box>
              )}

              {editingStaff && isAdmin && (
                <Paper
                  variant="outlined"
                  sx={{ p: 2, borderColor: "error.main", bgcolor: (th) => alpha(th.palette.error.main, 0.05) }}
                >
                  <Typography sx={{ fontWeight: 600, color: "error.dark", mb: 0.5 }}>Remove from roster</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Removes {editingStaff.full_name} from the roster and from future schedules. To keep their history and just stop scheduling them, switch Active off instead.
                  </Typography>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={async () => {
                      if (await handleDeactivate(editingStaff)) setEditOpen(false);
                    }}
                    sx={{ minHeight: 44 }}
                  >
                    Remove {editingStaff.full_name}
                  </Button>
                </Paper>
              )}
            </Stack>
          </Box>

          <Stack direction="row" spacing={1.5} justifyContent="flex-end" sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider" }}>
            <Button variant="outlined" color="inherit" onClick={closeEdit} disabled={editSaving} sx={{ minHeight: 48, borderColor: "grey.400" }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleEditSave} disabled={editSaving} sx={{ minHeight: 48, px: 3 }}>
              {editSaving ? "Saving..." : editForm.id ? "Save changes" : "Add to roster"}
            </Button>
          </Stack>
        </Box>
      </Drawer>

      {/* Text / email dialog */}
      <Dialog open={!!messageDialog} onClose={closeMessageDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Send a {msgChannel === "sms" ? "text" : "email"} to {msgStaff && msgStaff.full_name}
          <Typography variant="body2" color="text.secondary" component="div">
            To {msgStaff ? (msgChannel === "sms" ? msgStaff.phone_number : msgStaff.email) : ""}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              aria-label="Channel"
              value={msgChannel}
              onChange={(e, v) => v && setMessageDialog((d) => ({ ...d, channel: v }))}
            >
              <ToggleButton value="sms" disabled={!msgStaff || !msgStaff.phone_number} sx={{ minHeight: 40 }}>
                Text
              </ToggleButton>
              <ToggleButton value="email" disabled={!msgStaff || !msgStaff.email} sx={{ minHeight: 40 }}>
                Email
              </ToggleButton>
            </ToggleButtonGroup>
            {messageError && <Alert severity="error">{messageError}</Alert>}
            {messageSuccess && <Alert severity="success">{messageSuccess}</Alert>}
            {msgChannel === "email" && (
              <TextField label="Subject" fullWidth value={messageSubject} onChange={(e) => setMessageSubject(e.target.value)} />
            )}
            <TextField
              label="Message"
              fullWidth
              multiline
              minRows={4}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              helperText={msgChannel === "sms" ? `${messageBody.length} characters` : undefined}
            />
            <Alert severity="info" icon={false}>
              Texts and emails sent here always go out, even when automated messages are paused for the facility.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={closeMessageDialog} disabled={messageSending} sx={{ minHeight: 44 }}>
            Close
          </Button>
          <Button variant="contained" onClick={handleSendMessage} disabled={messageSending} sx={{ minHeight: 44, px: 3 }}>
            {messageSending ? "Sending..." : `Send ${msgChannel === "sms" ? "text" : "email"}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StaffingRosterTab;
