import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
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
import { BuilderShell, BuilderToolbar, BUILDER_STICKY_TOP } from "../components/builders/BuilderShell";
import ReportResultTable from "../components/reports/ReportResultTable";
import {
  DEFAULT_DOC_COLUMNS,
  DOC_COLUMN_GROUPS,
  DOC_SOURCE,
  documentationColumns,
  documentationFields,
} from "../components/reports/documentationFields";
import { apiEndpoints } from "../config/api";
import { NUMBER_OPS, OP_LABELS, TEXT_OPS, errorText, formatCell, headers, isNumeric, isoDate } from "../components/reports/reportUtils";

const SHARE_ROLES = ["admin", "doctor", "nurse", "registrar"];
const FILTER_TEXT_OPS = [
  { value: "contains", label: "contains" },
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
];

const defaultRange = () => {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
  return { start: isoDate(start), end: isoDate(end) };
};

export default function ReportDocumentationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = !!id;

  const [templates, setTemplates] = useState([]);
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState([]); // template codes
  const [pickedObs, setPickedObs] = useState([]); // observation ids
  const [layout, setLayout] = useState("wide");
  const [status, setStatus] = useState("signed");
  const [ticked, setTicked] = useState(DEFAULT_DOC_COLUMNS);
  const [groupBy, setGroupBy] = useState(null);
  const [filters, setFilters] = useState([]);
  const [highlight, setHighlight] = useState(null);
  const [audience, setAudience] = useState("me");
  const [audienceRoles, setAudienceRoles] = useState([]);
  const [range, setRange] = useState(defaultRange);
  const [hidePhi, setHidePhi] = useState(true);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The notes to pick from, and (for an existing report) its saved settings.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let codes = [];
        let saved = null;
        if (editing) {
          const res = await axios.get(apiEndpoints.staffingCustomReport(id), { headers: headers() });
          saved = res.data;
          codes = (saved.config?.docs?.templates) || [];
        }
        const cat = await axios.get(apiEndpoints.staffingCustomReportDocumentationCatalog, {
          headers: headers(),
          params: codes.length ? { templates: codes.join(",") } : {},
        });
        if (cancelled) return;
        setTemplates(cat.data.templates);
        setObservations(cat.data.observations);
        if (saved) {
          const c = saved.config || {};
          const d = c.docs || {};
          const cols = c.columns || [];
          setName(saved.name);
          setDescription(saved.description || "");
          setPicked(d.templates || []);
          setPickedObs(d.observations || []);
          setLayout(d.layout || "wide");
          setStatus(d.status || "signed");
          setTicked(cols);
          setGroupBy(c.group_by || null);
          setFilters((c.filters || []).map((f) => ({ field: f.field, op: f.op, value: String(f.value ?? "") })));
          setHighlight(c.highlight ? { ...c.highlight, value: String(c.highlight.value ?? "") } : null);
          setAudience(saved.audience);
          setAudienceRoles(saved.audience_roles || []);
        }
      } catch (err) {
        if (!cancelled) setError(errorText(err, "Could not open documentation reports."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, editing]);

  // The observations of whichever notes are picked.
  const pickedKey = picked.join(",");
  useEffect(() => {
    if (loading) return undefined;
    if (!pickedKey) {
      setObservations([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(apiEndpoints.staffingCustomReportDocumentationCatalog, { headers: headers(), params: { templates: pickedKey } });
        if (cancelled) return;
        setObservations(res.data.observations);
        const have = new Set(res.data.observations.map((o) => o.id));
        setPickedObs((x) => x.filter((k) => have.has(k)));
      } catch (err) {
        if (!cancelled) setError(errorText(err, "Could not load the observations of these notes."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pickedKey, loading]);

  const templateByCode = useMemo(() => Object.fromEntries(templates.map((t) => [t.code, t])), [templates]);
  const obsById = useMemo(() => Object.fromEntries(observations.map((o) => [o.id, o])), [observations]);
  const pickedObjs = useMemo(() => pickedObs.map((k) => obsById[k]).filter(Boolean), [pickedObs, obsById]);
  const fields = useMemo(() => documentationFields(layout, pickedObjs), [layout, pickedObjs]);
  const fieldMap = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f])), [fields]);

  const columns = useMemo(() => documentationColumns(layout, ticked, pickedObjs), [layout, ticked, pickedObjs]);

  const config = useMemo(
    () => ({
      docs: { templates: picked, observations: pickedObs, layout, status },
      columns,
      group_by: groupBy && fieldMap[groupBy] ? groupBy : null,
      filters: filters
        .filter((f) => fieldMap[f.field] && String(f.value).trim() !== "")
        .map((f) => ({ field: f.field, op: f.op, value: String(f.value).trim() })),
      highlight:
        highlight && columns.includes(highlight.field) && String(highlight.value).trim() !== ""
          ? { field: highlight.field, op: highlight.op, value: String(highlight.value).trim() }
          : null,
      tiles: [{ field: "_rows", agg: "count", label: layout === "long" ? "Values" : "Notes" }],
      totals: false,
    }),
    [picked, pickedObs, layout, status, columns, groupBy, filters, highlight, fieldMap]
  );

  // Live result, a moment after the last change.
  useEffect(() => {
    if (loading) return undefined;
    if (picked.length === 0 || columns.length === 0) {
      setPreview(null);
      setPreviewError("");
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setPreviewing(true);
      setPreviewError("");
      try {
        const res = await axios.post(
          apiEndpoints.staffingCustomReportPreview,
          { source: DOC_SOURCE, config, start: range.start, end: range.end, hide_phi: hidePhi },
          { headers: headers() }
        );
        if (!cancelled) setPreview(res.data);
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(errorText(err, "Could not build the result."));
        }
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [config, picked.length, columns.length, range, hidePhi, loading]);

  const toggleColumn = (key) => setTicked((x) => (x.includes(key) ? x.filter((k) => k !== key) : [...x, key]));
  const setFilter = (i, patch) => setFilters((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const groupOptions = fields.filter((f) => f.kind === "dimension" && columns.includes(f.key));
  const columnFields = columns.map((k) => fieldMap[k]).filter(Boolean);
  const hlField = highlight ? fieldMap[highlight.field] : null;
  const highlightOps = hlField && (hlField.kind === "measure" || isNumeric(hlField.type)) ? NUMBER_OPS : TEXT_OPS;
  const filterOps = (f) => (fieldMap[f.field]?.kind === "measure" ? NUMBER_OPS.filter((o) => o !== "is").map((o) => ({ value: o, label: OP_LABELS[o] || o })) : FILTER_TEXT_OPS);

  const save = async (thenRun) => {
    if (!name.trim()) {
      setError("Give the report a name before saving.");
      return;
    }
    if (picked.length === 0) {
      setError("Choose at least one note or screen.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        source: DOC_SOURCE,
        config,
        audience,
        audience_roles: audience === "roles" ? audienceRoles : [],
      };
      const res = editing
        ? await axios.patch(apiEndpoints.staffingCustomReport(id), body, { headers: headers() })
        : await axios.post(apiEndpoints.staffingCustomReports, body, { headers: headers() });
      navigate(thenRun ? `/reports/${res.data.id}` : "/reports", { replace: true });
    } catch (err) {
      setError(errorText(err, "Could not save the report."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 4 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  const groupRank = (g) => (g === "Flowsheets" ? 3 : g === "Free-text notes" ? 2 : g === "Other structured notes" ? 1 : 0);
  const templateOptions = [...templates]
    .sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
    .map((t) => t.code);
  const observationOptions = observations.map((o) => o.id);
  const obsGroup = (id_) => {
    const o = obsById[id_];
    if (!o) return "";
    if (o.codes.length > 1) return "In several of the picked notes";
    return templateByCode[o.codes[0]]?.name || o.codes[0];
  };
  const sortedObservationOptions = [...observationOptions].sort((a, b) => {
    const ga = obsGroup(a) === "In several of the picked notes" ? 0 : 1;
    const gb = obsGroup(b) === "In several of the picked notes" ? 0 : 1;
    return ga - gb;
  });

  return (
    <BuilderShell
      title={editing ? "Edit documentation report" : "New documentation report"}
      subtitle="Pick the notes or screens, what to show about each, and which observations of the note to include, each with its label and value."
      maxWidth="100%"
    >
      <BuilderToolbar>
        <TextField size="small" label="Report name" value={name} onChange={(e) => setName(e.target.value)} inputProps={{ maxLength: 120 }} sx={{ width: 280 }} />
        <Box sx={{ flex: 1 }} />
        <Button onClick={() => navigate("/reports")} disabled={saving}>
          Cancel
        </Button>
        <Button variant="outlined" onClick={() => save(false)} disabled={saving}>
          Save
        </Button>
        <Button variant="contained" onClick={() => save(true)} disabled={saving}>
          Save and run
        </Button>
      </BuilderToolbar>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "340px minmax(0,1fr)" }, gap: 2, alignItems: "start" }}>
        <Paper variant="outlined" sx={{ p: 1.75 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                1 · What was documented
              </Typography>
              <Autocomplete
                multiple
                disableCloseOnSelect
                size="small"
                options={templateOptions}
                value={picked}
                onChange={(_, v) => setPicked(v)}
                groupBy={(code) => templateByCode[code]?.group || "Other"}
                getOptionLabel={(code) => templateByCode[code]?.name || code}
                renderOption={(props, code, { selected }) => (
                  <li {...props} key={code}>
                    <Checkbox size="small" checked={selected} sx={{ mr: 0.5, p: 0.5 }} />
                    <Box sx={{ flex: 1 }}>{templateByCode[code]?.name || code}</Box>
                    <Typography variant="caption" color="text.secondary">
                      {templateByCode[code]?.structured ? "structured" : "free text"}
                    </Typography>
                  </li>
                )}
                renderTags={(value, getTagProps) =>
                  value.map((code, index) => {
                    const { key, ...tagProps } = getTagProps({ index });
                    return <Chip key={key} size="small" label={templateByCode[code]?.name || code} {...tagProps} />;
                  })
                }
                renderInput={(params) => <TextField {...params} label="Notes or screens" placeholder={picked.length ? "" : "Search and pick one or several"} />}
                noOptionsText="No note matches that search."
              />
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1.5 }}>
                <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
                <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Dates here are for this preview. When you run the saved report you choose the dates again.
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Status
                </Typography>
                <Select fullWidth size="small" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                  <MenuItem value="signed">Signed only</MenuItem>
                  <MenuItem value="all">Signed and draft</MenuItem>
                </Select>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  Flowsheets are never signed, so every charted time point is included.
                </Typography>
              </Box>
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                2 · Columns
              </Typography>
              {DOC_COLUMN_GROUPS.map(([group, cols]) => (
                <Box key={group} sx={{ mb: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>
                    {group}
                  </Typography>
                  {cols.map(([key, label]) => (
                    <FormControlLabel
                      key={key}
                      sx={{ display: "flex", mr: 0 }}
                      control={<Checkbox size="small" checked={ticked.includes(key)} onChange={() => toggleColumn(key)} />}
                      label={<Typography variant="body2">{label}</Typography>}
                    />
                  ))}
                </Box>
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>
                Observations in the note
              </Typography>
              <Autocomplete
                multiple
                disableCloseOnSelect
                size="small"
                options={sortedObservationOptions}
                value={pickedObs.filter((k) => obsById[k])}
                onChange={(_, v) => setPickedObs(v)}
                groupBy={obsGroup}
                getOptionLabel={(k) => obsById[k]?.label || k}
                disabled={picked.length === 0}
                renderOption={(props, k, { selected }) => (
                  <li {...props} key={k}>
                    <Checkbox size="small" checked={selected} sx={{ mr: 0.5, p: 0.5 }} />
                    <Box sx={{ flex: 1 }}>{obsById[k]?.label}</Box>
                    <Typography variant="caption" color="text.secondary">
                      {obsById[k]?.type === "meaning" ? "calculated" : obsById[k]?.type}
                    </Typography>
                  </li>
                )}
                renderTags={(value, getTagProps) =>
                  value.map((k, index) => {
                    const { key, ...tagProps } = getTagProps({ index });
                    return <Chip key={key} size="small" label={obsById[k]?.label || k} {...tagProps} />;
                  })
                }
                renderInput={(params) => (
                  <TextField {...params} label="Pick the observations to include" placeholder={pickedObs.length ? "" : picked.length ? "Search observations" : "Pick a note first"} />
                )}
                noOptionsText="No observation matches that search."
                sx={{ mt: 0.5 }}
              />
              <RadioGroup value={layout} onChange={(e) => setLayout(e.target.value)} aria-label="Observation layout" sx={{ mt: 0.5 }}>
                <FormControlLabel
                  value="wide"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2">One column per observation</Typography>
                      <Typography variant="caption" color="text.secondary">
                        One row per note. Best for comparing.
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="long"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2">Observation and Value columns</Typography>
                      <Typography variant="caption" color="text.secondary">
                        One row per observation. Best for counting and charting.
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
              <Typography variant="caption" color="text.secondary">
                An observation that only some of the picked notes have stays blank on the others. Numbers and calculated scores can be averaged; typed text can only be shown or counted.
              </Typography>
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                3 · Refine
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                Group by
              </Typography>
              <Select fullWidth size="small" displayEmpty value={groupBy && columns.includes(groupBy) ? groupBy : ""} onChange={(e) => setGroupBy(e.target.value || null)} aria-label="Group by">
                <MenuItem value="">No grouping (one row per note)</MenuItem>
                {groupOptions.map((f) => (
                  <MenuItem key={f.key} value={f.key}>
                    {f.label}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Only show
              </Typography>
              {filters.map((f, i) => (
                <Box key={i} sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 0.5, mb: 0.75 }}>
                  <Select size="small" displayEmpty value={f.field} onChange={(e) => setFilter(i, { field: e.target.value, op: fieldMap[e.target.value]?.kind === "measure" ? "gte" : "contains" })} aria-label="Filter field">
                    <MenuItem value="">Choose a field</MenuItem>
                    {columnFields.map((d) => (
                      <MenuItem key={d.key} value={d.key}>
                        {d.label}
                      </MenuItem>
                    ))}
                  </Select>
                  <IconButton size="small" aria-label="Remove filter" onClick={() => setFilters((x) => x.filter((_, j) => j !== i))}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                  <Box sx={{ display: "grid", gridTemplateColumns: "104px 1fr", gap: 0.5, gridColumn: "1 / -1" }}>
                    <Select size="small" value={f.op} onChange={(e) => setFilter(i, { op: e.target.value })} aria-label="Filter comparison">
                      {filterOps(f).map((o) => (
                        <MenuItem key={o.value} value={o.value}>
                          {o.label}
                        </MenuItem>
                      ))}
                    </Select>
                    <TextField size="small" value={f.value} onChange={(e) => setFilter(i, { value: e.target.value })} inputProps={{ "aria-label": "Filter value" }} />
                  </Box>
                </Box>
              ))}
              <Button size="small" startIcon={<AddIcon />} onClick={() => setFilters((x) => [...x, { field: "", op: "contains", value: "" }])} disabled={columnFields.length === 0}>
                Add a filter
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Highlight rows in red when
              </Typography>
              {highlight ? (
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 0.5 }}>
                  <Select size="small" displayEmpty value={highlight.field} onChange={(e) => setHighlight({ field: e.target.value, op: fieldMap[e.target.value]?.kind === "measure" ? "gte" : "is", value: "" })} aria-label="Highlight field">
                    <MenuItem value="">Choose a column</MenuItem>
                    {columnFields.map((f) => (
                      <MenuItem key={f.key} value={f.key}>
                        {f.label}
                      </MenuItem>
                    ))}
                  </Select>
                  <IconButton size="small" aria-label="Remove highlight" onClick={() => setHighlight(null)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                  <Box sx={{ display: "grid", gridTemplateColumns: "104px 1fr", gap: 0.5, gridColumn: "1 / -1" }}>
                    <Select size="small" value={highlight.op} onChange={(e) => setHighlight({ ...highlight, op: e.target.value })} aria-label="Highlight comparison">
                      {highlightOps.map((o) => (
                        <MenuItem key={o} value={o}>
                          {OP_LABELS[o] || o}
                        </MenuItem>
                      ))}
                    </Select>
                    <TextField size="small" value={highlight.value} onChange={(e) => setHighlight({ ...highlight, value: e.target.value })} inputProps={{ "aria-label": "Highlight value" }} />
                  </Box>
                </Box>
              ) : (
                <Box>
                  <Button size="small" startIcon={<AddIcon />} onClick={() => setHighlight({ field: "", op: "is", value: "" })} disabled={columnFields.length === 0}>
                    Add a highlight
                  </Button>
                </Box>
              )}
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                4 · Privacy
              </Typography>
              <FormControlLabel
                sx={{ display: "flex", mr: 0 }}
                control={<Checkbox size="small" checked={hidePhi} onChange={(e) => setHidePhi(e.target.checked)} />}
                label={<Typography variant="body2">Hide patient names, MRN and typed text in this preview</Typography>}
              />
              <Typography variant="caption" color="text.secondary">
                Names and MRN show as “Patient 1” and “[Hidden]”. Scores, dropdown answers, visit IDs and dates stay visible. This is not full de-identification. Every run is recorded in the audit log.
              </Typography>
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Who can run this report
              </Typography>
              <RadioGroup value={audience} onChange={(e) => setAudience(e.target.value)}>
                <FormControlLabel value="me" control={<Radio size="small" />} label="Only me" />
                <FormControlLabel value="roles" control={<Radio size="small" />} label="People with a role" />
                <FormControlLabel value="org" control={<Radio size="small" />} label="Everyone at my facility" />
              </RadioGroup>
              {audience === "roles" &&
                SHARE_ROLES.map((r) => (
                  <FormControlLabel
                    key={r}
                    sx={{ display: "flex", ml: 2, mr: 0, textTransform: "capitalize" }}
                    control={
                      <Checkbox size="small" checked={audienceRoles.includes(r)} onChange={() => setAudienceRoles((x) => (x.includes(r) ? x.filter((v) => v !== r) : [...x, r]))} />
                    }
                    label={r}
                  />
                ))}
              <Typography variant="caption" color="text.secondary">
                Only people who hold the clinical-notes right can see or run it.
              </Typography>
            </Box>
            <TextField size="small" label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} inputProps={{ maxLength: 300 }} />
          </Stack>
        </Paper>

        <Paper variant="outlined">
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography variant="subtitle2">Result</Typography>
            {previewing && <CircularProgress size={14} />}
            {preview && (
              <Typography variant="caption" color="text.secondary">
                {preview.row_count} {preview.row_count === 1 ? "row" : "rows"}
                {preview.truncated ? " (first 5,000)" : ""}
              </Typography>
            )}
          </Box>
          {previewError && (
            <Alert severity="warning" sx={{ m: 1.5 }}>
              {previewError}
            </Alert>
          )}
          {!preview && !previewError && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Pick a note or screen and the columns you want. The result appears here.
            </Typography>
          )}
          {preview && preview.tiles && preview.tiles.length > 0 && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", p: 1.5 }}>
              {preview.tiles.map((t, i) => (
                <Paper key={i} variant="outlined" sx={{ px: 1.5, py: 0.5, flex: "1 1 130px", minWidth: 110, maxWidth: 220 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: 11 }}>
                    {t.label}
                  </Typography>
                  <Typography sx={{ fontSize: 22, fontWeight: 500, lineHeight: 1.15 }}>{formatCell(t.value, t.type)}</Typography>
                </Paper>
              ))}
            </Box>
          )}
          {preview && <ReportResultTable result={preview} stickyTop={BUILDER_STICKY_TOP} />}
        </Paper>
      </Box>
    </BuilderShell>
  );
}
