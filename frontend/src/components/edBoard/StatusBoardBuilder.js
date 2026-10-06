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
import { ColumnsTab, StaffTab, StatusesTab, VersionsTab } from "./BuilderTabs";
import { diffConfigs } from "./statusBoardDiff";

/** Sample patients so the preview shows what the layout will look like. */
export function sampleBoard(config, people, departments, unit) {
  const now = Date.now();
  const ago = (minutes) => new Date(now - minutes * 60000).toISOString();
  const statuses = config.statuses || [];
  const nurse = people.nurses?.[0] || { id: 1, name: "Nurse, Sample" };
  const doctor = people.doctors?.[0] || { id: 2, name: "Doctor, Sample" };
  const custom = {};
  for (const c of config.columns) {
    if (c.type !== "custom") continue;
    custom[c.key] = c.kind === "dropdown" ? (c.options || [])[0] || "" : c.kind === "checkbox" ? true : "Sample";
  }
  const visit = (over) => ({
    registration: 1, visit_number: "VN-000001", patient: 1, user_id: 1, name: "SAMPLE, Jane", age: 34, sex: "F", arrival_time: ago(130),
    reason: "Chest pain", complaint: "Chest pain", esi: 2, ed_status: statuses[1]?.value || statuses[0]?.value || "", md: doctor, rn: nurse,
    resident: "", comments: "Awaiting labs", registration_complete: false, custom, location: "", vitals_last_at: ago(25),
    orders: { lab: "pending", rad: "done", meds: "pending" }, ...over,
  });
  const dept = departments.find((d) => d.id === unit);
  return {
    departments: dept ? [{ id: dept.id, name: dept.name, facility_name: dept.facility_name }] : [{ id: 0, name: "Sample ED", facility_name: "Preview" }],
    unit: dept ? dept.id : 0,
    statuses,
    staff: { nurses: [], doctors: [] },
    config: { version: null, columns: config.columns, rules: config.rules, vitals_overdue_minutes: config.vitals_overdue_minutes },
    rows: [
      { type: "bed", bed: 1, loc: "ED1A", bed_status: "occupied", hold_reason: "", visit: visit({}) },
      { type: "bed", bed: 2, loc: "ED1B", bed_status: "occupied", hold_reason: "", visit: visit({ registration: 2, name: "SAMPLE, Bob", sex: "M", age: 61, esi: 4, ed_status: statuses[0]?.value || "", registration_complete: true, vitals_last_at: null, arrival_time: ago(95), orders: {} }) },
      { type: "bed", bed: 3, loc: "ED1C", bed_status: "available", hold_reason: "", visit: null },
      { type: "waiting", bed: null, loc: "", bed_status: "", hold_reason: "", visit: visit({ registration: 3, name: "SAMPLE, Alex", sex: "X", age: 8, esi: 3, ed_status: statuses[0]?.value || "", md: null, rn: null, arrival_time: ago(20), vitals_last_at: ago(15), orders: {} }) },
    ],
  };
}

const TABS = ["Columns", "Statuses & colors", "Staff", "Versions"];

export default function StatusBoardBuilder() {
  const [unit, setUnit] = useState("");
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState([]);
  const [diff, setDiff] = useState(null);

  const load = useCallback(
    async (scope = unit) => {
      try {
        const headers = await authHeader();
        const res = await api.get(apiEndpoints.statusBoards, { headers, params: scope ? { unit: scope } : undefined });
        setData(res.data);
        setConfig(res.data.draft?.config || res.data.published?.config || res.data.default_config);
        setDirty(false);
        setProblem("");
      } catch (err) {
        setProblem(errorText(err, "Could not load the status board builder."));
      }
    },
    [unit]
  );

  useEffect(() => {
    load(unit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draft = data?.draft || null;
  const published = data?.published || null;
  const editable = !!draft;

  const run = async (work, success) => {
    setBusy(true);
    try {
      const headers = await authHeader();
      await work(headers);
      if (success) toast.success(success);
    } catch (err) {
      toast.error(errorText(err, "That did not work."));
      return false;
    } finally {
      setBusy(false);
    }
    return true;
  };

  const changeScope = (value) => {
    if (dirty) {
      toast.error("Save or discard your changes before switching boards.");
      return;
    }
    setUnit(value);
    setPicked([]);
    setDiff(null);
    load(value);
  };

  const startDraft = async () => {
    const ok = await run((headers) => api.post(apiEndpoints.statusBoards, { unit: unit || null }, { headers }), "Draft started");
    if (ok) load(unit);
  };

  const saveDraft = async () => {
    let saved = null;
    const ok = await run(async (headers) => {
      const res = await api.patch(apiEndpoints.statusBoard(draft.id), { config }, { headers });
      saved = res.data;
    }, "Draft saved");
    if (ok && saved) {
      setConfig(saved.config);
      setDirty(false);
    }
    return ok;
  };

  const discard = async () => {
    const ok = await run((headers) => api.delete(apiEndpoints.statusBoard(draft.id), { headers }), "Draft discarded");
    if (ok) load(unit);
  };

  const publish = async () => {
    const ok = await run(async (headers) => {
      if (dirty) await api.patch(apiEndpoints.statusBoard(draft.id), { config }, { headers });
      await api.post(apiEndpoints.statusBoardPublish(draft.id), { note }, { headers });
    }, "Published. The board now uses this layout.");
    if (ok) {
      setPublishing(false);
      setNote("");
      load(unit);
    }
  };

  const restore = async (version) => {
    const ok = await run((headers) => api.post(apiEndpoints.statusBoardRestore(version.id), {}, { headers }), `Version ${version.number} copied into a new draft`);
    if (ok) {
      setTab(0);
      load(unit);
    }
  };

  const compare = async () => {
    try {
      const headers = await authHeader();
      const [a, b] = await Promise.all(picked.map((id) => api.get(apiEndpoints.statusBoard(id), { headers })));
      const [older, newer] = a.data.number < b.data.number ? [a.data, b.data] : [b.data, a.data];
      setDiff({ title: `What changed from v${older.number} to v${newer.number}`, lines: diffConfigs(older.config, newer.config) });
    } catch (err) {
      toast.error(errorText(err, "Could not compare those versions."));
    }
  };

  const pick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));

  const change = (next) => {
    setConfig(next);
    setDirty(true);
  };

  const preview = useMemo(
    () => (config && data ? sampleBoard(config, data.people, data.departments, unit ? Number(unit) : null) : null),
    [config, data, unit]
  );

  if (problem && !data) return <Alert severity="error">{problem}</Alert>;
  if (!data || !config) return <CircularProgress aria-label="Loading" />;

  const scopeName = unit ? data.departments.find((d) => String(d.id) === String(unit))?.name : "Clinic default";

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap", mb: 2 }}>
        <TextField select size="small" label="Board" value={unit} onChange={(e) => changeScope(e.target.value)} sx={{ minWidth: 260 }} inputProps={{ "data-testid": "builder-scope" }}>
          <MenuItem value="">Clinic default (all departments)</MenuItem>
          {data.departments.map((d) => (
            <MenuItem key={d.id} value={String(d.id)}>
              {d.name} ({d.facility_name})
            </MenuItem>
          ))}
        </TextField>
        {published ? <Chip color="success" label={`Live: version ${published.number}`} /> : <Chip variant="outlined" label="Using the built-in layout" />}
        {draft && <Chip color="warning" label={`Draft: version ${draft.number}${dirty ? " (unsaved changes)" : ""}`} />}
        <Box sx={{ flexGrow: 1 }} />
        {!draft && (
          <Button variant="contained" onClick={startDraft} disabled={busy}>
            Start a draft to edit
          </Button>
        )}
        {draft && (
          <>
            <Button onClick={discard} disabled={busy} color="inherit">
              Discard draft
            </Button>
            <Button onClick={saveDraft} disabled={busy || !dirty} variant="outlined">
              Save draft
            </Button>
            <Button onClick={() => setPublishing(true)} disabled={busy} variant="contained">
              Publish
            </Button>
          </>
        )}
      </Stack>
      {problem && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {problem}
        </Alert>
      )}
      {!draft && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You are looking at the layout the {scopeName.toLowerCase() === "clinic default" ? "clinic default" : scopeName} board uses now. Start a draft to change it. Nothing changes on the live board until you publish.
        </Alert>
      )}

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
        {TABS.map((t, i) => (
          <Tab key={t} label={t} value={i} />
        ))}
      </Tabs>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        {tab === 0 && <ColumnsTab config={config} onChange={change} editable={editable} />}
        {tab === 1 && <StatusesTab config={config} onChange={change} editable={editable} />}
        {tab === 2 && <StaffTab config={config} people={data.people} onChange={change} editable={editable} />}
        {tab === 3 && (
          <VersionsTab
            versions={data.versions}
            picked={picked}
            onPick={pick}
            onRestore={restore}
            canRestore={!draft && !busy}
            diff={diff?.lines}
            diffTitle={diff?.title}
            onCompare={compare}
          />
        )}
      </Paper>

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        Preview
      </Typography>
      <Box sx={{ overflowX: "auto" }} data-testid="builder-preview">
        <EDBoard userRole="admin" previewData={preview} />
      </Box>

      <Dialog open={publishing} onClose={() => setPublishing(false)} fullWidth maxWidth="xs">
        <DialogTitle>Publish this layout?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            The {scopeName} board will switch to this layout right away. The version it replaces stays in the history.
          </Typography>
          <TextField label="What changed? (optional)" fullWidth multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ maxLength: 300 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPublishing(false)}>Cancel</Button>
          <Button variant="contained" onClick={publish} disabled={busy}>
            Publish
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
