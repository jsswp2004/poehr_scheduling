import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import axios from "axios";
import moment from "moment";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

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
const intOrDash = (v) => (v === null || v === undefined || v === "" ? "-" : String(v));

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
  status: rule.status || "active",
  shared: rule.scope === "shared",
});

const errorText = (err, fallback) => err?.response?.data?.error || err?.response?.data?.detail || fallback;

function StaffingRulesTab({ isAdmin = false }) {
  const token = getAccessToken();
  const headers = getAuthHeaders(token);

  const [data, setData] = useState({ rules: [], selected_rule_id: null, effective_rule_id: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState(null); // null = closed
  const [editing, setEditing] = useState(null); // rule being edited, null = adding
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [deactivateFor, setDeactivateFor] = useState(null);

  const canEditShared = !!data.can_edit_shared;
  const canEditCustom = !!data.can_edit_custom;

  const load = useCallback(async () => {
    try {
      const res = await axios.get(apiEndpoints.staffingRules, { headers });
      setData(res.data);
      setError("");
    } catch (err) {
      setError(errorText(err, "Failed to load staffing rules."));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const rules = data.rules || [];
  const effective = rules.find((r) => r.id === data.effective_rule_id);
  const usingStateDefault = !data.selected_rule_id;

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 5000);
  };

  // ---- add / edit ----
  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, shared: false });
    setFormError("");
  };

  const openEdit = (rule) => {
    setEditing(rule);
    setForm(toForm(rule));
    setFormError("");
  };

  const setField = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const save = async () => {
    setSaving(true);
    setFormError("");
    const body = {
      name: form.name,
      state: form.shared || (editing && editing.scope === "shared") ? form.state : "",
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
      status: form.status,
    };
    try {
      if (editing) {
        await axios.patch(apiEndpoints.staffingRuleDetail(editing.id), body, { headers });
        flash(`Saved "${form.name}".`);
      } else {
        await axios.post(apiEndpoints.staffingRules, { ...body, shared: form.shared }, { headers });
        flash(`Added "${form.name}".`);
      }
      setForm(null);
      load();
    } catch (err) {
      setFormError(errorText(err, "Could not save the rule."));
    } finally {
      setSaving(false);
    }
  };

  // ---- row actions ----
  const useRule = async (ruleId) => {
    try {
      await axios.put(apiEndpoints.staffingRuleSelection, { rule_id: ruleId }, { headers });
      flash(ruleId ? "Your organization now uses this rule." : "Your organization is back on its state's standard rule.");
      load();
    } catch (err) {
      setError(errorText(err, "Could not change the rule."));
    }
  };

  const duplicate = async (rule) => {
    try {
      const res = await axios.post(apiEndpoints.staffingRuleDuplicate(rule.id), {}, { headers });
      flash(`Created a custom copy: "${res.data.name}". Edit it to set your own numbers.`);
      await load();
      openEdit(res.data);
    } catch (err) {
      setError(errorText(err, "Could not duplicate the rule."));
    }
  };

  const markVerified = async (rule) => {
    try {
      await axios.patch(apiEndpoints.staffingRuleDetail(rule.id), { needs_verification: false }, { headers });
      flash(`"${rule.name}" marked as verified.`);
      load();
    } catch (err) {
      setError(errorText(err, "Could not mark the rule verified."));
    }
  };

  const confirmDeactivate = async () => {
    const rule = deactivateFor;
    setDeactivateFor(null);
    try {
      await axios.delete(apiEndpoints.staffingRuleDetail(rule.id), { headers });
      flash(`"${rule.name}" deactivated.`);
      load();
    } catch (err) {
      setError(errorText(err, "Could not deactivate the rule."));
    }
  };

  const reactivate = async (rule) => {
    try {
      await axios.patch(apiEndpoints.staffingRuleDetail(rule.id), { status: "active" }, { headers });
      flash(`"${rule.name}" reactivated.`);
      load();
    } catch (err) {
      setError(errorText(err, "Could not reactivate the rule."));
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
          <Typography variant="body2" key={key}>
            {label}: {showValue(val[0])} → <strong>{showValue(val[1])}</strong>
          </Typography>
        );
      }
      return (
        <Typography variant="body2" key={key}>
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

  const editingShared = editing ? editing.scope === "shared" : form?.shared;

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 1 }} onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}

      <Alert severity={effective ? (effective.needs_verification && !effective.is_custom ? "warning" : "info") : "warning"} sx={{ mb: 1.5 }}>
        {effective ? (
          <>
            Coverage compliance is currently checked against <strong>{effective.name}</strong>
            {effective.is_custom ? " (your custom rule)" : usingStateDefault ? " (the standard for your location's state)" : " (chosen for your organization)"}
            : {num(effective.hppd_min)} total hours per resident per day
            {effective.min_licensed_hppd ? `, at least ${num(effective.min_licensed_hppd)} licensed` : ""}
            {effective.min_cna_hppd ? `, ${num(effective.min_cna_hppd)} CNA` : ""}
            {effective.max_residents_per_staff ? `, 1 staff per ${effective.max_residents_per_staff} residents` : ""}
            {effective.min_rn_per_shift ? `, ${effective.min_rn_per_shift} RN per shift` : ""}.
            {effective.needs_verification && !effective.is_custom
              ? " This standard is awaiting verification against the official regulation text."
              : ""}
          </>
        ) : (
          <>
            No verified staffing rule applies to your organization's state yet. Pick a rule below or add a custom
            one to enforce your own requirements.
          </>
        )}
      </Alert>

      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }} alignItems="center">
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 260 }}>
          State standards are managed centrally. {canEditCustom ? "You can copy any rule as your own custom rule, then choose which rule your organization uses." : "Only administrators can change which rule applies."}
        </Typography>
        {isAdmin && !usingStateDefault && (
          <Button variant="outlined" onClick={() => useRule(null)}>
            Use my state's standard
          </Button>
        )}
        {isAdmin && (
          <Button variant="contained" onClick={openAdd}>
            Add rule
          </Button>
        )}
      </Stack>

      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Rule</TableCell>
              <TableCell>Applies to</TableCell>
              <TableCell align="right">Total HPPD</TableCell>
              <TableCell align="right">Licensed</TableCell>
              <TableCell align="right">CNA</TableCell>
              <TableCell align="right">Residents / staff</TableCell>
              <TableCell align="right">RN / shift</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>
                  <Typography variant="body2" color="text.secondary">
                    No rules available.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {rules.map((r) => {
              const inUse = r.id === data.effective_rule_id;
              return (
                <TableRow key={r.id} hover selected={inUse} sx={r.status === "inactive" ? { opacity: 0.6 } : undefined}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {r.name}
                    </Typography>
                    {r.source && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", maxWidth: 360 }}>
                        {r.source}
                      </Typography>
                    )}
                    {r.notes && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", maxWidth: 360 }}>
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
                  <TableCell align="right">{num(r.hppd_min)}</TableCell>
                  <TableCell align="right">{num(r.min_licensed_hppd)}</TableCell>
                  <TableCell align="right">{num(r.min_cna_hppd)}</TableCell>
                  <TableCell align="right">{r.max_residents_per_staff ? `1:${r.max_residents_per_staff}` : "-"}</TableCell>
                  <TableCell align="right">{intOrDash(r.min_rn_per_shift || null)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                      {inUse && <Chip size="small" color="primary" label="In use" />}
                      {r.needs_verification && (
                        <Tooltip title="Numbers not yet confirmed against the official regulation text">
                          <Chip size="small" color="warning" label="Needs verification" />
                        </Tooltip>
                      )}
                      {r.status !== "active" && <Chip size="small" label={r.status === "draft" ? "Draft" : "Inactive"} />}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {isAdmin && r.status === "active" && !inUse && (
                      <Button size="small" onClick={() => useRule(r.id)}>
                        Use
                      </Button>
                    )}
                    {r.editable && (
                      <Button size="small" onClick={() => openEdit(r)}>
                        Edit
                      </Button>
                    )}
                    {r.editable && r.needs_verification && (
                      <Button size="small" onClick={() => markVerified(r)}>
                        Mark verified
                      </Button>
                    )}
                    {isAdmin && (
                      <Button size="small" onClick={() => duplicate(r)}>
                        Duplicate as custom
                      </Button>
                    )}
                    {isAdmin && (
                      <Button size="small" onClick={() => openHistory(r)}>
                        History
                      </Button>
                    )}
                    {r.editable && r.status !== "inactive" && (
                      <Button size="small" color="error" onClick={() => setDeactivateFor(r)}>
                        Deactivate
                      </Button>
                    )}
                    {r.editable && r.status === "inactive" && (
                      <Button size="small" onClick={() => reactivate(r)}>
                        Reactivate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>

      {/* Add / edit */}
      <Dialog open={!!form} onClose={() => !saving && setForm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editing ? `Edit ${editing.name}` : "Add staffing rule"}
        </DialogTitle>
        <DialogContent dividers>
          {form && (
            <Grid container spacing={2} sx={{ mt: 0 }}>
              {formError && (
                <Grid size={{ xs: 12 }}>
                  <Alert severity="error">{formError}</Alert>
                </Grid>
              )}
              {editing && editing.scope === "shared" && (
                <Grid size={{ xs: 12 }}>
                  <Alert severity="info">
                    This is a shared state standard. Changes apply to every organization in {editing.state || "this state"} that
                    uses it, and are recorded in the history.
                  </Alert>
                </Grid>
              )}
              {!editing && canEditShared && (
                <Grid size={{ xs: 12 }}>
                  <FormControlLabel
                    control={<Checkbox checked={!!form.shared} onChange={setField("shared")} />}
                    label="Shared state standard (visible to all organizations)"
                  />
                </Grid>
              )}
              <Grid size={{ xs: 12, sm: editingShared ? 8 : 12 }}>
                <TextField label="Name" fullWidth required value={form.name} onChange={setField("name")} />
              </Grid>
              {editingShared && (
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label="State (2-letter)"
                    fullWidth
                    required
                    value={form.state}
                    onChange={setField("state")}
                    inputProps={{ maxLength: 20 }}
                  />
                </Grid>
              )}
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Total HPPD"
                  helperText="Hours per resident per day"
                  type="number"
                  fullWidth
                  required
                  value={form.hppd_min}
                  onChange={setField("hppd_min")}
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Licensed HPPD"
                  helperText="RN + LPN, optional"
                  type="number"
                  fullWidth
                  value={form.min_licensed_hppd}
                  onChange={setField("min_licensed_hppd")}
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="CNA HPPD"
                  helperText="Optional"
                  type="number"
                  fullWidth
                  value={form.min_cna_hppd}
                  onChange={setField("min_cna_hppd")}
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Max residents per staff"
                  helperText="Leave blank for no ratio rule"
                  type="number"
                  fullWidth
                  value={form.max_residents_per_staff}
                  onChange={setField("max_residents_per_staff")}
                  inputProps={{ min: 0, step: 1 }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Minimum RNs per shift"
                  helperText="0 = no per-shift RN rule"
                  type="number"
                  fullWidth
                  value={form.min_rn_per_shift}
                  onChange={setField("min_rn_per_shift")}
                  inputProps={{ min: 0, step: 1 }}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Source"
                  helperText="Regulation or policy this comes from"
                  fullWidth
                  value={form.source}
                  onChange={setField("source")}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField label="Notes" fullWidth multiline minRows={2} value={form.notes} onChange={setField("notes")} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Effective date"
                  type="date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.effective_date}
                  onChange={setField("effective_date")}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Last verified"
                  type="date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.last_verified_date}
                  onChange={setField("last_verified_date")}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField select label="Status" fullWidth value={form.status} onChange={setField("status")}>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </TextField>
              </Grid>
              {editingShared && (
                <Grid size={{ xs: 12 }}>
                  <FormControlLabel
                    control={<Checkbox checked={!!form.needs_verification} onChange={setField("needs_verification")} />}
                    label="Still needs verification against the official text (shows a warning to everyone using this rule)"
                  />
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForm(null)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={save} disabled={saving || !form?.name || !form?.hppd_min}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* History */}
      <Dialog open={!!historyFor} onClose={() => setHistoryFor(null)} maxWidth="sm" fullWidth>
        <DialogTitle>History: {historyFor?.name}</DialogTitle>
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
          <Stack spacing={1.5}>
            {history.map((h) => (
              <Box key={h.id} sx={{ borderLeft: 3, borderColor: "divider", pl: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {ACTION_LABELS[h.action] || h.action}
                  <Typography component="span" variant="caption" color="text.secondary">
                    {" "}
                    by {h.changed_by || "unknown"} · {moment(h.changed_at).format("MMM D, YYYY h:mm A")}
                  </Typography>
                </Typography>
                {renderChanges(h.changes)}
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryFor(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate confirm */}
      <Dialog open={!!deactivateFor} onClose={() => setDeactivateFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Deactivate rule?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            "{deactivateFor?.name}" will stop being offered
            {deactivateFor?.scope === "shared" ? " to every organization" : ""}. Organizations currently using it fall back
            to their state's active standard (or to "no verified rule" if the state has none). It is kept for the
            history and can be reactivated.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivateFor(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDeactivate}>
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StaffingRulesTab;
