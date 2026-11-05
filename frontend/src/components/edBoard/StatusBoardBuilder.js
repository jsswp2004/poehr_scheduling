import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import MoreVert from "@mui/icons-material/MoreVert";
import { api } from "../../api/client";
import { BuilderListHeader, BuilderShell, BuilderSplit, BuilderToolbar } from "../builders/BuilderShell";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "../patientHeader/headerApi";
import EDBoard from "./EDBoard";
import EDFollowUpBoard from "./EDFollowUpBoard";
import { ColorsTab, ColumnsTab, FollowUpTab, PatientsTab, SettingsTab, criteriaComplete } from "./BuilderTabs";

/** Sample patients so the preview shows what the view will look like. */
export function sampleBoard(settings, columns, people, departments) {
  const now = Date.now();
  const ago = (minutes) => new Date(now - minutes * 60000).toISOString();
  const statuses = settings.statuses || [];
  const nurse = people.nurses?.[0] || { id: 1, name: "Nurse, Sample" };
  const doctor = people.doctors?.[0] || { id: 2, name: "Doctor, Sample" };
  const custom = {};
  for (const c of columns) {
    if (c.type !== "custom") continue;
    custom[c.key] = c.kind === "dropdown" ? (c.options || [])[0] || "" : c.kind === "checkbox" ? true : "Sample";
  }
  const visit = (over) => ({
    registration: 1, visit_number: "VN-000001", patient: 1, user_id: 1, name: "SAMPLE, Jane", age: 34, sex: "F", arrival_time: ago(130),
    reason: "Chest pain", complaint: "Chest pain", esi: 2, ed_status: statuses[1]?.value || statuses[0]?.value || "", md: doctor, rn: nurse,
    resident: "", comments: "Awaiting labs", registration_complete: false, custom, location: "", vitals_last_at: ago(25),
    orders: { lab: "pending", rad: "done", meds: "pending" }, ...over,
  });
  const dept = departments[0];
  return {
    departments: dept ? [{ id: dept.id, name: dept.name, facility_name: dept.facility_name }] : [{ id: 0, name: "Sample ED", facility_name: "Preview" }],
    unit: dept ? dept.id : 0,
    statuses,
    staff: { nurses: [], doctors: [] },
    config: { vitals_overdue_minutes: settings.vitals_overdue_minutes },
    rows: [
      { type: "bed", bed: 1, loc: "ED1A", bed_status: "occupied", hold_reason: "", visit: visit({}) },
      { type: "bed", bed: 2, loc: "ED1B", bed_status: "occupied", hold_reason: "", visit: visit({ registration: 2, name: "SAMPLE, Bob", sex: "M", age: 61, esi: 4, ed_status: statuses[0]?.value || "", registration_complete: true, vitals_last_at: null, arrival_time: ago(95), orders: {} }) },
      { type: "bed", bed: 3, loc: "ED1C", bed_status: "available", hold_reason: "", visit: null },
      { type: "waiting", bed: null, loc: "", bed_status: "", hold_reason: "", visit: visit({ registration: 3, name: "SAMPLE, Alex", sex: "X", age: 8, esi: 3, ed_status: statuses[0]?.value || "", md: null, rn: null, arrival_time: ago(20), vitals_last_at: ago(15), orders: {} }) },
    ],
  };
}

/** Sample discharged patients so a follow-up view's preview shows the Discharged and New results columns. */
export function sampleFollowUpBoard(settings, columns, people, departments) {
  const base = sampleBoard(settings, columns, people, departments);
  const now = Date.now();
  const ago = (hours) => new Date(now - hours * 3600000).toISOString();
  const template = base.rows[0].visit;
  const make = (n, over) => ({
    type: "followup", bed: null, loc: "", bed_status: "", hold_reason: "",
    visit: { ...template, registration: 100 + n, patient: 100 + n, user_id: 100 + n, orders: {}, vitals_last_at: null, discharged_at: ago(5), new_results: { state: "none", count: 0, tests: [] }, ...over },
  });
  return {
    ...base,
    rows: [
      make(1, { name: "SAMPLE, Jane", discharged_at: ago(21), arrival_time: ago(26), new_results: { state: "new", count: 2, tests: ["CBC", "Troponin"] } }),
      make(2, { name: "SAMPLE, Alex", sex: "X", age: 8, age_days: 2900, age_months: 96, esi: 3, discharged_at: ago(30), arrival_time: ago(34), new_results: { state: "reviewed", count: 0, tests: [] } }),
      make(3, { name: "SAMPLE, Bob", sex: "M", age: 61, esi: 4, discharged_at: ago(52), arrival_time: ago(55) }),
    ],
    needs_review: 1,
    total: 3,
  };
}

const configOf = (view) => ({
  kind: view.kind || "live",
  columns: view.columns,
  rules: view.rules,
  filter: view.filter,
  beds: view.beds || [],
  criteria: view.criteria || { match: "all", conditions: [] },
  show_empty_beds: view.show_empty_beds !== false,
  follow_up: view.follow_up || { days: 7 },
});

export default function StatusBoardBuilder() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState("");
  const [config, setConfig] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [main, setMain] = useState(0);
  const [sub, setSub] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [creating, setCreating] = useState(null); // { name, from, kind }
  const [deleting, setDeleting] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState(null);

  const open = useCallback((view) => {
    setSelectedId(view ? view.id : null);
    setName(view ? view.name : "");
    setConfig(view ? configOf(view) : null);
    setDirty(false);
  }, []);

  const load = useCallback(
    async (keepId) => {
      try {
        const headers = await authHeader();
        const res = await api.get(apiEndpoints.statusViews, { headers });
        setData(res.data);
        setSettings(res.data.settings);
        setSettingsDirty(false);
        const views = res.data.views;
        open(views.find((v) => v.id === keepId) || views[0] || null);
        setProblem("");
      } catch (err) {
        setProblem(errorText(err, "Could not load the status board builder."));
      }
    },
    [open]
  );

  useEffect(() => {
    load(null);
  }, [load]);

  const views = data?.views || [];
  const current = views.find((v) => v.id === selectedId) || null;

  const run = async (work, success) => {
    setBusy(true);
    try {
      const headers = await authHeader();
      const result = await work(headers);
      if (success) toast.success(success);
      return result === undefined ? true : result;
    } catch (err) {
      toast.error(errorText(err, "That did not work."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const replaceView = (view) => setData((d) => ({ ...d, views: d.views.map((v) => (v.id === view.id ? view : v)) }));

  const choose = (view) => {
    if (dirty && view.id !== selectedId) {
      toast.error("Save or discard your changes to this view first.");
      return;
    }
    open(view);
  };

  const change = (next) => {
    setConfig(next);
    setDirty(true);
  };

  const saveView = async () => {
    const saved = await run(async (headers) => (await api.patch(apiEndpoints.statusView(current.id), { name, config }, { headers })).data, "View saved");
    if (saved && saved.id) {
      replaceView(saved);
      open(saved);
    }
  };

  const undo = async () => {
    const saved = await run(async (headers) => (await api.post(apiEndpoints.statusViewUndo(current.id), {}, { headers })).data, "Went back to the layout before your last save");
    if (saved && saved.id) {
      replaceView(saved);
      open(saved);
    }
  };

  const setDefault = async (value) => {
    const ok = await run((headers) => api.patch(apiEndpoints.statusView(current.id), { is_default: value }, { headers }), value ? `"${current.name}" is now the view everyone starts on` : "No default view");
    if (ok) {
      const keep = current.id;
      const nextDefault = (v) => ({ ...v, is_default: value ? v.id === keep : false });
      setData((d) => ({ ...d, views: d.views.map(nextDefault) }));
    }
  };

  const createView = async () => {
    const made = await run(async (headers) => (await api.post(apiEndpoints.statusViews, { name: creating.name, ...(creating.from ? { from_view: creating.from } : creating.kind === "follow_up" ? { kind: "follow_up" } : {}) }, { headers })).data, "View created");
    if (made && made.id) {
      setCreating(null);
      setData((d) => ({ ...d, views: [...d.views, made] }));
      setMain(0);
      open(made);
    }
  };

  const deleteView = async () => {
    const ok = await run((headers) => api.delete(apiEndpoints.statusView(current.id), { headers }), "View deleted");
    if (ok) {
      setDeleting(false);
      load(null);
    }
  };

  const saveSettings = async () => {
    if (dirty) {
      toast.error("Save or discard your changes to the view first.");
      return;
    }
    const saved = await run(async (headers) => (await api.patch(apiEndpoints.statusViewSettings, settings, { headers })).data, "Shared settings saved");
    if (saved && saved.statuses) await load(selectedId);
  };

  const changeSettings = (next) => {
    setSettings(next);
    setSettingsDirty(true);
  };

  const previewColumns = config?.columns;
  const followUp = config?.kind === "follow_up";
  const previewData = useMemo(
    () => (settings && previewColumns ? (followUp ? sampleFollowUpBoard : sampleBoard)(settings, previewColumns, data.people, data.departments) : null),
    [settings, previewColumns, data, followUp]
  );
  const subTab = sub === 3 && !followUp ? 0 : sub;
  const incomplete = !!config && !criteriaComplete(config.criteria);

  if (problem && !data) return <Alert severity="error">{problem}</Alert>;
  if (!data || !settings) return <CircularProgress aria-label="Loading" />;

  const mainTabs = [
    { key: 0, label: "Views", count: views.length },
    { key: 1, label: settingsDirty ? "Shared settings *" : "Shared settings" },
  ];

  return (
    <BuilderShell
      title="Status Board Builder"
      subtitle="Build named ED board views (columns, colors, patients shown) and manage the settings every view shares"
      tabs={mainTabs}
      tab={main}
      onTab={setMain}
      maxWidth={1600}
    >
      {problem && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {problem}
        </Alert>
      )}

      {main === 1 && (
        <Box>
          <BuilderToolbar>
            {settingsDirty && <Chip size="small" color="warning" label="Unsaved changes" />}
            <Box sx={{ flex: 1 }} />
            <Button size="small" variant="contained" onClick={saveSettings} disabled={busy || !settingsDirty}>
              Save shared settings
            </Button>
          </BuilderToolbar>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <SettingsTab settings={settings} people={data.people} departments={data.departments} onChange={changeSettings} />
          </Paper>
        </Box>
      )}

      {main === 0 && (
        <Box>
          {current && config && (
            <BuilderToolbar>
              {dirty && <Chip size="small" color="warning" label="Unsaved changes" />}
              {current.is_default && <Chip size="small" color="primary" variant="outlined" label="Default view" />}
              <Box sx={{ flex: 1 }} />
              <Button size="small" onClick={undo} disabled={busy || dirty || !current.can_undo} color="inherit">
                Undo last save
              </Button>
              {dirty && (
                <Button size="small" onClick={() => open(current)} disabled={busy} color="inherit">
                  Discard changes
                </Button>
              )}
              <Button size="small" variant="contained" onClick={saveView} disabled={busy || !dirty || !name.trim() || incomplete}>
                Save view
              </Button>
              <IconButton size="small" aria-label="More actions" onClick={(e) => setMoreAnchor(e.currentTarget)}>
                <MoreVert fontSize="small" />
              </IconButton>
              <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
                <MenuItem disabled={busy} onClick={() => { setMoreAnchor(null); setDefault(!current.is_default); }}>
                  {current.is_default ? "Remove as default" : "Make default"}
                </MenuItem>
                <MenuItem disabled={busy || views.length >= 30} onClick={() => { setMoreAnchor(null); setCreating({ name: `${current.name} copy`, from: String(current.id), kind: current.kind || "live" }); }}>
                  Duplicate
                </MenuItem>
                <MenuItem disabled={busy} sx={{ color: "error.main" }} onClick={() => { setMoreAnchor(null); setDeleting(true); }}>
                  Delete
                </MenuItem>
              </Menu>
            </BuilderToolbar>
          )}

          <BuilderSplit
            list={
              <>
                <BuilderListHeader>
                  <Button fullWidth variant="contained" size="small" onClick={() => setCreating({ name: "", from: "", kind: "live" })} disabled={views.length >= 30}>
                    New view
                  </Button>
                </BuilderListHeader>
                <List dense aria-label="Views" disablePadding>
                  {views.length === 0 && (
                    <ListItemText sx={{ p: 2 }} primary="No saved views yet" secondary="The built-in views are always available." />
                  )}
                  {views.map((v) => (
                    <ListItemButton key={v.id} selected={v.id === selectedId} onClick={() => choose(v)} data-testid={`view-item-${v.id}`}>
                      <ListItemText primary={v.name} />
                      {v.kind === "follow_up" && <Chip size="small" variant="outlined" color="secondary" label="Follow-up" sx={{ mr: 0.5 }} data-testid={`follow-up-chip-${v.id}`} />}
                      {v.is_default && <Chip size="small" color="primary" label="Default" />}
                    </ListItemButton>
                  ))}
                </List>
                <Box sx={{ px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider" }} data-testid="builtin-views">
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Built in (always on the ED Board, cannot be edited)
                  </Typography>
                  <Typography variant="body2">ED All View</Typography>
                  <Typography variant="body2">Waiting Area</Typography>
                  <Typography variant="body2">ED Follow-up (on the ED Follow-up tab)</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    To change columns or colors for everyone in the department, make a view starting from the standard layout.
                  </Typography>
                </Box>
              </>
            }
          >
            {!current && (
              <Alert severity="info">Create a view to choose the columns, colors and patients it shows. It will appear in the View list on the ED Board.</Alert>
            )}
            {current && config && (
              <>
                <TextField label="View name" size="small" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} inputProps={{ maxLength: 60, "data-testid": "view-name" }} sx={{ minWidth: 240, mb: 2 }} />

                <Tabs value={subTab} onChange={(_e, v) => setSub(v)} sx={{ mb: 2 }}>
                  <Tab label="Columns" value={0} />
                  <Tab label="Colors" value={1} />
                  <Tab label="Patients shown" value={2} />
                  {followUp && <Tab label="Follow-up" value={3} />}
                </Tabs>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  {subTab === 0 && <ColumnsTab config={config} onChange={change} />}
                  {subTab === 1 && <ColorsTab config={config} settings={settings} onChange={change} />}
                  {subTab === 2 && <PatientsTab config={config} locations={data.locations || []} settings={settings} people={data.people} onChange={change} />}
                  {subTab === 3 && followUp && <FollowUpTab config={config} onChange={change} />}
                </Paper>
              </>
            )}
          </BuilderSplit>

          {current && config && previewData && (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
                Preview
              </Typography>
              <Box sx={{ overflowX: "auto" }} data-testid="builder-preview">
                {followUp ? (
                  <EDFollowUpBoard previewData={previewData} previewView={{ label: name || "Preview", columns: config.columns, rules: config.rules, criteria: config.criteria, follow_up: config.follow_up }} />
                ) : (
                  <EDBoard userRole="admin" previewData={previewData} previewView={{ label: name || "Preview", columns: config.columns, rules: config.rules, filter: "all", criteria: config.criteria, show_empty_beds: config.show_empty_beds }} />
                )}
              </Box>
            </>
          )}
        </Box>
      )}

      <Dialog open={!!creating} onClose={() => setCreating(null)} fullWidth maxWidth="xs">
        <DialogTitle>{creating?.from ? "Duplicate this view" : "New view"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name the view" autoFocus value={creating?.name || ""} onChange={(e) => setCreating((c) => ({ ...c, name: e.target.value }))} inputProps={{ maxLength: 60 }} />
            {!creating?.from || creating.from === "" ? (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  What kind of board
                </Typography>
                <RadioGroup value={creating?.kind || "live"} onChange={(e) => setCreating((c) => ({ ...c, kind: e.target.value, from: "" }))} aria-label="What kind of board">
                  <FormControlLabel value="live" control={<Radio size="small" />} label="Live ED board: patients who are in the ED now" />
                  <FormControlLabel value="follow_up" control={<Radio size="small" />} label="Follow-up board: patients discharged from the ED, with Discharged and New results columns" />
                </RadioGroup>
              </Box>
            ) : (
              <Typography variant="caption" color="text.secondary">
                A copy is the same kind of board as the view it copies.
              </Typography>
            )}
            <TextField select label="Start from" value={creating?.from || ""} onChange={(e) => setCreating((c) => ({ ...c, from: e.target.value, kind: views.find((v) => String(v.id) === e.target.value)?.kind || "live" }))} inputProps={{ "data-testid": "start-from" }}>
              <MenuItem value="">The standard layout</MenuItem>
              {views.filter((v) => (v.kind || "live") === (creating?.kind || "live")).map((v) => (
                <MenuItem key={v.id} value={String(v.id)}>
                  A copy of {v.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(null)}>Cancel</Button>
          <Button variant="contained" onClick={createView} disabled={busy || !(creating?.name || "").trim()}>
            Create view
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleting} onClose={() => setDeleting(false)} fullWidth maxWidth="xs">
        <DialogTitle>Delete this view?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">"{current?.name}" will disappear from the View list for everyone. People who had it selected go back to the default view.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={deleteView} disabled={busy}>
            Delete view
          </Button>
        </DialogActions>
      </Dialog>
    </BuilderShell>
  );
}
