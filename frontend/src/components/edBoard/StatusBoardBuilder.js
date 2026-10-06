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
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "../patientHeader/headerApi";
import EDBoard from "./EDBoard";
import { ColorsTab, ColumnsTab, PatientsTab, SettingsTab } from "./BuilderTabs";

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

const configOf = (view) => ({ columns: view.columns, rules: view.rules, filter: view.filter, beds: view.beds || [] });

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
  const [creating, setCreating] = useState(null); // { name, from }
  const [deleting, setDeleting] = useState(false);

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
    const made = await run(async (headers) => (await api.post(apiEndpoints.statusViews, { name: creating.name, ...(creating.from ? { from_view: creating.from } : {}) }, { headers })).data, "View created");
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
  const previewData = useMemo(
    () => (settings && previewColumns ? sampleBoard(settings, previewColumns, data.people, data.departments) : null),
    [settings, previewColumns, data]
  );

  if (problem && !data) return <Alert severity="error">{problem}</Alert>;
  if (!data || !settings) return <CircularProgress aria-label="Loading" />;

  return (
    <Box>
      <Tabs value={main} onChange={(_e, v) => setMain(v)} sx={{ mb: 2 }}>
        <Tab label="Views" value={0} />
        <Tab label={`Shared settings${settingsDirty ? " *" : ""}`} value={1} />
      </Tabs>
      {problem && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {problem}
        </Alert>
      )}

      {main === 1 && (
        <Box>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <SettingsTab settings={settings} people={data.people} departments={data.departments} onChange={changeSettings} />
          </Paper>
          <Button variant="contained" onClick={saveSettings} disabled={busy || !settingsDirty}>
            Save shared settings
          </Button>
        </Box>
      )}

      {main === 0 && (
        <Box>
          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Paper variant="outlined" sx={{ width: 260, flexShrink: 0 }}>
              <List dense aria-label="Views" disablePadding>
                {views.length === 0 && (
                  <ListItemText sx={{ p: 2 }} primary="No saved views yet" secondary="The three built-in views are always available." />
                )}
                {views.map((v) => (
                  <ListItemButton key={v.id} selected={v.id === selectedId} onClick={() => choose(v)} data-testid={`view-item-${v.id}`}>
                    <ListItemText primary={v.name} />
                    {v.is_default && <Chip size="small" color="primary" label="Default" />}
                  </ListItemButton>
                ))}
              </List>
              <Box sx={{ p: 1 }}>
                <Button fullWidth variant="outlined" size="small" onClick={() => setCreating({ name: "", from: "" })} disabled={views.length >= 30}>
                  New view
                </Button>
              </Box>
            </Paper>

            <Box sx={{ flex: 1, minWidth: 320 }}>
              {!current && (
                <Alert severity="info">Create a view to choose the columns, colors and patients it shows. It will appear in the View list on the ED Board.</Alert>
              )}
              {current && config && (
                <>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mb: 2, rowGap: 1 }}>
                    <TextField label="View name" size="small" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} inputProps={{ maxLength: 60, "data-testid": "view-name" }} sx={{ minWidth: 240 }} />
                    <Button variant="contained" onClick={saveView} disabled={busy || !dirty || !name.trim()}>
                      Save view
                    </Button>
                    <Button onClick={undo} disabled={busy || dirty || !current.can_undo} color="inherit">
                      Undo last save
                    </Button>
                    {dirty && (
                      <Button onClick={() => open(current)} disabled={busy} color="inherit">
                        Discard changes
                      </Button>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    <Button size="small" onClick={() => setDefault(!current.is_default)} disabled={busy}>
                      {current.is_default ? "Remove as default" : "Make default"}
                    </Button>
                    <Button size="small" onClick={() => setCreating({ name: `${current.name} copy`, from: String(current.id) })} disabled={busy || views.length >= 30}>
                      Duplicate
                    </Button>
                    <Button size="small" color="error" onClick={() => setDeleting(true)} disabled={busy}>
                      Delete
                    </Button>
                  </Stack>

                  <Tabs value={sub} onChange={(_e, v) => setSub(v)} sx={{ mb: 2 }}>
                    <Tab label="Columns" value={0} />
                    <Tab label="Colors" value={1} />
                    <Tab label="Patients shown" value={2} />
                  </Tabs>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    {sub === 0 && <ColumnsTab config={config} onChange={change} />}
                    {sub === 1 && <ColorsTab config={config} settings={settings} onChange={change} />}
                    {sub === 2 && <PatientsTab config={config} locations={data.locations || []} onChange={change} />}
                  </Paper>
                </>
              )}
            </Box>
          </Box>

          {current && config && previewData && (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
                Preview
              </Typography>
              <Box sx={{ overflowX: "auto" }} data-testid="builder-preview">
                <EDBoard userRole="admin" previewData={previewData} previewView={{ label: name || "Preview", columns: config.columns, rules: config.rules, filter: "all" }} />
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
            <TextField select label="Start from" value={creating?.from || ""} onChange={(e) => setCreating((c) => ({ ...c, from: e.target.value }))} inputProps={{ "data-testid": "start-from" }}>
              <MenuItem value="">The standard layout</MenuItem>
              {views.map((v) => (
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
    </Box>
  );
}
