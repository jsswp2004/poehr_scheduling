import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListSubheader,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { BuilderShell, BuilderToolbar, BUILDER_STICKY_TOP } from "../components/builders/BuilderShell";
import ReportResultTable from "../components/reports/ReportResultTable";
import { apiEndpoints } from "../config/api";
import {
  NUMBER_OPS,
  OP_LABELS,
  TEXT_OPS,
  errorText,
  formatCell,
  headers,
  presetRange,
  rangeText,
} from "../components/reports/reportUtils";

const SHARE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "registrar", label: "Registrar" },
];

const PREVIEW_RANGES = [
  { value: "week", label: "This week" },
  { value: "last-week", label: "Last week" },
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
];

const previewRange = (value) => {
  const now = new Date();
  if (value === "last-week") return presetRange("week", new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  if (value === "last-month") return presetRange("month", new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return presetRange(value, now);
};

const emptyConfig = (src) => ({
  group_by: src?.default_group || null,
  columns: src ? [...src.default_columns] : [],
  filters: [],
  highlight: null,
  tiles: [],
  sort: null,
  totals: true,
});

// Leave out half-typed filters and highlight rules so the preview does not complain while you type.
const apiConfig = (c) => {
  const filled = (v) => !(v === "" || v === null || v === undefined || (Array.isArray(v) && v.length === 0));
  return {
    ...c,
    filters: c.filters.filter((f) => filled(f.value)),
    highlight: c.highlight && filled(c.highlight.value) ? c.highlight : null,
  };
};

const opsFor = (field) => (field?.kind === "measure" ? NUMBER_OPS : [...TEXT_OPS, "any_of"]);

export default function ReportBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = !!id;

  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("data");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceKey, setSourceKey] = useState("");
  const [config, setConfig] = useState(emptyConfig(null));
  const [audience, setAudience] = useState("me");
  const [audienceRoles, setAudienceRoles] = useState([]);
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rangeKey, setRangeKey] = useState("week");
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [showNames, setShowNames] = useState(false);

  const source = useMemo(() => sources.find((s) => s.key === sourceKey) || null, [sources, sourceKey]);
  const fields = useMemo(() => source?.fields || [], [source]);
  const fieldByKey = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f])), [fields]);

  const snapshot = (n, d, s, c, a, r) => JSON.stringify([n, d, s, c, a, r]);
  const current = snapshot(name, description, sourceKey, config, audience, audienceRoles);
  const dirty = baseline !== "" && current !== baseline;

  // Sources, and the report being edited.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sres = await axios.get(apiEndpoints.staffingCustomReportSources, { headers: headers() });
        if (cancelled) return;
        setSources(sres.data);
        if (editing) {
          const rres = await axios.get(apiEndpoints.staffingCustomReport(id), { headers: headers() });
          if (cancelled) return;
          const r = rres.data;
          const cfg = { ...emptyConfig(null), ...r.config };
          setName(r.name);
          setDescription(r.description || "");
          setSourceKey(r.source);
          setConfig(cfg);
          setAudience(r.audience);
          setAudienceRoles(r.audience_roles || []);
          setBaseline(snapshot(r.name, r.description || "", r.source, cfg, r.audience, r.audience_roles || []));
        } else {
          const first = sres.data.find((s) => s.key === "hours_overtime") || sres.data[0];
          const cfg = emptyConfig(first);
          setSourceKey(first.key);
          setConfig(cfg);
          setBaseline(snapshot("", "", first.key, cfg, "me", []));
        }
      } catch (err) {
        if (!cancelled) setError(errorText(err, "Could not load the report builder."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, editing]);

  // Live preview, a moment after the last change.
  const previewSeq = useRef(0);
  useEffect(() => {
    if (!source) return undefined;
    const seq = ++previewSeq.current;
    const t = setTimeout(async () => {
      setPreviewing(true);
      setPreviewError("");
      try {
        const range = previewRange(rangeKey);
        const res = await axios.post(
          apiEndpoints.staffingCustomReportPreview,
          { source: sourceKey, config: apiConfig(config), start: range.start, end: range.end, reveal_patients: showNames },
          { headers: headers() }
        );
        if (seq === previewSeq.current) setPreview(res.data);
      } catch (err) {
        if (seq === previewSeq.current) {
          setPreview(null);
          setPreviewError(errorText(err, "Could not build the preview."));
        }
      } finally {
        if (seq === previewSeq.current) setPreviewing(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [source, sourceKey, config, rangeKey, showNames]);

  const patch = (changes) => setConfig((c) => ({ ...c, ...changes }));

  const changeSource = (key) => {
    const next = sources.find((s) => s.key === key);
    setSourceKey(key);
    setShowNames(false);
    setConfig(emptyConfig(next));
  };

  const changeGroup = (value) => {
    const group_by = value || null;
    setConfig((c) => {
      let columns = c.columns;
      if (group_by) {
        columns = columns.filter((k) => fieldByKey[k]?.kind === "measure");
        columns = [group_by, ...columns];
      }
      return { ...c, group_by, columns, sort: null, highlight: c.highlight && columns.includes(c.highlight.field) ? c.highlight : null };
    });
  };

  const toggleColumn = (key) =>
    setConfig((c) => {
      const columns = c.columns.includes(key) ? c.columns.filter((k) => k !== key) : [...c.columns, key];
      const sort = c.sort && columns.includes(c.sort.field) ? c.sort : null;
      const highlight = c.highlight && columns.includes(c.highlight.field) ? c.highlight : null;
      return { ...c, columns, sort, highlight };
    });

  // Filters
  const setFilter = (i, changes) =>
    setConfig((c) => ({ ...c, filters: c.filters.map((f, n) => (n === i ? { ...f, ...changes } : f)) }));
  const addFilter = () => {
    const f = fields.find((x) => x.kind === "dimension") || fields[0];
    if (f) patch({ filters: [...config.filters, { field: f.key, op: "is", value: "" }] });
  };
  const changeFilterField = (i, key) => {
    const f = fieldByKey[key];
    setFilter(i, { field: key, op: f.kind === "measure" ? "gt" : "is", value: "" });
  };
  const filterValueText = (f) => (f.op === "any_of" && Array.isArray(f.value) ? f.value.join(", ") : f.value ?? "");
  const filterValueInput = (i, f, text) => {
    if (f.op === "any_of") setFilter(i, { value: text.split(",").map((v) => v.trim()).filter(Boolean) });
    else setFilter(i, { value: text });
  };
  const changeFilterOp = (i, f, op) => {
    const value = op === "any_of" ? (f.value ? [String(f.value)] : []) : Array.isArray(f.value) ? f.value[0] || "" : f.value;
    setFilter(i, { op, value });
  };

  // Tiles
  const tileKeys = config.tiles.map((t) => t.field);
  const toggleTile = (key) => {
    const f = fieldByKey[key];
    setConfig((c) => {
      if (c.tiles.some((t) => t.field === key)) return { ...c, tiles: c.tiles.filter((t) => t.field !== key) };
      const label = key === "_rows" ? "Rows" : key === "_flagged" ? "Highlighted rows" : f.label;
      const agg = key.startsWith("_") ? "count" : ["avg", "max"].includes(f.agg) ? f.agg : "sum";
      return { ...c, tiles: [...c.tiles, { field: key, agg, label }] };
    });
  };

  const buildPayload = () => ({
    name: name.trim(),
    description: description.trim(),
    source: sourceKey,
    config: apiConfig(config),
    audience,
    audience_roles: audience === "roles" ? audienceRoles : [],
  });

  const save = async (thenRun = false) => {
    if (!name.trim()) {
      setTab("data");
      setError("Give the report a name before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = editing
        ? await axios.patch(apiEndpoints.staffingCustomReport(id), buildPayload(), { headers: headers() })
        : await axios.post(apiEndpoints.staffingCustomReports, buildPayload(), { headers: headers() });
      setBaseline(current);
      navigate(thenRun ? `/reports/${res.data.id}` : "/reports", { replace: true });
    } catch (err) {
      setError(errorText(err, "Could not save the report."));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (dirty && !window.confirm("Discard your changes?")) return;
    navigate("/reports");
  };

  const groupedSources = useMemo(() => {
    const out = {};
    sources.forEach((s) => {
      const label = `${s.module_label} \u00b7 ${s.group}`;
      (out[label] = out[label] || []).push(s);
    });
    return out;
  }, [sources]);

  const dims = fields.filter((f) => f.kind === "dimension");
  const measures = fields.filter((f) => f.kind === "measure");
  const columnFields = config.columns.map((k) => fieldByKey[k]).filter(Boolean);
  const hlField = config.highlight ? fieldByKey[config.highlight.field] : null;

  if (loading) {
    return (
      <Box sx={{ p: 4 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  return (
    <BuilderShell
      title={editing ? "Edit report" : "New report"}
      subtitle="Pick the data, filters and layout. The preview updates as you go."
      chips={
        <>
          <Chip size="small" color="primary" label={source?.module_label || "Staffing"} />
          {dirty && <Chip size="small" color="warning" label="Unsaved changes" />}
        </>
      }
      tabs={[
        { key: "data", label: "Data" },
        { key: "filters", label: "Filters", count: config.filters.length || undefined },
        { key: "layout", label: "Layout" },
        { key: "share", label: "Sharing" },
      ]}
      tab={tab}
      onTab={setTab}
      maxWidth="100%"
    >
      <BuilderToolbar>
        <Box sx={{ flex: 1 }} />
        <Button onClick={cancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="outlined" onClick={() => save(false)} disabled={saving || !sourceKey}>
          Save
        </Button>
        <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={() => save(true)} disabled={saving || !sourceKey}>
          Save and run
        </Button>
      </BuilderToolbar>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 400px) minmax(0, 1fr)" }, gap: 2, alignItems: "start" }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          {tab === "data" && (
            <Stack spacing={2}>
              <TextField label="Report name" size="small" required value={name} onChange={(e) => setName(e.target.value)} inputProps={{ maxLength: 120 }} />
              <TextField label="Description (optional)" size="small" value={description} onChange={(e) => setDescription(e.target.value)} inputProps={{ maxLength: 300 }} />
              <FormControl size="small">
                <InputLabel id="rb-source">Start from</InputLabel>
                <Select labelId="rb-source" label="Start from" value={sourceKey} onChange={(e) => changeSource(e.target.value)}>
                  {Object.entries(groupedSources).flatMap(([group, items]) => [
                    <ListSubheader key={`g-${group}`}>{group}</ListSubheader>,
                    ...items.map((s) => (
                      <MenuItem key={s.key} value={s.key}>
                        {s.label}
                      </MenuItem>
                    )),
                  ])}
                </Select>
              </FormControl>
              {source && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: "-8px !important" }}>
                  {source.description} Limited to your organization.
                </Typography>
              )}
              <FormControl size="small">
                <InputLabel id="rb-group">Group rows by</InputLabel>
                <Select labelId="rb-group" label="Group rows by" value={config.group_by || ""} displayEmpty onChange={(e) => changeGroup(e.target.value)}>
                  <MenuItem value="">
                    <em>Nothing (one row per record)</em>
                  </MenuItem>
                  {dims.map((f) => (
                    <MenuItem key={f.key} value={f.key}>
                      {f.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Columns
                </Typography>
                {fields.map((f) => {
                  const locked = f.key === config.group_by;
                  const hidden = config.group_by && f.kind === "dimension" && !locked;
                  if (hidden) return null;
                  return (
                    <FormControlLabel
                      key={f.key}
                      sx={{ display: "flex", mr: 0 }}
                      control={<Checkbox size="small" checked={config.columns.includes(f.key)} disabled={locked} onChange={() => toggleColumn(f.key)} />}
                      label={
                        <Box sx={{ display: "flex", gap: 1, width: "100%" }}>
                          <span>{f.label}</span>
                          <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                            {locked ? "Group" : f.kind === "measure" ? "Number" : "Text"}
                          </Typography>
                        </Box>
                      }
                    />
                  );
                })}
                {config.group_by && (
                  <Typography variant="caption" color="text.secondary">
                    Grouped reports show the group and the numbers. Choose “Nothing” to list each record.
                  </Typography>
                )}
              </Box>
            </Stack>
          )}

          {tab === "filters" && (
            <Stack spacing={1.5}>
              <Typography variant="overline" color="text.secondary">
                Include rows where
              </Typography>
              {config.filters.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No filters. The report includes everything in the date range.
                </Typography>
              )}
              {config.filters.map((f, i) => {
                const field = fieldByKey[f.field];
                return (
                  <Box key={i} sx={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px", gap: 1 }}>
                    <Select size="small" value={f.field} onChange={(e) => changeFilterField(i, e.target.value)} aria-label="Filter field">
                      {fields.map((x) => (
                        <MenuItem key={x.key} value={x.key}>
                          {x.label}
                        </MenuItem>
                      ))}
                    </Select>
                    <Select size="small" value={f.op} onChange={(e) => changeFilterOp(i, f, e.target.value)} aria-label="Comparison">
                      {opsFor(field).map((op) => (
                        <MenuItem key={op} value={op}>
                          {OP_LABELS[op]}
                        </MenuItem>
                      ))}
                    </Select>
                    <TextField
                      size="small"
                      type={field?.kind === "measure" ? "number" : "text"}
                      placeholder={f.op === "any_of" ? "Separate values with commas" : "Value"}
                      value={filterValueText(f)}
                      onChange={(e) => filterValueInput(i, f, e.target.value)}
                      inputProps={{ "aria-label": "Filter value" }}
                    />
                    <IconButton aria-label="Remove filter" onClick={() => patch({ filters: config.filters.filter((_, n) => n !== i) })} sx={{ justifySelf: "start" }}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                );
              })}
              <Box>
                <Button size="small" startIcon={<AddIcon />} onClick={addFilter}>
                  Add filter
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary">
                People running the report can narrow these further. They cannot widen them.
              </Typography>

              <Typography variant="overline" color="text.secondary" sx={{ pt: 1 }}>
                Highlight in red
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px 90px", gap: 1 }}>
                <Select
                  size="small"
                  displayEmpty
                  value={config.highlight?.field || ""}
                  onChange={(e) => patch({ highlight: e.target.value ? { field: e.target.value, op: "gt", value: config.highlight?.value ?? "" } : null })}
                  aria-label="Highlight field"
                >
                  <MenuItem value="">
                    <em>Off</em>
                  </MenuItem>
                  {columnFields.map((x) => (
                    <MenuItem key={x.key} value={x.key}>
                      {x.label}
                    </MenuItem>
                  ))}
                </Select>
                <Select size="small" disabled={!config.highlight} value={config.highlight?.op || "gt"} onChange={(e) => patch({ highlight: { ...config.highlight, op: e.target.value } })} aria-label="Highlight comparison">
                  {(hlField?.kind === "measure" ? NUMBER_OPS : TEXT_OPS).map((op) => (
                    <MenuItem key={op} value={op}>
                      {OP_LABELS[op]}
                    </MenuItem>
                  ))}
                </Select>
                <TextField
                  size="small"
                  disabled={!config.highlight}
                  type={hlField?.kind === "measure" ? "number" : "text"}
                  value={config.highlight?.value ?? ""}
                  onChange={(e) => patch({ highlight: { ...config.highlight, value: e.target.value } })}
                  inputProps={{ "aria-label": "Highlight value" }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Matching rows turn red. The Layout tab can add a tile that counts them.
              </Typography>
            </Stack>
          )}

          {tab === "layout" && (
            <Stack spacing={1}>
              <Typography variant="overline" color="text.secondary">
                Summary tiles (pinned above the table)
              </Typography>
              {["_rows", ...measures.map((m) => m.key), ...(config.highlight ? ["_flagged"] : [])].map((key) => (
                <FormControlLabel
                  key={key}
                  sx={{ mr: 0 }}
                  control={<Checkbox size="small" checked={tileKeys.includes(key)} onChange={() => toggleTile(key)} />}
                  label={key === "_rows" ? "Number of rows" : key === "_flagged" ? "Highlighted rows" : fieldByKey[key].label}
                />
              ))}
              <Typography variant="overline" color="text.secondary" sx={{ pt: 1 }}>
                Sort
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 130px", gap: 1 }}>
                <Select size="small" displayEmpty value={config.sort?.field || ""} onChange={(e) => patch({ sort: e.target.value ? { field: e.target.value, dir: config.sort?.dir || "desc" } : null })} aria-label="Sort by">
                  <MenuItem value="">
                    <em>Default order</em>
                  </MenuItem>
                  {columnFields.map((x) => (
                    <MenuItem key={x.key} value={x.key}>
                      {x.label}
                    </MenuItem>
                  ))}
                </Select>
                <Select size="small" disabled={!config.sort} value={config.sort?.dir || "desc"} onChange={(e) => patch({ sort: { ...config.sort, dir: e.target.value } })} aria-label="Sort direction">
                  <MenuItem value="desc">High to low</MenuItem>
                  <MenuItem value="asc">Low to high</MenuItem>
                </Select>
              </Box>
              <FormControlLabel sx={{ mr: 0, pt: 1 }} control={<Checkbox size="small" checked={config.totals} onChange={(e) => patch({ totals: e.target.checked })} />} label="Show a totals row" />
            </Stack>
          )}

          {tab === "share" && (
            <Stack spacing={1}>
              <Typography variant="overline" color="text.secondary">
                Who can run this report
              </Typography>
              <RadioGroup value={audience} onChange={(e) => setAudience(e.target.value)}>
                <FormControlLabel value="me" control={<Radio size="small" />} label="Only me" />
                <FormControlLabel value="roles" control={<Radio size="small" />} label="People with a role" />
                <FormControlLabel value="org" control={<Radio size="small" />} label="Everyone at my facility who can use Staffing reports" />
              </RadioGroup>
              {audience === "roles" && (
                <Box sx={{ pl: 3 }}>
                  {SHARE_ROLES.map((r) => (
                    <FormControlLabel
                      key={r.value}
                      sx={{ display: "flex", mr: 0 }}
                      control={
                        <Checkbox
                          size="small"
                          checked={audienceRoles.includes(r.value)}
                          onChange={() => setAudienceRoles((x) => (x.includes(r.value) ? x.filter((v) => v !== r.value) : [...x, r.value]))}
                        />
                      }
                      label={r.label}
                    />
                  ))}
                </Box>
              )}
              <Typography variant="caption" color="text.secondary">
                Only you and admins can change or delete the report. Emailing a custom report on a schedule is not available yet.
              </Typography>
            </Stack>
          )}
        </Paper>

        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
            <Typography variant="overline" color="text.secondary">
              Live preview
            </Typography>
            {previewing && <CircularProgress size={14} />}
            {preview && (
              <Typography variant="caption" color="text.secondary">
                {preview.row_count} {preview.row_count === 1 ? "row" : "rows"}
                {preview.truncated ? " (first 5,000)" : ""}
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            {preview?.patient_names && (
              <Button
                size="small"
                variant={showNames ? "contained" : "outlined"}
                color={showNames ? "warning" : "inherit"}
                startIcon={showNames ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                onClick={() => setShowNames((v) => !v)}
              >
                {showNames ? "Hide patient names" : "Show patient names"}
              </Button>
            )}
            {source?.dated && (
              <>
                <Typography variant="caption" color="text.secondary">
                  {rangeText(previewRange(rangeKey).start, previewRange(rangeKey).end)}
                </Typography>
                <Select size="small" value={rangeKey} onChange={(e) => setRangeKey(e.target.value)} aria-label="Preview dates" sx={{ minWidth: 130 }}>
                  {PREVIEW_RANGES.map((r) => (
                    <MenuItem key={r.value} value={r.value}>
                      {r.label}
                    </MenuItem>
                  ))}
                </Select>
              </>
            )}
          </Box>
          {previewError && <Alert severity="warning">{previewError}</Alert>}
          {preview && preview.tiles.length > 0 && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
              {preview.tiles.map((t, i) => (
                <Paper key={i} variant="outlined" sx={{ px: 1.5, py: 0.5, flex: "1 1 130px", minWidth: 110 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: 11 }}>
                    {t.label}
                  </Typography>
                  <Typography sx={{ fontSize: 22, fontWeight: 500, lineHeight: 1.15, color: t.tone === "bad" ? "error.main" : "text.primary" }}>
                    {formatCell(t.value, t.type)}
                  </Typography>
                </Paper>
              ))}
            </Box>
          )}
          {preview && (
            <Paper variant="outlined">
              <ReportResultTable result={preview} stickyTop={BUILDER_STICKY_TOP} />
            </Paper>
          )}
        </Box>
      </Box>
    </BuilderShell>
  );
}
