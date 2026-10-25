import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import axios from "axios";
import moment from "moment";
import { apiEndpoints, getAuthHeaders } from "../../config/api";
import { getAccessToken } from "../../utils/tokenManager";

export const LABOR_PAGE_SIZE = 12;

const rangeFor = (preset) => {
  const unit = preset === "month" ? "month" : "week";
  return { start: moment().startOf(unit).format("YYYY-MM-DD"), end: moment().endOf(unit).format("YYYY-MM-DD") };
};

/** Scheduled hours per person for a date range: 12 rows a page, page controls pinned to the bottom. */
export default function LaborHoursTable() {
  const [preset, setPreset] = useState("week");
  const [range, setRange] = useState(rangeFor("week"));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "total_hours", dir: "desc" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(apiEndpoints.staffingReportLaborHours, {
        headers: getAuthHeaders(getAccessToken()),
        params: { start: range.start, end: range.end },
      });
      setRows(res.data.rows || []);
      setPage(0);
    } catch (err) {
      setError(err.response?.data?.error || "Could not load labor hours.");
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => `${r.full_name || ""} ${r.profession || ""}`.toLowerCase().includes(q))
      : rows;
    const numeric = sort.key === "shift_count" || sort.key === "total_hours";
    const val = (r) => (numeric ? Number(r[sort.key] || 0) : String(r[sort.key] || "").toLowerCase());
    const out = [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const cmp = x < y ? -1 : x > y ? 1 : 0;
      return (sort.dir === "asc" ? cmp : -cmp) || String(a.full_name || "").localeCompare(String(b.full_name || ""));
    });
    return out;
  }, [rows, search, sort]);
  const total = sorted.reduce((n, r) => n + Number(r.total_hours || 0), 0);
  const max = rows.reduce((m, r) => Math.max(m, Number(r.total_hours || 0)), 0);
  const toggleSort = (key) => {
    setPage(0);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "full_name" || key === "profession" ? "asc" : "desc" }));
  };
  const head = (key, label, align) => (
    <TableCell align={align} sortDirection={sort.key === key ? sort.dir : false} sx={key === "total_hours" ? { minWidth: 220 } : undefined}>
      <TableSortLabel active={sort.key === key} direction={sort.key === key ? sort.dir : "asc"} onClick={() => toggleSort(key)}>
        {label}
      </TableSortLabel>
    </TableCell>
  );
  const last = Math.max(0, Math.ceil(sorted.length / LABOR_PAGE_SIZE) - 1);
  const safePage = Math.min(page, last);
  const shown = sorted.slice(safePage * LABOR_PAGE_SIZE, safePage * LABOR_PAGE_SIZE + LABOR_PAGE_SIZE);

  const pickPreset = (v) => {
    if (!v) return;
    setPreset(v);
    if (v !== "custom") setRange(rangeFor(v));
  };

  return (
    <Box data-testid="labor-hours-table">
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <ToggleButtonGroup size="small" exclusive color="primary" value={preset} onChange={(e, v) => pickPreset(v)} aria-label="Date range">
          <ToggleButton value="week">This week</ToggleButton>
          <ToggleButton value="month">This month</ToggleButton>
          <ToggleButton value="custom">Custom</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          type="search"
          label="Search staff or profession"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 230 }}
        />
        <TextField
          size="small"
          type="date"
          label="From"
          value={range.start}
          onChange={(e) => {
            setPreset("custom");
            setRange((r) => ({ ...r, start: e.target.value }));
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={range.end}
          onChange={(e) => {
            setPreset("custom");
            setRange((r) => ({ ...r, end: e.target.value }));
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
          {sorted.length} {sorted.length === 1 ? "person" : "people"} · {total.toFixed(1)} scheduled hours
        </Typography>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : sorted.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography color="text.secondary">
            {rows.length ? "No one matches your search." : "No scheduled hours in this date range."}
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          <TableContainer>
            <Table size="small" aria-label="Labor hours">
              <TableHead>
                <TableRow>
                  {head("full_name", "Staff")}
                  {head("profession", "Profession")}
                  {head("shift_count", "Shifts", "right")}
                  {head("total_hours", "Total hours")}
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((r) => {
                  const hrs = Number(r.total_hours || 0);
                  return (
                    <TableRow key={r.staff_id} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{r.full_name}</TableCell>
                      <TableCell>{r.profession}</TableCell>
                      <TableCell align="right">{r.shift_count}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Box sx={{ width: 52, textAlign: "right" }}>{hrs.toFixed(1)}</Box>
                          <LinearProgress variant="determinate" value={max > 0 ? Math.round((hrs / max) * 100) : 0} sx={{ flex: 1, height: 8, borderRadius: 4 }} />
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {/* Page controls stay pinned to the bottom of the screen while you scroll. */}
          <Box sx={{ position: "sticky", bottom: 0, zIndex: 2, bgcolor: "background.paper", borderTop: "1px solid", borderColor: "divider" }}>
            <TablePagination
              component="div"
              count={sorted.length}
              page={safePage}
              onPageChange={(e, p) => setPage(p)}
              rowsPerPage={LABOR_PAGE_SIZE}
              rowsPerPageOptions={[]}
              sx={{ borderBottom: 0 }}
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
}
