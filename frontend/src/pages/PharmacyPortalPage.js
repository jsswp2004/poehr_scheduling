import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import {
  Alert, Badge, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import LocalPharmacyIcon from "@mui/icons-material/LocalPharmacy";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { toast } from "react-toastify";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import PortalRxDialog, { PORTAL_STATUS_COLOR } from "../components/pharmacyPortal/PortalRxDialog";
import PortalStaffDialog from "../components/pharmacyPortal/PortalStaffDialog";
import PortalPharmacyDetailsDialog from "../components/pharmacyPortal/PortalPharmacyDetailsDialog";
import { DrugName, authHeader, errorText, fmtDateTime } from "../components/pharmacy/pharmacyShared";
import { PORTAL_ROLES } from "../utils/landing";
import { extractClaimCode, takePendingClaim } from "../utils/claimCode";
import ClaimCameraScanner from "../components/pharmacyPortal/ClaimCameraScanner";

export const PORTAL_TABS = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "ready", label: "Ready" },
  { value: "changes", label: "Changes" },
  { value: "renewals", label: "Renewals" },
  { value: "history", label: "History" },
];

/**
 * Claim a printed prescription: the claim code (typed, scanned with a barcode scanner or the camera, or filled in from
 * the QR code's link), the patient's birthdate and the last 4 digits of their mobile number. Five failed tries in an
 * hour lock your pharmacy's claiming for the rest of the hour.
 */
export function ClaimDialog({ open, onClose, onClaimed, initialCode = "" }) {
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
      const res = await api.post(apiEndpoints.portalClaim, { code: extractClaimCode(code), birthdate, mobile_last4: mobile }, { headers: await authHeader() });
      toast.success("Prescription claimed: it is now locked to your pharmacy.");
      onClaimed(res.data);
    } catch (err) {
      setError(errorText(err, "Could not claim the prescription."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth data-testid="claim-dialog">
      <DialogTitle>Claim a prescription</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error" data-testid="claim-error">{error}</Alert>}
          <TextField size="small" label="Claim code (printed under the QR code)" value={code} onChange={(e) => setCode(e.target.value)} inputProps={{ "data-testid": "claim-code" }} />
          <ClaimCameraScanner onCode={setCode} />
          <TextField size="small" type="date" label="Patient's birthdate" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ "data-testid": "claim-birthdate" }} />
          <TextField size="small" label="Last 4 digits of the patient's mobile number" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 4))} inputProps={{ "data-testid": "claim-mobile", inputMode: "numeric" }} />
          <Typography variant="caption" color="text.secondary">Five wrong tries in an hour lock claiming for your pharmacy until the hour is up.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || !code.trim() || !birthdate || mobile.length !== 4} onClick={claim} data-testid="claim-submit">Claim</Button>
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
 * The POWER Pharmacy Portal: an outside pharmacy's inbox of POWER prescriptions. Tabs New, In progress, Ready,
 * Changes, Renewals and History, a Claim button for printed prescriptions, and notices from POWER.
 */
export default function PharmacyPortalPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("new");
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notices, setNotices] = useState([]);
  const seq = useRef(0);
  const role = signedInRole();
  const { search } = useLocation();
  // a QR claim link (/pharmacy-portal/claim?code=...) arrives as ?claim=, or was kept while the pharmacist signed in
  const [linkCode] = useState(() => extractClaimCode(new URLSearchParams(search).get("claim") || "") || takePendingClaim());
  const [claimCode, setClaimCode] = useState("");

  useEffect(() => {
    if (!role) navigate("/login", { replace: true });
    else if (!PORTAL_ROLES.includes(role)) navigate("/solutions", { replace: true });
  }, [role, navigate]);

  const loadMe = useCallback(async () => {
    try {
      const res = await api.get(apiEndpoints.portalMe, { headers: await authHeader() });
      setMe(res.data);
    } catch (err) {
      setError(errorText(err, "Could not load your pharmacy."));
    }
  }, []);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await api.get(apiEndpoints.portalRx, { headers: await authHeader(), params: { tab } });
      if (mine !== seq.current) return;
      setRows(res.data.results || []);
      setCounts(res.data.counts || {});
    } catch (err) {
      if (mine !== seq.current) return;
      setRows([]);
      if (err?.response?.status !== 403) setError(errorText(err, "Could not load the prescriptions."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (PORTAL_ROLES.includes(role)) loadMe();
  }, [loadMe, role]);

  useEffect(() => {
    if (me && !me.problem) load();
    else if (me) setLoading(false);
  }, [load, me]);

  // open Claim with the code from the QR link once we know this login may claim
  useEffect(() => {
    if (linkCode && me && !me.problem && me.user.role === "ext_pharmacist") {
      setClaimCode(linkCode);
      setClaimOpen(true);
    }
  }, [linkCode, me]);

  const openNotices = async () => {
    setNoticesOpen(true);
    try {
      const res = await api.get(apiEndpoints.portalNotices, { headers: await authHeader() });
      setNotices(res.data.results || []);
    } catch (err) {
      setNotices([]);
    }
  };

  if (!PORTAL_ROLES.includes(role)) return null;

  return (
    <Box sx={{ px: 2, py: 2 }} data-testid="pharmacy-portal">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        <LocalPharmacyIcon color="primary" />
        <Typography variant="h6" sx={{ mr: 1 }}>POWER Pharmacy Portal</Typography>
        {me && <Typography variant="body2" color="text.secondary" data-testid="portal-pharmacy-name">{me.pharmacy.name} · FDA LTO {me.pharmacy.fda_lto_number} (exp {me.pharmacy.lto_expiry})</Typography>}
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" startIcon={<Badge color="error" badgeContent={me?.unread_notices || 0}><NotificationsIcon fontSize="small" /></Badge>} onClick={openNotices} data-testid="portal-notices">
          Notices
        </Button>
        <Button size="small" onClick={() => setDetailsOpen(true)} disabled={!me} data-testid="portal-details">Pharmacy details</Button>
        <Button size="small" onClick={() => setStaffOpen(true)} disabled={!me} data-testid="portal-staff">Pharmacists</Button>
        <Button size="small" variant="contained" disabled={!me || !!me.problem || me.user.role !== "ext_pharmacist"} onClick={() => setClaimOpen(true)} data-testid="portal-claim"
          title={me && me.user.role !== "ext_pharmacist" ? "Only a pharmacist can claim a prescription" : ""}>
          Claim a prescription
        </Button>
      </Stack>

      {me?.problem && <Alert severity="warning" sx={{ mb: 1 }} data-testid="portal-problem">{me.problem}</Alert>}
      {me?.details_pending_review && (
        <Alert severity="info" sx={{ mb: 1 }} data-testid="portal-details-pending">
          Pending POWER review: your change to the registered name or LTO. <Button size="small" onClick={() => setDetailsOpen(true)}>View</Button>
        </Alert>
      )}
      {linkCode && me && me.user.role !== "ext_pharmacist" && (
        <Alert severity="info" sx={{ mb: 1 }} data-testid="portal-claim-not-pharmacist">
          Claim code {linkCode}: only a pharmacist can claim a prescription. Ask one of your pharmacists to sign in to the portal and claim it.
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <Alert severity="info" icon={false} sx={{ mb: 1, py: 0 }}>
        You see only what you need to fill each prescription (Data Privacy Act, RA 10173). Every view and action is logged.
      </Alert>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ minHeight: 36, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 36, py: 0.5, textTransform: "none" } }}
        aria-label="Portal tabs"
      >
        {PORTAL_TABS.map((t) => (
          <Tab key={t.value} value={t.value} data-testid={`portal-tab-${t.value}`} label={`${t.label}${counts[t.value] != null ? ` (${counts[t.value]})` : ""}`} />
        ))}
      </Tabs>

      <TableContainer component={Paper} variant="outlined" sx={{ mt: 0.5 }}>
        <Table size="small" aria-label="Portal prescriptions">
          <TableHead>
            <TableRow sx={{ bgcolor: "#dbeafe" }}>
              <TableCell sx={{ fontWeight: "bold" }}>Rx</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Patient</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Medication</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Quantity</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Prescriber</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Updated</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows.length === 0 && <TableRow><TableCell colSpan={7}><CircularProgress size={20} /></TableCell></TableRow>}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} data-testid="portal-empty"><Typography variant="body2" color="text.secondary">No prescriptions here.</Typography></TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => setOpenId(r.id)} data-testid={`portal-row-${r.id}`}>
                <TableCell>{r.rx_number}{r.how === "claimed" && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>claimed</Typography>}</TableCell>
                <TableCell>
                  <Typography variant="body2">{r.patient.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.patient.age != null ? `${r.patient.age} y` : ""}</Typography>
                </TableCell>
                <TableCell><DrugName drug={r.drug} dangerous={r.dangerous_drug} detail={r.strength} testId={`portal-drug-${r.id}`} /></TableCell>
                <TableCell>{r.quantity} {r.quantity_unit}</TableCell>
                <TableCell>
                  <Typography variant="body2">{r.prescriber}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.clinic}</Typography>
                </TableCell>
                <TableCell>{fmtDateTime(r.updated_at)}</TableCell>
                <TableCell>
                  <Chip size="small" color={PORTAL_STATUS_COLOR[r.status] || "default"} label={r.status_label} />
                  {r.pending_requests.length > 0 && <Chip size="small" variant="outlined" color="warning" label="Waiting on prescriber" sx={{ ml: 0.5 }} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <PortalRxDialog open={!!openId} rxId={openId} me={me} onClose={() => setOpenId(null)} onChanged={() => { load(); loadMe(); }} />
      <PortalStaffDialog open={staffOpen} onClose={() => setStaffOpen(false)} />
      <PortalPharmacyDetailsDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} onSaved={loadMe} />
      <ClaimDialog open={claimOpen} initialCode={claimCode} onClose={() => { setClaimOpen(false); setClaimCode(""); }} onClaimed={(rx) => { setClaimOpen(false); setClaimCode(""); setTab("in_progress"); load(); setOpenId(rx.id); }} />
      <Dialog open={noticesOpen} onClose={() => setNoticesOpen(false)} maxWidth="sm" fullWidth data-testid="portal-notices-dialog">
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
