import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import {
  Alert, Badge, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import ScienceIcon from "@mui/icons-material/Science";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { toast } from "react-toastify";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import LabRequestDialog, { WORKER_ROLES } from "../components/labPortal/LabRequestDialog";
import LabStaffDialog from "../components/labPortal/LabStaffDialog";
import { LAB_PORTAL_TABS, LAB_STATUS_COLOR, authHeader, errorText, fmtDateTime, licenseWord } from "../components/labPortal/labShared";
import { LAB_PORTAL_ROLES } from "../utils/landing";
import { extractClaimCode, takePendingClaim } from "../utils/claimCode";
import ClaimCameraScanner from "../components/pharmacyPortal/ClaimCameraScanner";

/**
 * Claim a walk-in: the code on the patient's text or printout (typed, scanned or from the QR link), the patient's
 * birthdate and the last 4 digits of their mobile number. Five failed tries in an hour lock claiming for the hour.
 */
export function LabClaimDialog({ open, onClose, onClaimed, initialCode = "" }) {
  const [code, setCode] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(initialCode || "");
      setBirthdate("");
      setMobile("");
      setError("");
    }
  }, [open, initialCode]);

  const claim = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post(apiEndpoints.labPortalClaim, { code: extractClaimCode(code), birthdate, mobile_last4: mobile }, { headers: await authHeader() });
      toast.success("Lab request claimed: it is now with your lab.");
      onClaimed(res.data);
    } catch (err) {
      setError(errorText(err, "Could not claim the lab request."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth data-testid="lab-claim-dialog">
      <DialogTitle>Check in a patient</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error" data-testid="lab-claim-error">{error}</Alert>}
          <TextField size="small" label="Code from the patient's text or printout" value={code} onChange={(e) => setCode(e.target.value)} inputProps={{ "data-testid": "lab-claim-code" }} />
          <ClaimCameraScanner onCode={setCode} />
          <TextField size="small" type="date" label="Patient's birthdate" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ "data-testid": "lab-claim-birthdate" }} />
          <TextField size="small" label="Last 4 digits of the patient's mobile number" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 4))} inputProps={{ "data-testid": "lab-claim-mobile", inputMode: "numeric" }} />
          <Typography variant="caption" color="text.secondary">
            Works for requests sent to your lab and for "any partner lab" requests. Five wrong tries in an hour lock claiming until the hour is up.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || !code.trim() || !birthdate || mobile.length !== 4} onClick={claim} data-testid="lab-claim-submit">Check in</Button>
      </DialogActions>
    </Dialog>
  );
}

const signedInRole = () => {
  try {
    const token = localStorage.getItem("access_token");
    return token ? jwtDecode(token).role || "" : "";
  } catch (err) {
    return "";
  }
};

/**
 * The POWER Lab Portal: a partner laboratory's worklist of POWER lab requests. Tabs New, Waiting for patient,
 * Collected, In process, To release and History; Check in for walk-ins; staff and notices.
 */
export default function LabPortalPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("new");
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [notices, setNotices] = useState([]);
  const seq = useRef(0);
  const role = signedInRole();
  const { search } = useLocation();
  const [linkCode] = useState(() => extractClaimCode(new URLSearchParams(search).get("claim") || "") || takePendingClaim());
  const [claimCode, setClaimCode] = useState("");
  const isWorker = WORKER_ROLES.includes(me?.user?.role || role);

  useEffect(() => {
    if (!role) navigate("/login", { replace: true });
    else if (!LAB_PORTAL_ROLES.includes(role)) navigate("/solutions", { replace: true });
  }, [role, navigate]);

  const loadMe = useCallback(async () => {
    try {
      const res = await api.get(apiEndpoints.labPortalMe, { headers: await authHeader() });
      setMe(res.data);
    } catch (err) {
      setError(errorText(err, "Could not load your laboratory."));
    }
  }, []);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await api.get(apiEndpoints.labPortalRequests, { headers: await authHeader(), params: { tab } });
      if (mine !== seq.current) return;
      setRows(res.data.results || []);
      setCounts(res.data.counts || {});
    } catch (err) {
      if (mine !== seq.current) return;
      setRows([]);
      if (err?.response?.status !== 403) setError(errorText(err, "Could not load the lab requests."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (LAB_PORTAL_ROLES.includes(role)) loadMe();
  }, [loadMe, role]);

  useEffect(() => {
    if (me && !me.problem) load();
    else if (me) setLoading(false);
  }, [load, me]);

  useEffect(() => {
    if (linkCode && me && !me.problem && WORKER_ROLES.includes(me.user.role)) {
      setClaimCode(linkCode);
      setClaimOpen(true);
    }
  }, [linkCode, me]);

  const openNotices = async () => {
    setNoticesOpen(true);
    try {
      const res = await api.get(apiEndpoints.labPortalNotices, { headers: await authHeader() });
      const list = Array.isArray(res.data) ? res.data : res.data.results || [];
      setNotices(list);
      const headers = await authHeader();
      await Promise.all(list.filter((n) => !n.read).map((n) => api.post(apiEndpoints.labPortalNoticeRead(n.id), {}, { headers }).catch(() => null)));
      loadMe();
    } catch (err) {
      setNotices([]);
    }
  };

  if (!LAB_PORTAL_ROLES.includes(role)) return null;

  return (
    <Box sx={{ px: 2, py: 2 }} data-testid="lab-portal">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        <ScienceIcon color="primary" />
        <Typography variant="h6" sx={{ mr: 1 }}>POWER Lab Portal</Typography>
        {me && (
          <Typography variant="body2" color="text.secondary" data-testid="lab-portal-name">
            {me.lab.name} · {licenseWord(me.lab.country)} {me.lab.license_number} (exp {me.lab.license_expiry})
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" startIcon={<Badge color="error" badgeContent={me?.unread_notices || 0}><NotificationsIcon fontSize="small" /></Badge>} onClick={openNotices} data-testid="lab-portal-notices">
          Notices
        </Button>
        <Button size="small" onClick={() => setStaffOpen(true)} disabled={!me} data-testid="lab-portal-staff">Staff</Button>
        <Button size="small" variant="contained" disabled={!me || !!me.problem || !isWorker} onClick={() => setClaimOpen(true)} data-testid="lab-portal-claim"
          title={me && !isWorker ? "Only a medical technologist or pathologist can check in a patient" : ""}>
          Check in a patient
        </Button>
      </Stack>

      {me?.problem && <Alert severity="warning" sx={{ mb: 1 }} data-testid="lab-portal-problem">{me.problem}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <Alert severity="info" icon={false} sx={{ mb: 1, py: 0 }}>
        You see only what you need to collect and run each test (Data Privacy Act RA 10173 / HIPAA minimum necessary). Every view and action is logged.
      </Alert>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ minHeight: 36, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 36, py: 0.5, textTransform: "none" } }}
        aria-label="Lab portal tabs"
      >
        {LAB_PORTAL_TABS.map((t) => (
          <Tab key={t.value} value={t.value} data-testid={`lab-tab-${t.value}`} label={`${t.label}${counts[t.value] != null ? ` (${counts[t.value]})` : ""}`} />
        ))}
      </Tabs>

      <TableContainer component={Paper} variant="outlined" sx={{ mt: 0.5 }}>
        <Table size="small" aria-label="Lab requests">
          <TableHead>
            <TableRow sx={{ bgcolor: "#dcfce7" }}>
              <TableCell sx={{ fontWeight: "bold" }}>Request</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Patient</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Tests</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Collection</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Ordered by</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Updated</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows.length === 0 && <TableRow><TableCell colSpan={7}><CircularProgress size={20} /></TableCell></TableRow>}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} data-testid="lab-portal-empty"><Typography variant="body2" color="text.secondary">No lab requests here.</Typography></TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => setOpenId(r.id)} data-testid={`lab-row-${r.id}`}>
                <TableCell>
                  {r.number}
                  {r.priority === "stat" && <Chip size="small" color="error" label="STAT" sx={{ ml: 0.5 }} />}
                  {r.how === "claimed" && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>walk-in</Typography>}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{r.patient.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{[r.patient.age != null ? `${r.patient.age} y` : "", r.patient.sex].filter(Boolean).join(" · ")}</Typography>
                </TableCell>
                <TableCell>{r.tests.map((t) => t.name).join(", ")}</TableCell>
                <TableCell>
                  <Typography variant="body2">{r.collection_label}</Typography>
                  {r.location && <Typography variant="caption" color="text.secondary">{r.location}</Typography>}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{r.provider}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.clinic}</Typography>
                </TableCell>
                <TableCell>{fmtDateTime(r.updated_at)}</TableCell>
                <TableCell><Chip size="small" color={LAB_STATUS_COLOR[r.status] || "default"} label={r.status_label} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <LabRequestDialog open={!!openId} requestId={openId} me={me} onClose={() => setOpenId(null)} onChanged={() => { load(); }} />
      <LabStaffDialog open={staffOpen} me={me} onClose={() => setStaffOpen(false)} />
      <LabClaimDialog open={claimOpen} initialCode={claimCode} onClose={() => { setClaimOpen(false); setClaimCode(""); }}
        onClaimed={(req) => { setClaimOpen(false); setClaimCode(""); setTab("waiting"); load(); setOpenId(req.id); }} />
      <Dialog open={noticesOpen} onClose={() => setNoticesOpen(false)} maxWidth="sm" fullWidth data-testid="lab-notices-dialog">
        <DialogTitle>Notices</DialogTitle>
        <DialogContent dividers>
          {notices.length === 0 && <Typography variant="body2" color="text.secondary">No notices.</Typography>}
          {notices.map((n) => (
            <Box key={n.id} sx={{ mb: 1.5 }}>
              <Typography variant="subtitle2">{n.title}</Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{n.body}</Typography>
              <Typography variant="caption" color="text.secondary">{fmtDateTime(n.created_at)}</Typography>
            </Box>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setNoticesOpen(false)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
