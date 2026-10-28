import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  Alert,
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
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { BuilderShell, BuilderToolbar, BUILDER_STICKY_TOP } from "../components/builders/BuilderShell";
import ReportResultTable from "../components/reports/ReportResultTable";
import { apiEndpoints } from "../config/api";
import {
  MODULE_COLORS,
  NUMBER_OPS,
  OP_LABELS,
  TEXT_OPS,
  errorText,
  formatCell,
  headers,
  isNumeric,
  presetRange,
  rangeText,
} from "../components/reports/reportUtils";

const SHARE_ROLES = ["admin", "doctor", "nurse", "registrar"];
const RANGES = [
  { value: "week", label: "This week" },
  { value: "last-week", label: "Last week" },
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
];
const WINDOWS = [3, 7, 14, 30];
const FILTER_OPS = [
  { value: "contains", label: "contains" },
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
];

const PRESETS = [
  {
    key: "texted",
    label: "Texted, then came in",
    name: "Texted last week: who came in?",
    objects: ["msg", "pat", "visit"],
    cols: ["visit__care", "pat__count", "msg__count", "visit__count"],
    tiles: ["pat__count", "visit__count"],
    groupBy: "visit__care",
    keep: true,
    window: 7,
    range: "last-week",
  },
  {
    key: "nurse",
    label: "Nurse for each patient",
    name: "Nurse for each patient",
    objects: ["pat", "visit", "nurse"],
    cols: ["nurse__name", "pat__name", "visit__date", "visit__care"],
    tiles: ["_rows", "nurse__count"],
    groupBy: null,
    keep: false,
    window: 0,
    range: "week",
  },
];

const previewRange = (value) => {
  const now = new Date();
  if (value === "last-week") return presetRange("week", new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  if (value === "last-month") return presetRange("month", new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return presetRange(value, now);
};

// The link a card joins through: the earliest-listed link to a card before it (the server picks the same way).
const parentLink = (links, objects, idx) => {
  let best = null;
  links.forEach((l, i) => {
    const other = l.a === objects[idx] ? l.b : l.b === objects[idx] ? l.a : null;
    if (other && objects.slice(0, idx).includes(other) && (best === null || i < best.i)) best = { i, l, other };
  });
  return best;
};

export default function ReportCanvasPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = !!id;

  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objects, setObjects] = useState([]);
  const [cols, setCols] = useState([]);
  const [groupBy, setGroupBy] = useState(null);
  const [filters, setFilters] = useState([]);
  const [tiles, setTiles] = useState([]);
  const [sort, setSort] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [totals, setTotals] = useState(true);
  const [keepUnmatched, setKeepUnmatched] = useState(true);
  const [windowDays, setWindowDays] = useState(7);
  const [audience, setAudience] = useState("me");
  const [audienceRoles, setAudienceRoles] = useState([]);
  const [rangeKey, setRangeKey] = useState("week");
  const [hidePhi, setHidePhi] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const objMap = useMemo(() => Object.fromEntries((catalog?.objects || []).map((o) => [o.key, o])), [catalog]);
  const fieldMap = useMemo(() => {
    const out = {};
    (catalog?.objects || []).forEach((o) => {
      o.fields.forEach((f) => {
        out[`${o.key}__${f.key}`] = { ...f, key: `${o.key}__${f.key}`, label: `${o.label} · ${f.label}`, object: o.key };
      });
      out[`${o.key}__count`] = { key: `${o.key}__count`, label: o.plural, kind: "measure", type: "number", object: o.key };
    });
    return out;
  }, [catalog]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cat = await axios.get(apiEndpoints.staffingCustomReportLinkedCatalog, { headers: headers() });
        if (cancelled) return;
        setCatalog(cat.data);
        if (editing) {
          const res = await axios.get(apiEndpoints.staffingCustomReport(id), { headers: headers() });
          if (cancelled) return;
          const r = res.data;
          const c = r.config || {};
          setName(r.name);
          setDescription(r.description || "");
          setObjects((c.canvas && c.canvas.objects) || []);
          setKeepUnmatched(!(c.canvas && c.canvas.keep_unmatched === false));
          setWindowDays((c.canvas && c.canvas.window_days) ?? 7);
          setCols(c.columns || []);
          setGroupBy(c.group_by || null);
          setFilters((c.filters || []).map((f) => ({ field: f.field, op: f.op, value: String(f.value ?? "") })));
          setTiles((c.tiles || []).map((t) => t.field));
          setSort(c.sort || null);
          setHighlight(c.highlight ? { ...c.highlight, value: String(c.highlight.value ?? "") } : null);
          setTotals(c.totals !== false);
          setAudience(r.audience);
          setAudienceRoles(r.audience_roles || []);
        }
      } catch (err) {
        if (!cancelled) setError(errorText(err, "Could not open the report canvas."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, editing]);

  const config = useMemo(
    () => ({
      canvas: { objects, keep_unmatched: keepUnmatched, window_days: windowDays },
      columns: cols.filter((k) => fieldMap[k]),
      group_by: groupBy,
      filters: filters
        .filter((f) => f.field && String(f.value).trim() !== "")
        .map((f) => ({ field: f.field, op: f.op, value: String(f.value).trim() })),
      highlight:
        highlight && highlight.field && String(highlight.value).trim() !== ""
          ? { field: highlight.field, op: highlight.op, value: String(highlight.value).trim() }
          : null,
      tiles: tiles
        .filter((k) => k === "_rows" || (k === "_flagged" && highlight?.field) || (fieldMap[k] && fieldMap[k].kind === "measure" && objects.includes(fieldMap[k].object)))
        .map((k) => ({
          field: k,
          agg: k.startsWith("_") ? "count" : fieldMap[k].agg === "avg" ? "avg" : "sum",
          label: k === "_rows" ? "Rows" : k === "_flagged" ? "Highlighted rows" : fieldMap[k].label,
        })),
      sort: sort && cols.includes(sort.field) ? sort : null,
      totals,
    }),
    [objects, keepUnmatched, windowDays, cols, groupBy, filters, highlight, tiles, sort, totals, fieldMap]
  );

  // Live result, a moment after the last change.
  useEffect(() => {
    if (objects.length < 2 || config.columns.length === 0) {
      setPreview(null);
      setPreviewError(objects.length < 2 ? "" : "Tick at least one field to show.");
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setPreviewing(true);
      setPreviewError("");
      try {
        const range = previewRange(rangeKey);
        const res = await axios.post(
          apiEndpoints.staffingCustomReportPreview,
          { source: "linked", config, start: range.start, end: range.end, hide_phi: hidePhi },
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
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [config, objects.length, rangeKey, hidePhi]);

  const addObject = (key) => {
    const o = objMap[key];
    if (!o || !o.allowed || objects.includes(key) || objects.length >= (catalog?.max_objects || 6)) return;
    setObjects((x) => [...x, key]);
    setCols((c) => [...c, `${key}__count`]);
  };

  const removeObject = (key) => {
    setObjects((x) => x.filter((k) => k !== key));
    setCols((c) => c.filter((k) => !k.startsWith(`${key}__`)));
    setFilters((f) => f.filter((x) => !x.field.startsWith(`${key}__`)));
    setGroupBy((g) => (g && g.startsWith(`${key}__`) ? null : g));
  };

  const applyPreset = (p) => {
    setName((n) => n || p.name);
    setObjects(p.objects);
    setCols(p.cols);
    setGroupBy(p.groupBy);
    setFilters([]);
    setTiles(p.tiles || []);
    setSort(null);
    setHighlight(null);
    setKeepUnmatched(p.keep);
    setWindowDays(p.window);
    setRangeKey(p.range);
  };

  const toggleCol = (key) => setCols((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
  const setFilter = (i, patch) => setFilters((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const dimOptions = objects.flatMap((k) => (objMap[k]?.fields || []).filter((f) => f.kind === "dimension").map((f) => fieldMap[`${k}__${f.key}`]));
  const hasMsg = objects.includes("msg");
  const columnFields = cols.filter((k) => fieldMap[k] && objects.includes(fieldMap[k].object)).map((k) => fieldMap[k]);
  const hlField = highlight ? fieldMap[highlight.field] : null;
  const highlightOps = hlField && (hlField.kind === "measure" || isNumeric(hlField.type)) ? NUMBER_OPS : TEXT_OPS;
  const tileOptions = [
    { key: "_rows", label: "Number of rows" },
    ...objects.flatMap((k) => [
      { key: `${k}__count`, label: `${objMap[k]?.plural || k}` },
      ...(objMap[k]?.fields || []).filter((f) => f.kind === "measure").map((f) => ({ key: `${k}__${f.key}`, label: fieldMap[`${k}__${f.key}`].label })),
    ]),
    ...(highlight?.field ? [{ key: "_flagged", label: "Highlighted rows" }] : []),
  ];
  const toggleTile = (key) => setTiles((t) => (t.includes(key) ? t.filter((x) => x !== key) : [...t, key]));
  const range = previewRange(rangeKey);

  const save = async (thenRun) => {
    if (!name.trim()) {
      setError("Give the report a name before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        source: "linked",
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

  const groups = {};
  (catalog?.objects || []).forEach((o) => {
    (groups[o.module_label] = groups[o.module_label] || []).push(o);
  });

  return (
    <BuilderShell
      title={editing ? "Edit linked report" : "New linked report"}
      subtitle="Drag things onto the canvas. They join through the links the data really has."
      chips={<Chip size="small" color="primary" label="Linked" />}
      maxWidth="100%"
    >
      <BuilderToolbar>
        <TextField
          size="small"
          placeholder="Report name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          inputProps={{ maxLength: 120, "aria-label": "Report name" }}
          sx={{ minWidth: 280 }}
        />
        <Box sx={{ flex: 1 }} />
        {preview?.phi && (
          <Tooltip title="Replaces patient names and note text in the result">
            <Button
              variant={hidePhi ? "contained" : "outlined"}
              color={hidePhi ? "warning" : "inherit"}
              startIcon={hidePhi ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
              onClick={() => setHidePhi((v) => !v)}
            >
              {hidePhi ? "Show PHI" : "Hide PHI"}
            </Button>
          </Tooltip>
        )}
        <Button color="inherit" onClick={() => navigate("/reports")}>
          Cancel
        </Button>
        <Button variant="outlined" onClick={() => save(false)} disabled={saving || objects.length < 2}>
          Save
        </Button>
        <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={() => save(true)} disabled={saving || objects.length < 2}>
          Save and run
        </Button>
      </BuilderToolbar>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "220px minmax(0, 1fr) 270px" }, gap: 2, alignItems: "start" }}>
        <Paper variant="outlined" sx={{ p: 1.5 }} aria-label="Things you can add">
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Drag onto the canvas
          </Typography>
          {Object.entries(groups).map(([module, items]) => (
            <Box key={module} sx={{ mb: 1.5 }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.75, lineHeight: 1.6 }}>
                <Box component="span" sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: MODULE_COLORS[module] || "text.secondary" }} />
                {module}
              </Typography>
              {items.map((o) => {
                const used = objects.includes(o.key);
                return (
                  <Tooltip key={o.key} title={o.allowed ? "" : "Your role does not include this."}>
                    <Box
                      role="button"
                      tabIndex={o.allowed && !used ? 0 : -1}
                      aria-disabled={!o.allowed || used}
                      draggable={o.allowed && !used}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", o.key)}
                      onClick={() => addObject(o.key)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && addObject(o.key)}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        px: 1,
                        py: 0.5,
                        mb: 0.5,
                        fontSize: 13,
                        cursor: o.allowed && !used ? "grab" : "not-allowed",
                        opacity: o.allowed && !used ? 1 : 0.5,
                        "&:hover": o.allowed && !used ? { bgcolor: "action.hover" } : undefined,
                      }}
                    >
                      {o.label}
                      {!o.allowed && <LockOutlinedIcon sx={{ fontSize: 15, ml: "auto" }} />}
                      {used && <Typography variant="caption" sx={{ ml: "auto" }}>added</Typography>}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          ))}
        </Paper>

        <Box sx={{ minWidth: 0 }}>
          <Box
            data-testid="report-canvas"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addObject(e.dataTransfer.getData("text/plain"));
            }}
            sx={{
              minHeight: 150,
              border: "1.5px dashed",
              borderColor: dragOver ? "primary.main" : "divider",
              bgcolor: dragOver ? "action.hover" : "transparent",
              borderRadius: 2,
              p: 1.5,
              display: "flex",
              alignItems: "stretch",
              overflowX: "auto",
            }}
          >
            {objects.length === 0 && (
              <Stack spacing={1.25} sx={{ m: "auto", textAlign: "center", alignItems: "center", py: 2 }}>
                <Typography color="text.secondary">Drag a thing here, or start from an example.</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="center">
                  {PRESETS.map((p) => {
                    const ok = p.objects.every((k) => objMap[k]?.allowed);
                    return (
                      <Tooltip key={p.key} title={ok ? "" : "Your role does not include every part of this."}>
                        <span>
                          <Button size="small" variant="outlined" disabled={!ok} onClick={() => applyPreset(p)}>
                            {p.label}
                          </Button>
                        </span>
                      </Tooltip>
                    );
                  })}
                </Stack>
              </Stack>
            )}
            {objects.map((k, idx) => {
              const o = objMap[k];
              if (!o) return null;
              const link = idx > 0 ? parentLink(catalog.links, objects, idx) : null;
              const prev = idx > 0 ? objects[idx - 1] : null;
              const color = MODULE_COLORS[o.module_label] || "#44546f";
              return (
                <Box key={k} sx={{ display: "flex", alignItems: "stretch" }}>
                  {idx > 0 && (
                    <Box sx={{ width: 104, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", px: 0.5, textAlign: "center" }}>
                      {link ? (
                        <>
                          <Typography variant="caption" sx={{ color: link.l.fuzzy ? "warning.main" : "text.secondary", fontWeight: link.l.fuzzy ? 600 : 400, lineHeight: 1.2 }}>
                            {link.l.label}
                          </Typography>
                          {link.other !== prev && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                              from {objMap[link.other]?.label}
                            </Typography>
                          )}
                          <Box sx={{ width: "100%", borderTop: "2px", borderTopStyle: link.l.fuzzy ? "dashed" : "solid", borderColor: link.l.fuzzy ? "warning.main" : "text.secondary", mt: 0.5 }} />
                        </>
                      ) : (
                        <Chip size="small" color="error" variant="outlined" label="not connected" />
                      )}
                    </Box>
                  )}
                  <Paper variant="outlined" sx={{ width: 190, flex: "none", borderTop: `3px solid ${color}` }}>
                    <Box sx={{ display: "flex", alignItems: "flex-start", px: 1, py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                          {o.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {o.module_label}
                        </Typography>
                      </Box>
                      <IconButton size="small" aria-label={`Remove ${o.label}`} onClick={() => removeObject(k)} sx={{ ml: "auto" }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    {o.fields.map((f) => {
                      const key = `${k}__${f.key}`;
                      return (
                        <FormControlLabel
                          key={key}
                          sx={{ display: "flex", mx: 0, pl: 0.5, pr: 1, "& .MuiFormControlLabel-label": { fontSize: 13, flex: 1 } }}
                          control={<Checkbox size="small" checked={cols.includes(key)} onChange={() => toggleCol(key)} />}
                          label={
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                              {f.label}
                              {f.phi && <Chip size="small" color="warning" label="PHI" sx={{ height: 16, fontSize: 9.5 }} />}
                            </Box>
                          }
                        />
                      );
                    })}
                    <FormControlLabel
                      sx={{ display: "flex", mx: 0, pl: 0.5, pr: 1, borderTop: "1px solid", borderColor: "divider", "& .MuiFormControlLabel-label": { fontSize: 13, fontWeight: 600 } }}
                      control={<Checkbox size="small" checked={cols.includes(`${k}__count`)} onChange={() => toggleCol(`${k}__count`)} />}
                      label={`Count of ${o.plural.toLowerCase()}`}
                    />
                  </Paper>
                </Box>
              );
            })}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
            Counts are of different records: a text that matches two visits is still one message. A link marked
            “matched by phone” compares phone numbers, so shared or missing numbers can match wrongly or not at all.
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack spacing={1.75}>
            <Typography variant="subtitle2">Report settings</Typography>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {hasMsg ? "Messages sent" : "Dates"}
              </Typography>
              <Select fullWidth size="small" value={rangeKey} onChange={(e) => setRangeKey(e.target.value)} aria-label="Dates">
                {RANGES.map((r) => (
                  <MenuItem key={r.value} value={r.value}>
                    {r.label}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary">
                {rangeText(range.start, range.end)}
              </Typography>
            </Box>
            {hasMsg && objects.length > 1 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Count a visit within
                </Typography>
                <Select fullWidth size="small" value={windowDays} onChange={(e) => setWindowDays(e.target.value)} aria-label="Visit window">
                  {WINDOWS.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d} days after the text
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            )}
            <Box>
              <Typography variant="caption" color="text.secondary">
                Records with no match
              </Typography>
              <Box sx={{ display: "flex", gap: 0.75, mt: 0.25 }}>
                <Button fullWidth size="small" variant={keepUnmatched ? "contained" : "outlined"} onClick={() => setKeepUnmatched(true)}>
                  Keep them
                </Button>
                <Button fullWidth size="small" variant={keepUnmatched ? "outlined" : "contained"} onClick={() => setKeepUnmatched(false)}>
                  Leave out
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Keeping them lets you count “texted, never came in”.
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Group by
              </Typography>
              <Select fullWidth size="small" displayEmpty value={groupBy || ""} onChange={(e) => setGroupBy(e.target.value || null)} aria-label="Group by">
                <MenuItem value="">No grouping (one row per match)</MenuItem>
                {dimOptions.map((f) => (
                  <MenuItem key={f.key} value={f.key}>
                    {f.label}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Filters
              </Typography>
              {filters.map((f, i) => (
                <Box key={i} sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 0.5, mb: 0.75 }}>
                  <Select size="small" displayEmpty value={f.field} onChange={(e) => setFilter(i, { field: e.target.value })} aria-label="Filter field">
                    <MenuItem value="">Choose a field</MenuItem>
                    {dimOptions.map((d) => (
                      <MenuItem key={d.key} value={d.key}>
                        {d.label}
                      </MenuItem>
                    ))}
                  </Select>
                  <IconButton size="small" aria-label="Remove filter" onClick={() => setFilters((x) => x.filter((_, j) => j !== i))}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                  <Box sx={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 0.5, gridColumn: "1 / -1" }}>
                    <Select size="small" value={f.op} onChange={(e) => setFilter(i, { op: e.target.value })} aria-label="Filter comparison">
                      {FILTER_OPS.map((o) => (
                        <MenuItem key={o.value} value={o.value}>
                          {o.label}
                        </MenuItem>
                      ))}
                    </Select>
                    <TextField size="small" value={f.value} onChange={(e) => setFilter(i, { value: e.target.value })} inputProps={{ "aria-label": "Filter value" }} />
                  </Box>
                </Box>
              ))}
              <Button size="small" startIcon={<AddIcon />} onClick={() => setFilters((x) => [...x, { field: "", op: "contains", value: "" }])} disabled={objects.length === 0}>
                Add a filter
              </Button>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Summary tiles
              </Typography>
              {tileOptions.map((t) => (
                <FormControlLabel
                  key={t.key}
                  sx={{ display: "flex", mr: 0 }}
                  control={<Checkbox size="small" checked={tiles.includes(t.key)} onChange={() => toggleTile(t.key)} />}
                  label={<Typography variant="body2">{t.label}</Typography>}
                />
              ))}
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Sort
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 104px", gap: 0.5 }}>
                <Select size="small" displayEmpty value={sort?.field || ""} onChange={(e) => setSort(e.target.value ? { field: e.target.value, dir: sort?.dir || "desc" } : null)} aria-label="Sort by">
                  <MenuItem value="">Default order</MenuItem>
                  {columnFields.map((f) => (
                    <MenuItem key={f.key} value={f.key}>
                      {f.label}
                    </MenuItem>
                  ))}
                </Select>
                <Select size="small" disabled={!sort} value={sort?.dir || "desc"} onChange={(e) => setSort({ ...sort, dir: e.target.value })} aria-label="Sort direction">
                  <MenuItem value="desc">High to low</MenuItem>
                  <MenuItem value="asc">Low to high</MenuItem>
                </Select>
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Highlight rows in red when
              </Typography>
              {highlight ? (
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 0.5 }}>
                  <Select size="small" displayEmpty value={highlight.field} onChange={(e) => setHighlight({ ...highlight, field: e.target.value, op: "is", value: "" })} aria-label="Highlight field">
                    <MenuItem value="">Choose a field</MenuItem>
                    {columnFields.map((f) => (
                      <MenuItem key={f.key} value={f.key}>
                        {f.label}
                      </MenuItem>
                    ))}
                  </Select>
                  <IconButton size="small" aria-label="Remove highlight" onClick={() => setHighlight(null)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                  <Box sx={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 0.5, gridColumn: "1 / -1" }}>
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
              <FormControlLabel sx={{ display: "flex", mr: 0, mt: 0.5 }} control={<Checkbox size="small" checked={totals} onChange={(e) => setTotals(e.target.checked)} />} label={<Typography variant="body2">Show a totals row</Typography>} />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
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
                      <Checkbox
                        size="small"
                        checked={audienceRoles.includes(r)}
                        onChange={() => setAudienceRoles((x) => (x.includes(r) ? x.filter((v) => v !== r) : [...x, r]))}
                      />
                    }
                    label={r}
                  />
                ))}
              <Typography variant="caption" color="text.secondary">
                Someone without access to every part of the canvas cannot see or run the report.
              </Typography>
            </Box>
            <TextField size="small" label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} inputProps={{ maxLength: 300 }} />
          </Stack>
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ mt: 2 }}>
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
            Add at least two things and tick the fields you want. The result appears here.
          </Typography>
        )}
        {preview && preview.tiles && preview.tiles.length > 0 && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", p: 1.5 }}>
            {preview.tiles.map((t, i) => (
              <Paper key={i} variant="outlined" sx={{ px: 1.5, py: 0.5, flex: "1 1 130px", minWidth: 110, maxWidth: 220 }}>
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
        {preview && <ReportResultTable result={preview} stickyTop={BUILDER_STICKY_TOP} />}
      </Paper>
    </BuilderShell>
  );
}
