import { useState, useEffect, useCallback } from "react";
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
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis, faPlus, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import moment from "moment";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import AppliesToPicker from "../components/staffing/AppliesToPicker";

const EMPTY_FORM = {
  name: "",
  state: "",
  facility_type: "nursing_home",
  hppd_min: "",
  min_licensed_hppd: "",
  min_cna_hppd: "",
  max_residents_per_staff: "",
  min_rn_per_shift: "0",
  source: "",
  notes: "",
  effective_date: "",
  last_verified_date: "",
  needs_verification: false,
  count_all_roles: false,
  status: "active",
  shared: false,
};

const FIELD_LABELS = {
  name: "Name",
  state: "State",
  facility_type: "Facility type",
  hppd_min: "Total hours per resident per day",
  min_licensed_hppd: "Licensed (RN + LPN) hours per resident per day",
  min_cna_hppd: "CNA hours per resident per day",
  max_residents_per_staff: "Max residents per staff",
  min_rn_per_shift: "Minimum RNs per shift",
  source: "Source",
  notes: "Notes",
  effective_date: "Effective date",
  last_verified_date: "Last verified",
  needs_verification: "Needs verification",
  status: "Status",
  rule_id: "Selected rule",
  from_rule_name: "Copied from",
  from_rule_id: "Copied from rule #",
  note: "Note",
};

const ACTION_LABELS = {
  created: "Created",
  updated: "Updated",
  deactivated: "Deactivated",
  duplicated: "Duplicated",
  verified: "Marked verified",
  selected: "Selected for organization",
};

const num = (v) => (v === null || v === undefined || v === "" ? "-" : Number(v).toFixed(2).replace(/\.?0+$/, "") || "0");
const hasNum = (v) => v !== null && v !== undefined && v !== "" && Number(v) > 0;

const showValue = (v) => {
  if (v === null || v === undefined || v === "") return "(blank)";
  if (v === true) return "yes";
  if (v === false) return "no";
  return String(v);
};

const toForm = (rule) => ({
  ...EMPTY_FORM,
  name: rule.name || "",
  state: rule.state || "",
  facility_type: rule.facility_type || "nursing_home",
  hppd_min: rule.hppd_min ?? "",
  min_licensed_hppd: rule.min_licensed_hppd ?? "",
  min_cna_hppd: rule.min_cna_hppd ?? "",
  max_residents_per_staff: rule.max_residents_per_staff ?? "",
  min_rn_per_shift: rule.min_rn_per_shift ?? 0,
  source: rule.source || "",
  notes: rule.notes || "",
  effective_date: rule.effective_date || "",
  last_verified_date: rule.last_verified_date || "",
  needs_verification: !!rule.needs_verification,
  count_all_roles: !!rule.count_all_roles,
  status: rule.status || "active",
  shared: rule.scope === "shared",
});

function formatApiError(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.error) return data.error;
  if (data.detail) return data.detail;
  if (typeof data === "object") {
    const parts = Object.entries(data).map(
      ([k, v]) => `${(FIELD_LABELS[k] || k.replace(/_/g, " "))}: ${Array.isArray(v) ? v.join(" ") : v}`
    );
    if (parts.length) return parts.join(" ");
  }
  return fallback;
}

const errorText = (err, fallback) => formatApiError(err?.response?.data, fallback);

// One sentence per requirement, skipping the ones a standard does not set.
function requirementLines(r) {
  const line1 = Number(r.hppd_min) > 0 ? `${num(r.hppd_min)} nursing hours per resident per day${r.count_all_roles ? " · all roles count" : ""}` : `Ratio only${r.count_all_roles ? " · all roles count" : ""}`;
  const line2 = `${hasNum(r.max_residents_per_staff) ? `1 staff per ${r.max_residents_per_staff} residents` : "No ratio set"} · ${
    hasNum(r.min_rn_per_shift) ? `${r.min_rn_per_shift} RN every shift` : "No RN minimum"
  }`;
  const extras = [];
  if (hasNum(r.min_licensed_hppd)) extras.push(`${num(r.min_licensed_hppd)} licensed`);
  if (hasNum(r.min_cna_hppd)) extras.push(`${num(r.min_cna_hppd)} CNA`);
  return [line1, line2, extras.join(" · ")];
}

function Stat({ label, value }) {
  return (
    <Box sx={{ flex: "1 1 150px", bgcolor: "grey.100", borderRadius: 2, px: 1.75, py: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 600, fontFamily: "monospace" }}>{value}</Typography>
    </Box>
  );
}

function StaffingRulesTab({ isAdmin = false }) {
  const token = getAccessToken();
  const headers = getAuthHeaders(token);

  const [data, setData] = useState({ rules: [], selected_rule_id: null, effective_rule_id: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [menu, setMenu] = useState(null); // { anchorEl, rule }

  const [form, setForm] = useState(null); // null = closed
  const [editing, setEditing] = useState(null); // rule being edited, null = adding
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [deactivateFor, setDeactivateFor] = useState(null);
  const [useFor, setUseFor] = useState(undefined); // undefined = closed, null = state default, rule = that rule
  const [dialogBusy, setDialogBusy] = useState(false);
  // "Applies to" choice: in the add/edit panel and in the Use / Edit units dialog.
  const [applies, setApplies] = useState({ all: true, unitIds: [] });
  const [appliesTouched, setAppliesTouched] = useState(false);
  const [appliesError, setAppliesError] = useState("");

  const canEditShared = !!data.can_edit_shared;
  const canEditCustom = !!data.can_edit_custom;

  const load = useCallback(async () => {
    try {
      const res = await axios.get(apiEndpoints.staffingRules, { headers });
      setData(res.data);
      setError("");
    } catch (err) {
      setError(errorText(err, "Failed to load staffing standards."));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const rules = data.rules || [];
  const units = data.units || [];
  const unitMode = data.unit_mode || "all";
  const ruleNames = Object.fromEntries(rules.map((r) => [r.id, r.name]));
  const unitName = (id) => (units.find((u) => u.id === id) || {}).name || "";
  const appliesFor = (rule) => ({ all: !!rule.applies_all, unitIds: rule.unit_ids || [] });
  const effective = rules.find((r) => r.id === data.effective_rule_id);
  const usingStateDefault = !data.selected_rule_id;
  const inactiveCount = rules.filter((r) => r.status === "inactive").length;
  const shownRules = rules.filter((r) => r.status !== "inactive" || showInactive);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 5000);
  };

  // ---- add / edit ----
  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, shared: false });
    setApplies({ all: true, unitIds: [] });
    setAppliesTouched(true);
    setAppliesError("");
    setFormError("");
    setFieldErrors({});
    setPanelOpen(true);
  };

  const openEdit = (rule) => {
    setEditing(rule);
    setForm(toForm(rule));
    setApplies(appliesFor(rule));
    setAppliesTouched(false);
    setAppliesError("");
    setFormError("");
    setFieldErrors({});
    setPanelOpen(true);
  };

  const closePanel = () => {
    if (!saving) setPanelOpen(false);
  };

  const setField = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
  };

  const editingShared = editing ? editing.scope === "shared" : !!form?.shared;

  const save = async () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Enter a name.";
    // 0 hours is fine when the standard is only a staff-to-resident ratio.
    const hasRatio = form.max_residents_per_staff !== "" && Number(form.max_residents_per_staff) > 0;
    if (form.hppd_min === "" || Number(form.hppd_min) < 0 || (Number(form.hppd_min) === 0 && !hasRatio)) {
      errs.hppd_min = "Enter the total hours per resident per day (0 is allowed if you set a ratio).";
    }
    if (editingShared && !form.state.trim()) errs.state = "Enter the state.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setFormError("");
    const body = {
      name: form.name,
      state: editingShared ? form.state : "",
      facility_type: form.facility_type,
      hppd_min: form.hppd_min,
      min_licensed_hppd: form.min_licensed_hppd,
      min_cna_hppd: form.min_cna_hppd,
      max_residents_per_staff: form.max_residents_per_staff,
      min_rn_per_shift: form.min_rn_per_shift,
      source: form.source,
      notes: form.notes,
      effective_date: form.effective_date,
      last_verified_date: form.last_verified_date,
      needs_verification: form.needs_verification,
      count_all_roles: form.count_all_roles,
      status: form.status,
    };
    try {
      let ruleId = editing ? editing.id : null;
      if (editing) {
        await axios.patch(apiEndpoints.staffingRuleDetail(editing.id), body, { headers });
        flash(`Saved "${form.name}".`);
      } else {
        const created = await axios.post(apiEndpoints.staffingRules, { ...body, shared: form.shared }, { headers });
        ruleId = created.data.id;
        flash(`Added "${form.name}".`);
      }
      // Where it applies (custom standards only; a draft is not applied yet).
      const applyNow = !editingShared && form.status === "active" && appliesTouched && (applies.all || applies.unitIds.length > 0);
      if (applyNow) {
        try {
          await putUnits(ruleId, applies);
        } catch (err) {
          setFormError(`Saved, but the units were not changed: ${errorText(err, "Could not set the units.")}`);
          load();
          return;
        }
      }
      setPanelOpen(false);
      load();
    } catch (err) {
      setFormError(errorText(err, "Could not save the standard."));
    } finally {
      setSaving(false);
    }
  };

  // ---- row actions ----
  const putUnits = (ruleId, choice) =>
    axios.put(
      apiEndpoints.staffingRuleUnits(ruleId),
      { all_units: !!choice.all, unit_ids: choice.all ? [] : choice.unitIds },
      { headers }
    );

  const openUse = (rule) => {
    setApplies(rule.applies_all || rule.unit_ids?.length ? appliesFor(rule) : { all: true, unitIds: [] });
    setAppliesError("");
    setUseFor(rule);
  };

  const confirmUse = async () => {
    const rule = useFor;
    if (rule && !applies.all && applies.unitIds.length === 0 && !(rule.unit_ids || []).length) {
      setAppliesError("Choose at least one unit.");
      return;
    }
    setDialogBusy(true);
    try {
      if (rule) {
        await putUnits(rule.id, applies);
        flash(
          applies.all
            ? `Your organization now uses "${rule.name}" for all units.`
            : `"${rule.name}" now applies to ${applies.unitIds.map(unitName).join(", ") || "no units"}.`
        );
      } else {
        await axios.put(apiEndpoints.staffingRuleSelection, { rule_id: null }, { headers });
        flash("Your organization is back on its state's standard.");
      }
      setUseFor(undefined);
      load();
    } catch (err) {
      if (rule && err.response && err.response.status === 400) {
        setAppliesError(errorText(err, "Could not change the units."));
      } else {
        setUseFor(undefined);
        setError(errorText(err, "Could not change the standard."));
      }
    } finally {
      setDialogBusy(false);
    }
  };

  const duplicate = async (rule) => {
    try {
      const res = await axios.post(apiEndpoints.staffingRuleDuplicate(rule.id), {}, { headers });
      flash(`Created a custom copy: "${res.data.name}". Edit it to set your own numbers.`);
      await load();
      openEdit(res.data);
    } catch (err) {
      setError(errorText(err, "Could not duplicate the standard."));
    }
  };

  const markVerified = async (rule) => {
    try {
      await axios.patch(apiEndpoints.staffingRuleDetail(rule.id), { needs_verification: false }, { headers });
      flash(`"${rule.name}" marked as verified.`);
      load();
    } catch (err) {
      setError(errorText(err, "Could not mark the standard verified."));
    }
  };

  const confirmDeactivate = async () => {
    const rule = deactivateFor;
    setDialogBusy(true);
    try {
      await axios.delete(apiEndpoints.staffingRuleDetail(rule.id), { headers });
      flash(`"${rule.name}" deactivated.`);
      setDeactivateFor(null);
      load();
    } catch (err) {
      setDeactivateFor(null);
      setError(errorText(err, "Could not deactivate the standard."));
    } finally {
      setDialogBusy(false);
    }
  };

  const reactivate = async (rule) => {
    try {
      await axios.patch(apiEndpoints.staffingRuleDetail(rule.id), { status: "active" }, { headers });
      flash(`"${rule.name}" reactivated.`);
      load();
    } catch (err) {
      setError(errorText(err, "Could not reactivate the standard."));
    }
  };

  const openHistory = async (rule) => {
    setHistoryFor(rule);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const res = await axios.get(apiEndpoints.staffingRuleAudit(rule.id), { headers });
      setHistory(res.data || []);
    } catch (err) {
      setError(errorText(err, "Could not load the history."));
      setHistoryFor(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const renderChanges = (changes) => {
    const entries = Object.entries(changes || {});
    if (entries.length === 0) return null;
    return entries.map(([key, val]) => {
      const label = FIELD_LABELS[key] || key;
      if (Array.isArray(val) && val.length === 2) {
        return (
          <Typography variant="body2" key={key} sx={{ mt: 0.5 }}>
            {label}:{" "}
            <Box component="span" sx={{ color: "text.secondary", textDecoration: "line-through" }}>
              {showValue(val[0])}
            </Box>{" "}
            &rarr; <strong>{showValue(val[1])}</strong>
          </Typography>
        );
      }
      return (
        <Typography variant="body2" key={key} sx={{ mt: 0.5 }}>
          {label}: {showValue(val)}
        </Typography>
      );
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const menuRule = menu && menu.rule;
  const heroWarn = !effective || (effective.needs_verification && !effective.is_custom);
  const heroWhy = effective
    ? effective.is_custom
      ? "A custom standard chosen for your organization."
      : usingStateDefault
      ? "This is the standard for your location's state."
      : "Chosen for your organization."
    : "";

  // Plain-language reading of the form values.
  const meaning = form
    ? [
        form.hppd_min !== "" ? `${num(form.hppd_min)} nursing hours per resident per day` : null,
        hasNum(form.min_licensed_hppd) || hasNum(form.min_cna_hppd)
          ? `(${[hasNum(form.min_licensed_hppd) ? `${num(form.min_licensed_hppd)} licensed` : null, hasNum(form.min_cna_hppd) ? `${num(form.min_cna_hppd)} CNA` : null]
              .filter(Boolean)
              .join(", ")})`
          : null,
        hasNum(form.max_residents_per_staff) ? `1 staff per ${form.max_residents_per_staff} residents` : null,
        hasNum(form.min_rn_per_shift) ? `${form.min_rn_per_shift} RN on every shift` : null,
      ].filter(Boolean)
    : [];

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
          Staffing Standards
        </Typography>
        {isAdmin && (
          <Button variant="contained" startIcon={<FontAwesomeIcon icon={faPlus} />} onClick={openAdd} sx={{ minHeight: 44, px: 2.5 }}>
            Add a standard
          </Button>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}

      {unitMode === "selected" && (
        <Paper component="section" aria-label="Standards by unit" variant="outlined" sx={{ p: 3, mb: 3, borderWidth: 2, borderColor: "primary.main" }}>
          <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "primary.dark" }}>
            Standards are set per unit
          </Typography>
          <Stack spacing={0.75} sx={{ mt: 1 }}>
            {units.map((u) => {
              const owner = (data.unit_owner || {})[String(u.id)];
              return (
                <Stack key={u.id} direction="row" spacing={1.5} alignItems="center">
                  <Typography sx={{ width: 160, fontWeight: 600 }}>{u.name}</Typography>
                  {owner ? (
                    <Typography>{ruleNames[owner] || "Standard"}</Typography>
                  ) : (
                    <Chip size="small" label="No standard applied" />
                  )}
                </Stack>
              );
            })}
          </Stack>
          {(data.uncovered_unit_ids || []).length > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {(data.uncovered_unit_ids || []).map(unitName).join(", ")} {(data.uncovered_unit_ids || []).length === 1 ? "has" : "have"} no
              standard. The calendar shows "No standard applied" and does not check staffing there.
            </Alert>
          )}
          {isAdmin && (
            <Button variant="outlined" color="inherit" onClick={() => setUseFor(null)} sx={{ mt: 2, minHeight: 44, borderColor: "grey.400" }}>
              Go back to one standard for all units
            </Button>
          )}
        </Paper>
      )}

      {/* Standard in use */}
      {unitMode === "all" && (
      <Paper
        component="section"
        aria-label="Standard in use"
        variant="outlined"
        sx={{
          p: 3,
          mb: 3,
          borderWidth: 2,
          borderColor: heroWarn ? "warning.main" : "primary.main",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {effective ? (
          <>
            <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" useFlexGap>
              <Box sx={{ flex: "1 1 400px", minWidth: 0 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "primary.dark" }}>
                  Your facility is checked against
                </Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 600 }}>{effective.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {heroWhy}
                </Typography>
                {effective.needs_verification && !effective.is_custom && (
                  <Typography variant="body2" sx={{ mt: 1, color: "warning.dark", fontWeight: 600 }}>
                    This standard is awaiting verification against the official regulation text.
                  </Typography>
                )}
              </Box>
              {isAdmin && !usingStateDefault && (
                <Button variant="outlined" color="inherit" onClick={() => setUseFor(null)} sx={{ minHeight: 44, borderColor: "grey.400" }}>
                  Go back to my state's standard
                </Button>
              )}
            </Stack>
            <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
              <Stat label="Total nursing hours" value={num(effective.hppd_min)} />
              <Stat label="Licensed hours" value={hasNum(effective.min_licensed_hppd) ? num(effective.min_licensed_hppd) : "Not set"} />
              <Stat label="CNA hours" value={hasNum(effective.min_cna_hppd) ? num(effective.min_cna_hppd) : "Not set"} />
              <Stat label="Residents per staff" value={hasNum(effective.max_residents_per_staff) ? `1 : ${effective.max_residents_per_staff}` : "Not set"} />
              <Stat label="RNs per shift" value={hasNum(effective.min_rn_per_shift) ? effective.min_rn_per_shift : "Not set"} />
            </Stack>
          </>
        ) : (
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <Box sx={{ color: "warning.dark", mt: "3px", display: "flex" }}>
              <FontAwesomeIcon icon={faTriangleExclamation} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600 }}>No verified staffing standard applies to your organization's state yet</Typography>
              <Typography variant="body2">
                Pick a standard below or add a custom one to enforce your own requirements.
              </Typography>
            </Box>
          </Stack>
        )}
        <Typography variant="body2" color="text.secondary">
          Used by HPPD coverage requirements (Assign Schedule) and by compliance checks.{" "}
          {canEditShared
            ? "As system admin you manage the shared state standards, and you act for the organization chosen at the top of the page."
            : canEditCustom
            ? "Your state's standard is managed centrally. You can copy it as your own custom standard, then choose which one your organization uses."
            : "Only administrators can change which standard applies."}
        </Typography>
      </Paper>
      )}

      {/* All standards */}
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <Typography variant="h6" component="h3">
          All standards
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Switch checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} slotProps={{ input: { "aria-label": "Show inactive standards" } }} />
          <Typography variant="body2">Show inactive ({inactiveCount})</Typography>
        </Stack>
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table sx={{ minWidth: 1100 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ pl: 2.5 }}>Standard</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Applies to</TableCell>
              <TableCell>Requirements</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right" sx={{ pr: 2.5 }}>
                <Box component="span" sx={{ position: "absolute", left: -9999 }}>
                  Actions
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shownRules.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No standards available.</Typography>
                </TableCell>
              </TableRow>
            )}
            {shownRules.map((r) => {
              const inUse = unitMode === "all" ? r.id === data.effective_rule_id : (r.unit_ids || []).length > 0;
              const [line1, line2, line3] = requirementLines(r);
              const canUse = isAdmin && r.status === "active" && !r.applies_all && !(r.unit_ids || []).length;
              const hasMenu = isAdmin || r.editable;
              return (
                <TableRow
                  key={r.id}
                  hover
                  sx={{
                    verticalAlign: "top",
                    ...(r.status === "inactive" && { opacity: 0.6 }),
                    ...(inUse && { bgcolor: (th) => alpha(th.palette.primary.main, 0.06) }),
                  }}
                >
                  <TableCell sx={{ pl: 2.5, maxWidth: 300 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 15 }}>{r.name}</Typography>
                    {r.source && (
                      <Typography variant="body2" color="text.secondary">
                        {r.source}
                      </Typography>
                    )}
                    {r.notes && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {r.notes}
                      </Typography>
                    )}
                    {r.last_verified_date && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Verified {moment(r.last_verified_date).format("MMM D, YYYY")}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={r.scope === "custom" ? "Custom (your org)" : r.state || "Shared"} />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 220 }}>
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                      {r.applies_all && <Chip size="small" color="primary" variant="outlined" label="All units" />}
                      {(r.unit_ids || []).map((id) => (
                        <Chip key={id} size="small" color="primary" variant="outlined" label={unitName(id)} />
                      ))}
                      {!r.applies_all && !(r.unit_ids || []).length && <Chip size="small" label="Not in use" />}
                    </Stack>
                    {isAdmin && r.status === "active" && (r.applies_all || (r.unit_ids || []).length > 0) && units.length > 0 && (
                      <Button size="small" onClick={() => openUse(r)} sx={{ mt: 0.5, px: 0 }}>
                        Edit units
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {line1}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {line2}
                    </Typography>
                    {line3 && (
                      <Typography variant="body2" color="text.secondary">
                        {line3}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.75} alignItems="flex-start">
                      {inUse && <Chip size="small" label="In use" sx={{ fontWeight: 600, bgcolor: (th) => alpha(th.palette.primary.main, 0.14), color: "primary.dark" }} />}
                      {r.needs_verification && (
                        <Chip size="small" label="Needs verification" sx={{ fontWeight: 600, bgcolor: (th) => alpha(th.palette.warning.main, 0.16), color: "warning.dark" }} />
                      )}
                      {r.status !== "active" && <Chip size="small" label={r.status === "draft" ? "Draft" : "Inactive"} sx={{ fontWeight: 600 }} />}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ pr: 2.5, whiteSpace: "nowrap" }}>
                    {canUse && (
                      <Button variant="outlined" onClick={() => openUse(r)} sx={{ minHeight: 44 }}>
                        Use this standard
                      </Button>
                    )}
                    {r.editable && (
                      <Button variant="outlined" color="inherit" onClick={() => openEdit(r)} sx={{ minHeight: 44, ml: 0.75, borderColor: "grey.400" }}>
                        Edit
                      </Button>
                    )}
                    {hasMenu && (
                      <IconButton
                        aria-label={`More actions for ${r.name}`}
                        aria-haspopup="menu"
                        onClick={(e) => setMenu({ anchorEl: e.currentTarget, rule: r })}
                        sx={{ ml: 0.75, width: 44, height: 44 }}
                      >
                        <FontAwesomeIcon icon={faEllipsis} />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Row menu */}
      <Menu anchorEl={menu && menu.anchorEl} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { minWidth: 220 } } }}>
        {isAdmin && (
          <MenuItem
            onClick={() => {
              const r = menuRule;
              setMenu(null);
              duplicate(r);
            }}
            sx={{ minHeight: 44 }}
          >
            Duplicate as custom
          </MenuItem>
        )}
        {isAdmin && (
          <MenuItem
            onClick={() => {
              const r = menuRule;
              setMenu(null);
              openHistory(r);
            }}
            sx={{ minHeight: 44 }}
          >
            View history
          </MenuItem>
        )}
        {menuRule && menuRule.editable && menuRule.needs_verification && (
          <MenuItem
            onClick={() => {
              const r = menuRule;
              setMenu(null);
              markVerified(r);
            }}
            sx={{ minHeight: 44 }}
          >
            Mark verified
          </MenuItem>
        )}
        {menuRule && menuRule.editable && <Divider />}
        {menuRule && menuRule.editable && menuRule.status !== "inactive" && (
          <MenuItem
            onClick={() => {
              setDeactivateFor(menuRule);
              setMenu(null);
            }}
            sx={{ minHeight: 44, color: "error.main", fontWeight: 600 }}
          >
            Deactivate
          </MenuItem>
        )}
        {menuRule && menuRule.editable && menuRule.status === "inactive" && (
          <MenuItem
            onClick={() => {
              const r = menuRule;
              setMenu(null);
              reactivate(r);
            }}
            sx={{ minHeight: 44 }}
          >
            Reactivate
          </MenuItem>
        )}
      </Menu>

      {/* Add / edit panel */}
      {form && (
        <Drawer anchor="right" open={panelOpen} onClose={closePanel} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 480 } } } }}>
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2.5, borderBottom: 1, borderColor: "divider" }}>
              <Typography variant="h6" component="h3">
                {editing ? `Edit ${editing.name}` : "Add a standard"}
              </Typography>
              <IconButton aria-label="Close panel" onClick={closePanel} sx={{ width: 44, height: 44 }}>
                <FontAwesomeIcon icon={faXmark} />
              </IconButton>
            </Stack>

            <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5 }}>
              <Stack spacing={2.5}>
                {formError && <Alert severity="error">{formError}</Alert>}

                {editing && editing.scope === "shared" && (
                  <Alert severity="info">
                    This is a shared state standard. Changes apply to every organization in {editing.state || "this state"} that uses
                    it, and are recorded in the history.
                  </Alert>
                )}

                {!editing && canEditShared && (
                  <Paper variant="outlined" sx={{ p: 2, display: "flex", gap: 2, alignItems: "center", justifyContent: "space-between" }}>
                    <Box>
                      <Typography sx={{ fontWeight: 600 }}>Shared state standard</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Visible to all organizations. Leave off for a custom standard that only your organization uses.
                      </Typography>
                    </Box>
                    <Switch checked={!!form.shared} onChange={setField("shared")} slotProps={{ input: { "aria-label": "Shared state standard" } }} />
                  </Paper>
                )}

                <Stack direction="row" spacing={1.5}>
                  <TextField
                    label="Name"
                    fullWidth
                    value={form.name}
                    onChange={setField("name")}
                    error={!!fieldErrors.name}
                    helperText={fieldErrors.name}
                    autoFocus
                  />
                  {editingShared && (
                    <TextField
                      label="State (2-letter)"
                      value={form.state}
                      onChange={setField("state")}
                      error={!!fieldErrors.state}
                      helperText={fieldErrors.state}
                      slotProps={{ htmlInput: { maxLength: 20 } }}
                      sx={{ width: 150 }}
                    />
                  )}
                </Stack>
                {!editingShared && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
                    Custom standard. It only applies to your organization.
                  </Typography>
                )}
                {!editingShared && (
                  <AppliesToPicker
                    units={units}
                    value={applies}
                    onChange={(v) => {
                      setApplies(v);
                      setAppliesTouched(true);
                    }}
                    owners={unitMode === "selected" ? data.unit_owner || {} : {}}
                    ruleNames={ruleNames}
                    ruleId={editing ? editing.id : null}
                  />
                )}

                <Box>
                  <Typography variant="caption" sx={{ display: "block", mb: 1.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "text.secondary" }}>
                    Requirements
                  </Typography>
                  <Stack spacing={2}>
                    <TextField
                      label="Total nursing/staff hours per resident per day"
                      type="number"
                      value={form.hppd_min}
                      onChange={setField("hppd_min")}
                      error={!!fieldErrors.hppd_min}
                      helperText={fieldErrors.hppd_min || "Required. Use 0 if only the staff-to-resident ratio applies."}
                      slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                      sx={{ maxWidth: 320 }}
                    />
                    <Stack direction="row" spacing={1.5}>
                      <TextField
                        label="Licensed (RN + LPN) hours"
                        type="number"
                        fullWidth
                        value={form.min_licensed_hppd}
                        onChange={setField("min_licensed_hppd")}
                        helperText="Optional"
                        slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                      />
                      <TextField
                        label="CNA hours"
                        type="number"
                        fullWidth
                        value={form.min_cna_hppd}
                        onChange={setField("min_cna_hppd")}
                        helperText="Optional"
                        slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                      />
                    </Stack>
                    <Stack direction="row" spacing={1.5}>
                      <TextField
                        label="Max residents per staff"
                        type="number"
                        fullWidth
                        value={form.max_residents_per_staff}
                        onChange={setField("max_residents_per_staff")}
                        helperText="Leave blank for no ratio rule"
                        slotProps={{ htmlInput: { min: 0, step: 1 } }}
                      />
                      <TextField
                        label="Minimum RNs per shift"
                        type="number"
                        fullWidth
                        value={form.min_rn_per_shift}
                        onChange={setField("min_rn_per_shift")}
                        helperText="0 = no per-shift RN rule"
                        slotProps={{ htmlInput: { min: 0, step: 1 } }}
                      />
                      <Paper variant="outlined" sx={{ p: 2, display: "flex", gap: 2, alignItems: "center", justifyContent: "space-between" }}>
                        <Box>
                          <Typography sx={{ fontWeight: 600 }}>Count all staff roles</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Off: only RNs, LPNs and CNAs count. On: every role counts toward the hours and the ratio, such as an activities aide.
                          </Typography>
                        </Box>
                        <Switch
                          checked={!!form.count_all_roles}
                          onChange={setField("count_all_roles")}
                          slotProps={{ input: { "aria-label": "Count all staff roles" } }}
                        />
                      </Paper>
                    </Stack>
                  </Stack>
                </Box>

                <Box>
                  <Typography variant="caption" sx={{ display: "block", mb: 1.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "text.secondary" }}>
                    Where it comes from
                  </Typography>
                  <Stack spacing={2}>
                    <TextField label="Source" fullWidth value={form.source} onChange={setField("source")} helperText="Regulation or policy this comes from" />
                    <TextField label="Notes (optional)" fullWidth multiline minRows={2} value={form.notes} onChange={setField("notes")} />
                    <Stack direction="row" spacing={1.5}>
                      <TextField
                        label="Effective date"
                        type="date"
                        fullWidth
                        value={form.effective_date}
                        onChange={setField("effective_date")}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <TextField
                        label="Last verified"
                        type="date"
                        fullWidth
                        value={form.last_verified_date}
                        onChange={setField("last_verified_date")}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </Stack>
                    {editingShared && (
                      <Paper variant="outlined" sx={{ p: 2, display: "flex", gap: 2, alignItems: "center", justifyContent: "space-between" }}>
                        <Box>
                          <Typography sx={{ fontWeight: 600 }}>Still needs verification</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Shows a warning to everyone using this standard until it is checked against the official text.
                          </Typography>
                        </Box>
                        <Switch
                          checked={!!form.needs_verification}
                          onChange={setField("needs_verification")}
                          slotProps={{ input: { "aria-label": "Still needs verification" } }}
                        />
                      </Paper>
                    )}
                  </Stack>
                </Box>

                <Box>
                  <Typography id="standard-status" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Status
                  </Typography>
                  <ToggleButtonGroup
                    exclusive
                    fullWidth
                    size="small"
                    color="primary"
                    aria-labelledby="standard-status"
                    value={form.status}
                    onChange={(e, v) => v && setForm((f) => ({ ...f, status: v }))}
                  >
                    <ToggleButton value="active" sx={{ minHeight: 44 }}>
                      Active
                    </ToggleButton>
                    <ToggleButton value="draft" sx={{ minHeight: 44 }}>
                      Draft
                    </ToggleButton>
                    <ToggleButton value="inactive" sx={{ minHeight: 44 }}>
                      Inactive
                    </ToggleButton>
                  </ToggleButtonGroup>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Draft standards are saved but not offered for use yet.
                  </Typography>
                </Box>

                {meaning.length > 0 && (
                  <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: "info.main", bgcolor: (th) => alpha(th.palette.info.main, 0.07) }}>
                    <Typography variant="caption" sx={{ display: "block", mb: 0.75, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "info.dark" }}>
                      What this means
                    </Typography>
                    <Typography sx={{ lineHeight: 1.5 }}>A facility on this standard needs {meaning.join(", ")}.</Typography>
                  </Box>
                )}
              </Stack>
            </Box>

            <Stack direction="row" spacing={1.5} justifyContent="flex-end" sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider" }}>
              <Button variant="outlined" color="inherit" onClick={closePanel} disabled={saving} sx={{ minHeight: 48, borderColor: "grey.400" }}>
                Cancel
              </Button>
              <Button variant="contained" onClick={save} disabled={saving} sx={{ minHeight: 48, px: 3 }}>
                {saving ? "Saving..." : editing ? "Save changes" : "Add standard"}
              </Button>
            </Stack>
          </Box>
        </Drawer>
      )}

      {/* Use this standard */}
      <Dialog open={useFor !== undefined} onClose={dialogBusy ? undefined : () => setUseFor(undefined)} maxWidth="xs" fullWidth>
        <DialogTitle>{useFor ? `Where does "${useFor.name}" apply?` : "Go back to your state's standard?"}</DialogTitle>
        <DialogContent>
          {useFor ? (
            <Stack spacing={1.5}>
              <Typography>Compliance checks and HPPD coverage requirements for your facility will use these numbers:</Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.75, lineHeight: 1.6 }}>
                <li>{num(useFor.hppd_min)} nursing hours per resident per day</li>
                {hasNum(useFor.max_residents_per_staff) && <li>1 staff per {useFor.max_residents_per_staff} residents</li>}
                {hasNum(useFor.min_rn_per_shift) && <li>{useFor.min_rn_per_shift} RN every shift</li>}
              </Box>
              <AppliesToPicker
                units={units}
                value={applies}
                onChange={(v) => {
                  setApplies(v);
                  setAppliesError("");
                }}
                owners={unitMode === "selected" ? data.unit_owner || {} : {}}
                ruleNames={ruleNames}
                ruleId={useFor.id}
                error={appliesError}
              />
              {unitMode === "all" && effective && (
                <Typography variant="body2" color="text.secondary">
                  Units you do not choose stay on <strong>{effective.name}</strong>.
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography>
              Compliance checks and HPPD coverage requirements will go back to the standard for your location's state. Your custom
              standards stay available.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setUseFor(undefined)} disabled={dialogBusy} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmUse} disabled={dialogBusy} sx={{ minHeight: 44, px: 2.5 }}>
            {dialogBusy ? "Saving..." : useFor ? "Save" : "Go back"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* History */}
      <Dialog open={!!historyFor} onClose={() => setHistoryFor(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          History
          <Typography variant="body2" color="text.secondary" component="div">
            {historyFor?.name}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {historyLoading && (
            <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {!historyLoading && history.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No changes recorded yet.
            </Typography>
          )}
          <Stack spacing={2}>
            {history.map((h) => (
              <Box key={h.id} sx={{ borderLeft: 3, borderColor: "primary.main", pl: 1.75 }}>
                <Typography sx={{ fontWeight: 600 }}>{ACTION_LABELS[h.action] || h.action}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {h.changed_by || "unknown"} · {moment(h.changed_at).format("MMM D, YYYY h:mm A")}
                </Typography>
                {renderChanges(h.changes)}
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" variant="outlined" onClick={() => setHistoryFor(null)} sx={{ minHeight: 44, borderColor: "grey.400" }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate confirm */}
      <Dialog open={!!deactivateFor} onClose={dialogBusy ? undefined : () => setDeactivateFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Deactivate "{deactivateFor?.name}"?</DialogTitle>
        <DialogContent>
          <Typography>
            It will stop being offered{deactivateFor?.scope === "shared" ? " to every organization" : ""}. Organizations currently
            using it fall back to their state's active standard (or to "no verified standard" if the state has none).
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            It is kept for the history and can be reactivated.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setDeactivateFor(null)} disabled={dialogBusy} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={confirmDeactivate} disabled={dialogBusy} sx={{ minHeight: 44, px: 2.5 }}>
            {dialogBusy ? "Working..." : "Deactivate"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StaffingRulesTab;
