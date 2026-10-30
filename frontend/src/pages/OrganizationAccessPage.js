import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, Grid, InputLabel, LinearProgress, MenuItem, Paper,
  Select, Switch, TextField, Typography,
} from "@mui/material";
import { BuilderShell, BuilderToolbar } from "../components/builders/BuilderShell";
import OrganizationManagement from "../components/OrganizationManagement";
import { API_BASE_URL } from "../config/api";
import { EXTRA_MODULE_PRICE, GROUP_ORDER, formatMoney, monthlyTotal, planTerms, userLimitLabel } from "../utils/modulePricing";

const URL = `${API_BASE_URL}/api/users/organization-access/`;

const Card = ({ title, hint, children }) => (
  <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
    <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
    {hint && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>{hint}</Typography>}
    {children}
  </Paper>
);

const Meter = ({ label, value, max }) => (
  <Box sx={{ mb: 1.5 }}>
    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
      <Typography variant="body2">{label}</Typography>
      <Typography variant="body2" color="text.secondary">{value}{max ? ` of ${max >= 999999 ? "unlimited" : max}` : ""}</Typography>
    </Box>
    {max && max < 999999 && (
      <LinearProgress variant="determinate" value={Math.min(100, (value / max) * 100)} color={value >= max ? "warning" : "primary"} />
    )}
  </Box>
);

// Plan (user limit), status and services of an organization. System administrators change them;
// organization administrators see the same page read-only.
export default function OrganizationAccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") === "management" ? "management" : "access");
  const [role, setRole] = useState("");
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgId] = useState("");
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null); // {plan, status, user_limit, modules[]}
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async (id) => {
    setLoading(true);
    try {
      const res = await axios.get(URL, { params: id ? { organization: id } : {} });
      setData(res.data);
      setDraft({ plan: res.data.plan.key, status: res.data.status, user_limit: res.data.user_limit, modules: res.data.enabled_order });
      setOrgId(String(res.data.organization.id));
    } catch (err) {
      setMessage({ severity: "error", text: err.response?.data?.detail || "Could not load Organization access." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { navigate("/login"); return; }
    let r = "";
    try { r = jwtDecode(token).role || ""; } catch (e) { navigate("/login"); return; }
    if (r !== "admin" && r !== "system_admin") { navigate("/"); return; }
    setRole(r);
    if (r === "system_admin") {
      axios.get(`${API_BASE_URL}/api/users/organizations/`).then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setOrgs(list.map((o) => ({ id: o.id, name: o.name })).sort((a, b) => a.name.localeCompare(b.name)));
      }).catch(() => {});
    }
    load();
  }, [navigate, load]);

  const canEdit = !!data?.can_edit;
  const modules = data?.modules || [];
  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return draft.plan !== data.plan.key || draft.status !== data.status || Number(draft.user_limit) !== data.user_limit
      || JSON.stringify(draft.modules) !== JSON.stringify(data.enabled_order) || !data.configured;
  }, [data, draft]);

  const toggle = (code) => setDraft((d) => ({
    ...d, modules: d.modules.includes(code) ? d.modules.filter((c) => c !== code) : [...d.modules, code],
  }));

  const changePlan = (key) => {
    const p = data.plans.find((x) => x.key === key);
    setDraft((d) => ({ ...d, plan: key, user_limit: p ? p.user_limit : d.user_limit }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const body = { plan: draft.plan, status: draft.status, user_limit: Number(draft.user_limit), modules: draft.modules };
      const res = await axios.patch(URL, body, { params: { organization: orgId } });
      setData(res.data);
      setDraft({ plan: res.data.plan.key, status: res.data.status, user_limit: res.data.user_limit, modules: res.data.enabled_order });
      setMessage({ severity: "success", text: res.data.billing_note ? `Saved. ${res.data.billing_note}` : "Saved." });
    } catch (err) {
      const d = err.response?.data;
      const text = d?.detail || (d && Object.values(d).flat().join(" ")) || "Could not save.";
      setMessage({ severity: "error", text });
    } finally {
      setSaving(false);
    }
  };

  const terms = planTerms(data?.pricing?.plans, draft?.plan || data?.plan?.key);
  const total = draft && data ? monthlyTotal(draft.modules, modules, terms.base, EXTRA_MODULE_PRICE, terms.included) : 0;
  const includedCodes = (draft?.modules || []).filter((c) => !modules.find((m) => m.code === c)?.quoted).slice(0, terms.included);

  return (
    <BuilderShell
      title="Organization Management"
      subtitle={tab === "management"
        ? "Organization details and logo."
        : data ? `${data.organization.name}. ${canEdit ? "Plan, users and services." : "Read-only. A system administrator makes changes."}` : "Plan, users and services."}
      tabs={[{ key: "access", label: "Access" }, { key: "management", label: "Management" }]}
      tab={tab}
      onTab={setTab}
      maxWidth={1100}
    >
      {tab === "management" && <OrganizationManagement />}
      {tab === "access" && (<>
      <BuilderToolbar>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1, flexWrap: "wrap" }}>
          {role === "system_admin" && (
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="org-pick">Organization</InputLabel>
              <Select labelId="org-pick" label="Organization" value={orgId} onChange={(e) => load(e.target.value)}>
                {orgs.map((o) => <MenuItem key={o.id} value={String(o.id)}>{o.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          <Box sx={{ flex: 1 }} />
          {canEdit && (
            <>
              <Button size="small" disabled={!dirty || saving} onClick={() => load(orgId)}>Discard</Button>
              <Button size="small" variant="contained" disabled={!dirty || saving} onClick={save}>{saving ? "Saving..." : "Save"}</Button>
            </>
          )}
        </Box>
      </BuilderToolbar>

      {message && <Alert severity={message.severity} sx={{ mt: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}
      {loading && <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>}

      {!loading && data && draft && (
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card title="Usage">
              <Meter label="Users" value={data.user_count} max={draft.user_limit} />
              <Meter label="Appointments this month" value={data.usage?.appointments_this_month ?? 0} />
              {data.usage?.assistant && (
                <>
                  <Meter
                    label="AI assistant questions this month"
                    value={data.usage.assistant.questions}
                    max={data.usage.assistant.included}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {data.usage.assistant.billable > 0
                      ? `Billable so far: ${data.usage.assistant.billable} question${data.usage.assistant.billable === 1 ? "" : "s"}, $${data.usage.assistant.cost.toFixed(2)}. Billed on your next invoice.`
                      : "Nothing billable so far. Questions over the free amount are billed on your next invoice."}
                  </Typography>
                </>
              )}
              <Typography variant="caption" color="text.secondary">Patients do not count toward the user limit.</Typography>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card title="Plan">
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, mt: 1 }}>
                <FormControl size="small" disabled={!canEdit}>
                  <InputLabel id="plan">Plan</InputLabel>
                  <Select labelId="plan" label="Plan" value={draft.plan} onChange={(e) => changePlan(e.target.value)}>
                    {data.plans.map((p) => <MenuItem key={p.key} value={p.key}>{p.label} ({userLimitLabel(p.user_limit)})</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" disabled={!canEdit}>
                  <InputLabel id="status">Status</InputLabel>
                  <Select labelId="status" label="Status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                    {data.statuses.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField size="small" type="number" label="User limit" value={draft.user_limit} disabled={!canEdit}
                  onChange={(e) => setDraft({ ...draft, user_limit: e.target.value })} inputProps={{ min: 1 }} />
                <TextField size="small" label="Free trial ends" value={data.trial_end_date ? new Date(data.trial_end_date).toLocaleDateString() : "Not on a trial"} disabled />
              </Box>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 8 }}>
            <Card title="Services" hint={canEdit
              ? "Turning a service off hides and blocks it; nothing is deleted. Turning one on adds it from the next bill."
              : "Services your organization can use."}>
              {GROUP_ORDER.map((group) => {
                const items = modules.filter((m) => m.group === group);
                if (!items.length) return null;
                return (
                  <Box key={group} sx={{ mb: 1 }}>
                    <Typography variant="overline" color="text.secondary">{group}</Typography>
                    {items.map((m) => {
                      const on = draft.modules.includes(m.code);
                      return (
                        <Box key={m.code} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 0.25 }}>
                          <Box>
                            <Typography variant="body2">{m.label}</Typography>
                            <Typography variant="caption" color="text.secondary">{m.description}</Typography>
                          </Box>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            {on && m.quoted && <Chip size="small" label="Quoted separately" />}
                            {on && !m.quoted && includedCodes.includes(m.code) && <Chip size="small" label="Included" />}
                            {on && !m.quoted && !includedCodes.includes(m.code) && <Chip size="small" variant="outlined" label={`+${formatMoney(EXTRA_MODULE_PRICE)}`} />}
                            <Switch size="small" checked={on} disabled={!canEdit} onChange={() => toggle(m.code)} inputProps={{ "aria-label": m.label }} />
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                );
              })}
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card title="Monthly price">
              <Typography variant="h5" sx={{ mt: 1 }}>{terms.quoted ? "By quote" : formatMoney(total)}{!terms.quoted && <Typography component="span" variant="body2" color="text.secondary"> /month</Typography>}</Typography>
              <Typography variant="caption" color="text.secondary">
                {terms.quoted ? "Group is priced by a quote." : `${formatMoney(terms.base)} base, ${terms.included} service${terms.included === 1 ? "" : "s"} included, ${formatMoney(EXTRA_MODULE_PRICE)} for each additional one.`} Electronic lab interface is quoted separately. Texts, emails and AI assistant questions over the free amount are billed separately by volume.
              </Typography>
            </Card>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Card title="Change history">
              {data.history.length === 0 && <Typography variant="body2" color="text.secondary">No changes yet.</Typography>}
              {data.history.map((h, i) => (
                <Box key={i} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.5, borderTop: i ? "1px solid" : 0, borderColor: "divider" }}>
                  <Typography variant="body2">{h.summary}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                    {h.by ? `${h.by}, ` : ""}{new Date(h.at).toLocaleString()}
                  </Typography>
                </Box>
              ))}
            </Card>
          </Grid>
        </Grid>
      )}
      </>)}
    </BuilderShell>
  );
}
