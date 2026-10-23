import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "../patientHeader/headerApi";
import { FOLLOW_UP_COLUMNS, describeCriteria, filterRows, formatLos, ruleColors } from "./edBoardColumns";
import { cellText, sortRows } from "./edBoardTable";

const REFRESH_MS = 60000;
export const WINDOWS = [1, 3, 7, 14, 30];
const ESI_COLORS = { 1: "#d32f2f", 2: "#f57c00", 3: "#fdd835", 4: "#81c784", 5: "#90caf9" };
const FLAGGED_ROW = "#fff8ec";

/** "35 min ago", "21 h ago", "3 d ago". */
export const agoText = (iso, now = Date.now()) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} d ago`;
};

const dayText = (n) => (n === 1 ? "24 hours" : `${n} days`);

/**
 * The ED Follow-up board: ED visits that have ended, newest first, with when each patient was discharged
 * and a flag when lab results arrived afterwards that nobody has reviewed. It reads like the ED Board
 * (same View list, columns and color rules) but is for looking at, not editing: a discharged visit is closed.
 * `previewData` / `previewView` draw it for the Status Board Builder's preview.
 */
export default function EDFollowUpBoard({
  currentUserId = null,
  refreshKey = 0,
  previewData = null,
  previewView = null,
  selectedUserId = null,
  onSelectPatient,
  onOpenPatient,
  onNeedsReview,
}) {
  const [fetched, setData] = useState(null);
  const preview = !!previewData;
  const data = previewData || fetched;
  const [unit, setUnit] = useState("");
  const [pickedView, setPickedView] = useState(null);
  const [pickedDays, setPickedDays] = useState(null);
  const [chip, setChip] = useState("all"); // "all" | "review"
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(null);
  const [problem, setProblem] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const views = useMemo(() => data?.views || [], [data]);
  const viewKey = pickedView && views.some((v) => v.key === pickedView) ? pickedView : data?.default_view && views.some((v) => v.key === data.default_view) ? data.default_view : views[0]?.key;
  const activeView = previewView || views.find((v) => v.key === viewKey) || views[0] || null;
  const days = pickedDays ?? activeView?.follow_up?.days ?? 7;

  const load = useCallback(async () => {
    if (preview) return;
    try {
      const headers = await authHeader();
      const params = { days, ...(unit ? { unit } : {}) };
      const res = await api.get(apiEndpoints.edBoardFollowUp, { headers, params });
      setData(res.data);
      setProblem("");
      if (!unit && res.data.unit) setUnit(res.data.unit);
      if (onNeedsReview) onNeedsReview(res.data.needs_review || 0);
    } catch (err) {
      setProblem(errorText(err, "Could not load the ED follow-up board."));
    }
  }, [unit, days, preview, onNeedsReview]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (preview) return undefined;
    const id = setInterval(() => {
      setNow(Date.now());
      load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load, preview]);

  const columns = useMemo(() => {
    const cols = (activeView?.columns || [...FOLLOW_UP_COLUMNS, { key: "patient", label: "Patient", width: 170 }]).filter((c) => c.visible !== false && c.key !== "actions");
    return cols;
  }, [activeView]);
  const rules = activeView?.rules || [];
  const statuses = useMemo(() => data?.statuses || [], [data]);
  const overdue = data?.config?.vitals_overdue_minutes ?? 60;
  const ctx = useMemo(() => ({ now, statuses, limit: overdue }), [now, statuses, overdue]);

  const inView = useMemo(() => filterRows(data?.rows || [], "all", currentUserId, [], activeView?.criteria, true), [data, currentUserId, activeView]);
  const flagged = inView.filter((r) => r.visit.new_results?.state === "new").length;
  const shown = useMemo(() => {
    let list = inView;
    if (chip === "review") list = list.filter((r) => r.visit.new_results?.state === "new");
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.visit.name.toLowerCase().includes(q));
    return sortRows(list, columns.find((c) => c.key === sort?.key), sort?.dir, ctx);
  }, [inView, chip, search, sort, columns, ctx]);

  const criteriaText = describeCriteria(activeView?.criteria, { statuses, doctors: data?.staff?.doctors, nurses: data?.staff?.nurses });
  const toggleSort = (key) => setSort((cur) => (!cur || cur.key !== key ? { key, dir: "asc" } : cur.dir === "asc" ? { key, dir: "desc" } : null));

  const patientLike = (row) => {
    const v = row.visit;
    return {
      id: v.patient,
      user_id: v.user_id,
      full_name: v.name,
      current_visit: { id: v.registration, visit_number: v.visit_number, care_setting: "emergency", location: "", discharge_datetime: v.discharged_at },
    };
  };
  const rowClicked = (e, row) => {
    if (e.target.closest("button, a, input")) return;
    if (onSelectPatient) onSelectPatient(patientLike(row));
  };

  const cell = (col, row) => {
    const v = row.visit;
    switch (col.key) {
      case "patient":
        return (
          <Typography
            variant="body2"
            sx={{ fontWeight: 700, cursor: onOpenPatient ? "pointer" : "default", textDecoration: onOpenPatient ? "underline" : "none" }}
            onClick={() => onOpenPatient && onOpenPatient(patientLike(row), "orders")}
          >
            {v.name}
          </Typography>
        );
      case "discharged":
        return v.discharged_at ? (
          <Box data-testid={`discharged-${v.registration}`}>
            <Box>{new Date(v.discharged_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Box>
            <Box sx={{ fontSize: "0.7rem", color: "text.secondary" }}>{agoText(v.discharged_at, now)}</Box>
          </Box>
        ) : (
          ""
        );
      case "new_results": {
        const r = v.new_results;
        if (!r || r.state === "none") return <span style={{ color: "#98a2b3" }}>&mdash;</span>;
        if (r.state === "reviewed") return <span style={{ color: "#6b7686", fontSize: "0.8rem" }} data-testid={`new-results-${v.registration}`}>✓ Reviewed</span>;
        return (
          <Box data-testid={`new-results-${v.registration}`}>
            <Chip size="small" color="error" variant="filled" label={`${r.count} new`} sx={{ fontWeight: 700, height: 22 }} />
            <Tooltip title={r.tests.join(", ")}>
              <Box sx={{ fontSize: "0.7rem", color: "text.secondary", mt: 0.25, overflow: "hidden", textOverflow: "ellipsis" }}>{r.tests.join(", ")}</Box>
            </Tooltip>
          </Box>
        );
      }
      case "esi":
        return v.esi != null ? (
          <Box component="span" sx={{ display: "inline-flex", width: 24, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 0.5, fontWeight: 700, fontSize: "0.8rem", bgcolor: ESI_COLORS[v.esi], color: v.esi <= 2 ? "#fff" : "#1f2937" }}>
            {v.esi}
          </Box>
        ) : (
          ""
        );
      case "los":
        return v.discharged_at && v.arrival_time ? formatLos(Math.max(0, Math.floor((new Date(v.discharged_at) - new Date(v.arrival_time)) / 60000))) : "";
      default:
        return cellText(col, row, ctx);
    }
  };

  if (!data && !problem) return <CircularProgress aria-label="Loading ED follow-up board" sx={{ m: 3 }} />;
  const noDepartments = data && (data.departments || []).length === 0;
  const total = data?.rows?.length || 0;
  const widthOf = (c) => Math.max(50, c.width || 100);
  const tableWidth = columns.reduce((sum, c) => sum + widthOf(c), 0) + 90;

  let empty = "";
  if (shown.length === 0) {
    if (total === 0) empty = `No ED discharges in the last ${dayText(days)}.`;
    else if (inView.length === 0) empty = "Nobody discharged matches this view's conditions.";
    else if (chip === "review" && !search.trim()) empty = "Nothing needs review.";
    else empty = "Nobody matches your search.";
  }

  return (
    <Box sx={{ p: 1.5 }} data-testid="ed-follow-up">
      {!preview && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="fu-dept">Department</InputLabel>
            <Select labelId="fu-dept" label="Department" value={unit || data?.unit || ""} onChange={(e) => setUnit(e.target.value)} inputProps={{ "data-testid": "fu-department" }}>
              {(data?.departments || []).map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel id="fu-view">View</InputLabel>
            <Select
              labelId="fu-view"
              label="View"
              value={viewKey || ""}
              onChange={(e) => {
                setPickedView(e.target.value);
                setPickedDays(null);
              }}
              inputProps={{ "data-testid": "fu-view" }}
            >
              {views.map((v) => (
                <MenuItem key={v.key} value={v.key}>
                  {v.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="fu-days">Discharged in the last</InputLabel>
            <Select labelId="fu-days" label="Discharged in the last" value={days} onChange={(e) => setPickedDays(Number(e.target.value))} inputProps={{ "data-testid": "fu-days" }}>
              {WINDOWS.map((n) => (
                <MenuItem key={n} value={n}>
                  {dayText(n)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Chip
            clickable
            onClick={() => setChip("review")}
            color={chip === "review" ? "error" : "default"}
            variant={chip === "review" ? "filled" : "outlined"}
            label={`Needs review ${flagged}`}
            data-testid="chip-review"
            aria-pressed={chip === "review"}
          />
          <Chip
            clickable
            onClick={() => setChip("all")}
            color={chip === "all" ? "primary" : "default"}
            variant={chip === "all" ? "filled" : "outlined"}
            label={`All discharged ${inView.length}`}
            data-testid="chip-all"
            aria-pressed={chip === "all"}
          />
          {criteriaText && <Chip size="small" sx={{ bgcolor: "#f1ecff", color: "#4c1d95", fontWeight: 500 }} label={`Showing: ${criteriaText}`} data-testid="criteria-chip" />}
          <Box sx={{ flexGrow: 1 }} />
          <TextField
            size="small"
            placeholder="Search patient"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            inputProps={{ "aria-label": "Search patient", "data-testid": "fu-search" }}
            sx={{ width: 220 }}
          />
        </Box>
      )}

      {problem && <Alert severity="error" sx={{ mb: 1 }}>{problem}</Alert>}
      {noDepartments && (
        <Typography color="text.secondary" data-testid="no-ed-departments">
          There are no emergency departments yet. An admin can add a unit of type Emergency in the Location Manager.
        </Typography>
      )}

      {data && !noDepartments && (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" stickyHeader sx={{ tableLayout: "fixed", width: tableWidth }}>
              <TableHead>
                <TableRow>
                  {columns.map((c) => {
                    const sorted = sort?.key === c.key;
                    return (
                      <TableCell key={c.key} aria-sort={sorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} sx={{ fontWeight: 700, bgcolor: "#b0bec5", width: widthOf(c), whiteSpace: "nowrap", px: 1 }}>
                        <TableSortLabel active={sorted} direction={sorted ? sort.dir : "asc"} onClick={() => toggleSort(c.key)} data-testid={`fu-sort-${c.key}`} aria-label={`Sort by ${c.label || c.key}`}>
                          {c.label}
                        </TableSortLabel>
                      </TableCell>
                    );
                  })}
                  <TableCell sx={{ bgcolor: "#b0bec5", width: 90 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {empty && (
                  <TableRow>
                    <TableCell colSpan={columns.length + 1} sx={{ textAlign: "center", py: 3 }} data-testid="fu-empty">
                      {empty}
                      {total === 0 && days < 30 && (
                        <Box sx={{ mt: 1 }}>
                          <Button size="small" onClick={() => setPickedDays(30)}>
                            Show 30 days
                          </Button>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {shown.map((row, i) => {
                  const v = row.visit;
                  const isNew = v.new_results?.state === "new";
                  const colors = ruleColors(rules, v, now, overdue);
                  const selected = selectedUserId != null && String(v.user_id) === String(selectedUserId);
                  const clickable = !!onSelectPatient;
                  const bg = colors.row || (isNew ? FLAGGED_ROW : i % 2 ? "#eef1f5" : "#ffffff");
                  return (
                    <TableRow
                      key={v.registration}
                      data-testid={`fu-row-${v.registration}`}
                      hover={clickable}
                      selected={selected}
                      onClick={clickable ? (e) => rowClicked(e, row) : undefined}
                      sx={{ bgcolor: bg, cursor: clickable ? "pointer" : "default", boxShadow: isNew ? "inset 4px 0 0 #f59e0b" : "none", outline: selected ? "2px solid #2563eb" : "none", outlineOffset: "-2px" }}
                    >
                      {columns.map((c) => (
                        <TableCell key={c.key} sx={{ py: 0.5, px: 1, bgcolor: colors.cells[c.key], fontSize: "0.85rem", width: widthOf(c), overflow: "hidden", textOverflow: "ellipsis" }} data-testid={`fu-cell-${c.key}-${v.registration}`}>
                          {cell(c, row)}
                        </TableCell>
                      ))}
                      <TableCell sx={{ py: 0.5, px: 1 }}>
                        {onOpenPatient && (
                          <Button size="small" onClick={() => onOpenPatient(patientLike(row), "results")} aria-label={`Open results for ${v.name}`} data-testid={`fu-results-${v.registration}`}>
                            Results →
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {!preview && total > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }} data-testid="fu-footer">
              Showing {shown.length} of {inView.length} discharged patient{inView.length === 1 ? "" : "s"} from the last {dayText(days)}. Discharged visits are closed, so they are read-only here.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
