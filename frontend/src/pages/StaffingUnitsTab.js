import { useState, useEffect, useCallback, useMemo } from "react";
import {
  alpha,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faEllipsis,
  faMagnifyingGlass,
  faMinus,
  faPlus,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import { toISO } from "./staffingCoverage";

// ---------- helpers ----------

const HISTORY_PAGE_SIZE = 14;
const CARRY_FORWARD_DAYS = 7; // matches the backend: last 7 days are used when a day has no census

const listOf = (res) => res.data.results || res.data || [];

const parseISO = (s) => {
  const [y, m, d] = (s || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000);
const fmtShort = (iso) =>
  iso ? parseISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const fmtLong = (iso) =>
  iso
    ? parseISO(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })
    : "";
const fmtDate = (iso) =>
  iso ? parseISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const fmtWeekday = (iso) => (iso ? parseISO(iso).toLocaleDateString("en-US", { weekday: "long" }) : "");
const fmtStamp = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

function formatApiError(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  if (data.error) return data.error;
  if (typeof data === "object") {
    const parts = Object.entries(data).map(
      ([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(" ") : v}`
    );
    if (parts.length) return parts.join(" ");
  }
  return fallback;
}

const errText = (err, fallback) => formatApiError(err.response?.data, err.message || fallback);

const shiftWords = (pattern) => (pattern === "12h" ? "12 hour" : "8 hour");
const shiftNames = (pattern) => (pattern === "12h" ? "Day, Night" : "Day, Evening, Night");

const IDLE_UNIT_FORM = { id: null, name: "", bed_capacity: "", shift_pattern: "8h", is_active: true };

// ---------- small pieces ----------

function ShiftLengthChip({ pattern }) {
  return (
    <Chip
      size="small"
      label={shiftWords(pattern)}
      sx={{ fontWeight: 600, bgcolor: alpha("#3730a3", 0.12), color: "#3730a3" }}
    />
  );
}

function StatusChip({ tone, label }) {
  const colors = {
    saved: ["success", "success.dark"],
    unsaved: ["primary", "primary.dark"],
    none: ["warning", "warning.dark"],
    over: ["error", "error.dark"],
    inactive: ["grey", "text.secondary"],
  };
  const [paletteKey, text] = colors[tone] || colors.saved;
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        fontWeight: 600,
        color: text,
        bgcolor: (th) =>
          paletteKey === "grey" ? th.palette.grey[200] : alpha(th.palette[paletteKey].main, 0.14),
      }}
    />
  );
}

function SummaryTile({ label, value, hint, warn }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        flex: "1 1 200px",
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        ...(warn && {
          borderColor: "warning.main",
          bgcolor: (th) => alpha(th.palette.warning.main, 0.1),
        }),
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">
        {hint}
      </Typography>
    </Paper>
  );
}

function SearchField({ value, onChange, placeholder, label }) {
  return (
    <TextField
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      slotProps={{
        htmlInput: { "aria-label": label },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </InputAdornment>
          ),
        },
      }}
      sx={{ flex: "1 1 300px", maxWidth: 420, "& .MuiInputBase-root": { minHeight: 44 } }}
    />
  );
}

function PanelShell({ title, open, onClose, onSave, saveLabel, saving, children }) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 480 } } } }}>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2.5, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="h6" component="h3">
            {title}
          </Typography>
          <IconButton aria-label="Close panel" onClick={onClose} sx={{ width: 44, height: 44 }}>
            <FontAwesomeIcon icon={faXmark} />
          </IconButton>
        </Stack>
        <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5 }}>
          <Stack spacing={2.5}>{children}</Stack>
        </Box>
        <Stack direction="row" spacing={1.5} justifyContent="flex-end" sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider" }}>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={saving} sx={{ minHeight: 48, borderColor: "grey.400" }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={onSave} disabled={saving} sx={{ minHeight: 48, px: 3 }}>
            {saving ? "Saving..." : saveLabel}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}

function InfoBox({ title, children }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: "info.main", bgcolor: (th) => alpha(th.palette.info.main, 0.07) }}>
      {title && (
        <Typography variant="caption" sx={{ display: "block", mb: 0.75, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "info.dark" }}>
          {title}
        </Typography>
      )}
      <Typography variant="body2" sx={{ lineHeight: 1.5 }} component="div">
        {children}
      </Typography>
    </Box>
  );
}

// ---------- tab ----------

/**
 * Units + daily census.
 * - Census entry is open to every staffing role (charge nurses enter it).
 * - Creating units, editing them and switching 8h/12h is admin only (the API enforces it).
 */
function StaffingUnitsTab({ isAdmin = false }) {
  const token = getAccessToken();
  const headers = getAuthHeaders(token);
  const todayISO = toISO(new Date());

  const [units, setUnits] = useState([]);
  const [location, setLocation] = useState(null); // clinic state + the staffing rule in force
  const [history, setHistory] = useState([]); // every census entry, newest first
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null); // { ok, message }
  const [section, setSection] = useState("census");

  // census entry
  const [date, setDate] = useState(todayISO);
  const [census, setCensus] = useState({}); // unitId -> string (what is in the box)
  const [saved, setSaved] = useState({}); // unitId -> string (what the server has)
  const [savingCensus, setSavingCensus] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // history
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all"); // all | 8h | 12h
  const [page, setPage] = useState(0);
  const [histMenu, setHistMenu] = useState(null); // { anchorEl, entry }
  const [editCensus, setEditCensus] = useState(null); // {id, unit_name, date, census, notes}
  const [deleteCensus, setDeleteCensus] = useState(null);

  // units
  const [showInactive, setShowInactive] = useState(false);
  const [unitMenu, setUnitMenu] = useState(null); // { anchorEl, unit }
  const [unitForm, setUnitForm] = useState(null);
  const [unitPanelOpen, setUnitPanelOpen] = useState(false);
  const [unitErrors, setUnitErrors] = useState({});
  const [unitSaveError, setUnitSaveError] = useState("");
  const [unitSaving, setUnitSaving] = useState(false);
  const [deleteUnit, setDeleteUnit] = useState(null); // { unit }

  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");

  // ---- loading ----

  const fetchUnits = useCallback(async () => {
    const res = await axios.get(apiEndpoints.staffingUnits, { headers });
    setUnits(listOf(res));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // The clinic's state decides the rule (hours per resident per day).
  // Failing to load it only blanks the nursing-hours figures.
  const fetchLocation = useCallback(async () => {
    try {
      const res = await axios.get(apiEndpoints.staffingLocation, { headers });
      setLocation(res.data);
    } catch (err) {
      setLocation(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchCensus = useCallback(async () => {
    const res = await axios.get(apiEndpoints.staffingCensus, {
      headers,
      params: { start: date, end: date },
    });
    const map = {};
    listOf(res).forEach((c) => {
      map[c.unit] = String(c.census);
    });
    setCensus(map);
    setSaved(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, date]);

  const fetchHistory = useCallback(async () => {
    const res = await axios.get(apiEndpoints.staffingCensus, { headers });
    const rows = listOf(res).slice();
    rows.sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
    );
    setHistory(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([fetchUnits(), fetchHistory(), fetchLocation()]);
      } catch (err) {
        setStatus({ ok: false, message: errText(err, "Failed to load units.") });
      }
    })();
  }, [fetchUnits, fetchHistory, fetchLocation]);

  useEffect(() => {
    (async () => {
      try {
        await fetchCensus();
      } catch (err) {
        setStatus({ ok: false, message: errText(err, "Failed to load the census.") });
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchCensus]);

  // ---- derived ----

  const hoursPerResident = location?.rule?.hppd_min ?? null;
  const hoursFor = (n) =>
    hoursPerResident == null || n == null || Number.isNaN(Number(n))
      ? null
      : Math.round(Number(n) * Number(hoursPerResident) * 100) / 100;
  const fmtHours = (h) => (h == null ? "—" : Number.isInteger(h) ? String(h) : h.toFixed(2));
  const noRuleTip = location
    ? `No staffing rule is configured for ${location.state || "this clinic's state"}.`
    : "Clinic state rule not loaded.";

  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);
  const activeUnits = units.filter((u) => u.is_active);

  const numOf = (id) => {
    const v = census[id];
    return v === undefined || v === "" ? null : Number(v);
  };
  const dirty = activeUnits.filter(
    (u) => (census[u.id] ?? "") !== (saved[u.id] ?? "") && (census[u.id] ?? "") !== ""
  );

  // For a unit with no entry on the chosen day: the newest entry in the previous 7 days.
  const carriedFor = (unitId) =>
    history.find(
      (h) => h.unit === unitId && h.date < date && diffDays(date, h.date) <= CARRY_FORWARD_DAYS
    ) || null;
  const yesterdayFor = (unitId) => {
    const y = addDays(date, -1);
    const h = history.find((e) => e.unit === unitId && e.date === y);
    return h ? Number(h.census) : null;
  };
  const latestFor = (unitId) => history.find((h) => h.unit === unitId) || null;
  const entryCount = (unitId) => history.filter((h) => h.unit === unitId).length;

  const entered = activeUnits.filter((u) => numOf(u.id) !== null);
  const overUnits = activeUnits.filter((u) => {
    const n = numOf(u.id);
    return n !== null && u.bed_capacity != null && n > u.bed_capacity;
  });
  const totalResidents = entered.reduce((sum, u) => sum + numOf(u.id), 0);

  // ---- census actions ----

  const setUnitCensus = (id, value) => {
    setCensus((c) => ({ ...c, [id]: value }));
    setJustSaved(false);
  };

  const changeDate = (next) => {
    if (!next || next === date) return;
    if (dirty.length > 0) {
      setStatus({ ok: false, message: "Save or discard your census changes before changing the date." });
      return;
    }
    setStatus(null);
    setJustSaved(false);
    setDate(next);
  };

  const saveCensus = async () => {
    setSavingCensus(true);
    setStatus(null);
    try {
      for (const u of dirty) {
        const n = Number(census[u.id]);
        if (!Number.isInteger(n) || n < 0) {
          throw new Error(`Census for ${u.name} must be a whole number, 0 or more.`);
        }
        await axios.post(apiEndpoints.staffingCensus, { unit: u.id, date, census: n }, { headers });
      }
      await Promise.all([fetchCensus(), fetchUnits(), fetchHistory()]);
      setJustSaved(true);
    } catch (err) {
      setStatus({ ok: false, message: errText(err, "Failed to save census.") });
    } finally {
      setSavingCensus(false);
    }
  };

  // ---- history filters ----

  const filtersActive = search.trim() !== "" || unitFilter !== "all" || shiftFilter !== "all";
  const matches = useMemo(() => {
    if (!filtersActive) return history;
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return history.filter((h) => {
      const unit = unitById[h.unit];
      if (unitFilter !== "all" && String(h.unit) !== String(unitFilter)) return false;
      if (shiftFilter !== "all" && unit?.shift_pattern !== shiftFilter) return false;
      if (terms.length === 0) return true;
      const haystack = [
        h.unit_name || unit?.name,
        unit ? shiftWords(unit.shift_pattern) : "",
        h.date,
        fmtDate(h.date),
        fmtWeekday(h.date),
        String(h.census),
        h.entered_by_name,
        h.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [history, unitById, search, unitFilter, shiftFilter, filtersActive]);

  const lastPage = Math.max(0, Math.ceil(matches.length / HISTORY_PAGE_SIZE) - 1);
  const safePage = Math.min(page, lastPage);
  const pageRows = matches.slice(safePage * HISTORY_PAGE_SIZE, (safePage + 1) * HISTORY_PAGE_SIZE);

  // ---- dialogs: census entries ----

  const closeDialogs = () => {
    setEditCensus(null);
    setDeleteCensus(null);
    setDeleteUnit(null);
    setDialogError("");
    setDialogBusy(false);
  };

  const saveCensusEdit = async () => {
    const n = Number(editCensus.census);
    if (editCensus.census === "" || !Number.isInteger(n) || n < 0) {
      setDialogError("Census must be a whole number, 0 or more.");
      return;
    }
    setDialogBusy(true);
    try {
      await axios.patch(
        `${apiEndpoints.staffingCensus}${editCensus.id}/`,
        { census: n, notes: editCensus.notes || "" },
        { headers }
      );
      closeDialogs();
      setStatus({ ok: true, message: "Census entry updated." });
      await Promise.all([fetchHistory(), fetchCensus(), fetchUnits()]);
    } catch (err) {
      setDialogError(errText(err, "Failed to update the entry."));
      setDialogBusy(false);
    }
  };

  const confirmCensusDelete = async () => {
    setDialogBusy(true);
    try {
      await axios.delete(`${apiEndpoints.staffingCensus}${deleteCensus.id}/`, { headers });
      closeDialogs();
      setStatus({ ok: true, message: "Census entry deleted." });
      await Promise.all([fetchHistory(), fetchCensus(), fetchUnits()]);
    } catch (err) {
      setDialogError(errText(err, "Failed to delete the entry."));
      setDialogBusy(false);
    }
  };

  // ---- units: panel ----

  const openAddUnit = () => {
    setUnitForm({ ...IDLE_UNIT_FORM });
    setUnitErrors({});
    setUnitSaveError("");
    setUnitPanelOpen(true);
  };

  const openEditUnit = (u) => {
    setUnitForm({
      id: u.id,
      name: u.name,
      bed_capacity: u.bed_capacity ?? "",
      shift_pattern: u.shift_pattern,
      is_active: u.is_active,
    });
    setUnitErrors({});
    setUnitSaveError("");
    setUnitPanelOpen(true);
  };

  const closeUnitPanel = () => {
    if (!unitSaving) setUnitPanelOpen(false);
  };

  const setUnitField = (name, value) => {
    setUnitForm((f) => ({ ...f, [name]: value }));
    if (unitErrors[name]) setUnitErrors((e) => ({ ...e, [name]: undefined }));
  };

  const saveUnit = async () => {
    const name = (unitForm.name || "").trim();
    const errs = {};
    if (!name) errs.name = "Enter a unit name.";
    if (unitForm.bed_capacity !== "" && (!Number.isInteger(Number(unitForm.bed_capacity)) || Number(unitForm.bed_capacity) < 0)) {
      errs.bed_capacity = "Beds must be a whole number, 0 or more.";
    }
    setUnitErrors(errs);
    if (Object.keys(errs).length) return;
    setUnitSaving(true);
    setUnitSaveError("");
    const body = {
      name,
      shift_pattern: unitForm.shift_pattern,
      bed_capacity: unitForm.bed_capacity === "" ? null : Number(unitForm.bed_capacity),
    };
    try {
      if (unitForm.id) {
        await axios.patch(apiEndpoints.staffingUnitDetail(unitForm.id), { ...body, is_active: unitForm.is_active }, { headers });
        setStatus({ ok: true, message: "Unit updated." });
      } else {
        await axios.post(apiEndpoints.staffingUnits, body, { headers });
        setStatus({ ok: true, message: "Unit added." });
      }
      setUnitPanelOpen(false);
      await Promise.all([fetchUnits(), fetchHistory()]);
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object" && (data.name || data.bed_capacity)) {
        setUnitErrors({
          name: data.name ? [].concat(data.name).join(" ") : undefined,
          bed_capacity: data.bed_capacity ? [].concat(data.bed_capacity).join(" ") : undefined,
        });
      } else {
        setUnitSaveError(errText(err, "Failed to save the unit."));
      }
    } finally {
      setUnitSaving(false);
    }
  };

  const setUnitActive = async (unit, active) => {
    try {
      await axios.patch(apiEndpoints.staffingUnitDetail(unit.id), { is_active: active }, { headers });
      setStatus({ ok: true, message: `${unit.name} ${active ? "reactivated" : "deactivated"}.` });
      await fetchUnits();
      return true;
    } catch (err) {
      setStatus({ ok: false, message: errText(err, "Failed to update the unit.") });
      return false;
    }
  };

  const deactivateFromDialog = async () => {
    setDialogBusy(true);
    const ok = await setUnitActive(deleteUnit.unit, false);
    if (ok) {
      closeDialogs();
      setUnitPanelOpen(false);
    } else {
      setDialogBusy(false);
    }
  };

  const confirmUnitDelete = async () => {
    setDialogBusy(true);
    try {
      await axios.delete(apiEndpoints.staffingUnitDetail(deleteUnit.unit.id), { headers });
      closeDialogs();
      setUnitPanelOpen(false);
      setStatus({ ok: true, message: "Unit deleted." });
      await Promise.all([fetchUnits(), fetchHistory()]);
    } catch (err) {
      // The API refuses to delete a unit that has census history or coverage
      // rules, and says so; show that and leave Deactivate available.
      setDialogError(err.response?.data?.error || errText(err, "Failed to delete the unit."));
      setDialogBusy(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  const unitsShown = units
    .filter((u) => u.is_active || showInactive)
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  const inactiveCount = units.filter((u) => !u.is_active).length;
  const menuUnit = unitMenu && unitMenu.unit;
  const menuEntry = histMenu && histMenu.entry;
  const deleteUnitEntries = deleteUnit ? entryCount(deleteUnit.unit.id) : 0;

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" spacing={2} alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
          Units &amp; Census
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={section}
          onChange={(e, v) => {
            if (!v) return;
            if (dirty.length > 0 && v !== "census") {
              setStatus({ ok: false, message: "Save or discard your census changes first." });
              return;
            }
            setSection(v);
            setStatus(null);
          }}
          aria-label="Section"
        >
          <ToggleButton value="census" sx={{ minHeight: 44, px: 2.5 }}>
            Enter census
          </ToggleButton>
          <ToggleButton value="history" sx={{ minHeight: 44, px: 2.5 }}>
            History
          </ToggleButton>
          <ToggleButton value="units" sx={{ minHeight: 44, px: 2.5 }}>
            Units
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {status && (
        <Alert severity={status.ok ? "success" : "error"} sx={{ mb: 2 }} onClose={() => setStatus(null)}>
          {status.message}
        </Alert>
      )}

      {/* ---------------- ENTER CENSUS ---------------- */}
      {section === "census" && (
        <Box>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <IconButton
                aria-label="Previous day"
                onClick={() => changeDate(addDays(date, -1))}
                sx={{ width: 44, height: 44, border: 1, borderColor: "grey.400", borderRadius: 2 }}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </IconButton>
              <Typography sx={{ minWidth: 240, textAlign: "center", fontSize: 18, fontWeight: 600 }} aria-live="polite">
                {fmtLong(date)}
              </Typography>
              <IconButton
                aria-label="Next day"
                disabled={date >= todayISO}
                onClick={() => changeDate(addDays(date, 1))}
                sx={{ width: 44, height: 44, border: 1, borderColor: "grey.300", borderRadius: 2 }}
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </IconButton>
              {date === todayISO ? (
                <Chip size="small" label="Today" color="primary" variant="outlined" sx={{ fontWeight: 600 }} />
              ) : (
                <Button size="small" onClick={() => changeDate(todayISO)} sx={{ minHeight: 44 }}>
                  Back to today
                </Button>
              )}
              <TextField
                type="date"
                size="small"
                label="Pick a date"
                value={date}
                onChange={(e) => e.target.value && changeDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 170 }}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>
              Residents on each unit. HPPD staffing requirements use these numbers.
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
            <SummaryTile
              label={date === todayISO ? "Units entered today" : "Units entered"}
              value={`${entered.length} of ${activeUnits.length}`}
              hint={entered.length === activeUnits.length ? "Everything is in for this day" : `${activeUnits.length - entered.length} still to enter`}
            />
            <SummaryTile label="Residents" value={totalResidents} hint="Across the units entered" />
            <SummaryTile
              label="Nursing hours needed"
              value={hoursPerResident == null ? "—" : fmtHours(hoursFor(totalResidents))}
              hint={hoursPerResident == null ? noRuleTip : `Residents x ${hoursPerResident} hours (${location.state_name || location.state} rule)`}
            />
            <SummaryTile label="Over capacity" value={overUnits.length} hint="Census higher than beds" warn={overUnits.length > 0} />
          </Stack>

          {activeUnits.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
              <Typography color="text.secondary">
                {isAdmin
                  ? "No units yet. Add your first unit on the Units section."
                  : "No units have been set up yet. Ask an admin to add them."}
              </Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table sx={{ minWidth: 960 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 2.5 }}>Unit</TableCell>
                    <TableCell>Beds</TableCell>
                    <TableCell>Residents</TableCell>
                    <TableCell>Occupancy</TableCell>
                    <TableCell>Since yesterday</TableCell>
                    <TableCell>Nursing hours needed</TableCell>
                    <TableCell sx={{ pr: 2.5 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeUnits.map((u) => {
                    const n = numOf(u.id);
                    const beds = u.bed_capacity;
                    const isOver = n !== null && beds != null && n > beds;
                    const changed = (census[u.id] ?? "") !== (saved[u.id] ?? "") && (census[u.id] ?? "") !== "";
                    const occ = n !== null && beds ? Math.round((n / beds) * 100) : null;
                    const yest = yesterdayFor(u.id);
                    const carried = n === null ? carriedFor(u.id) : null;
                    let tone = "saved";
                    let label = "Saved";
                    if (n === null) {
                      tone = "none";
                      label = "Not entered";
                    } else if (isOver) {
                      tone = "over";
                      label = "Over capacity";
                    } else if (changed) {
                      tone = "unsaved";
                      label = "Unsaved change";
                    }
                    let delta = "—";
                    if (n !== null && yest !== null) {
                      const d = n - yest;
                      delta = d === 0 ? "No change" : `${d > 0 ? "+" : "−"}${Math.abs(d)} (was ${yest})`;
                    } else if (n !== null) {
                      delta = "No entry yesterday";
                    }
                    return (
                      <TableRow key={u.id} sx={{ "& td": { verticalAlign: "top" } }}>
                        <TableCell sx={{ pl: 2.5, pt: 2 }}>
                          <Typography sx={{ fontWeight: 500 }}>{u.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {shiftWords(u.shift_pattern)} shifts
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ pt: 3, fontFamily: "monospace" }}>{beds ?? "—"}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <IconButton
                              aria-label={`One fewer resident on ${u.name}`}
                              onClick={() => setUnitCensus(u.id, String(Math.max(0, (n || 0) - 1)))}
                              sx={{ width: 44, height: 44, border: 1, borderColor: "grey.400", borderRadius: 2 }}
                            >
                              <FontAwesomeIcon icon={faMinus} />
                            </IconButton>
                            <TextField
                              type="number"
                              size="small"
                              value={census[u.id] ?? ""}
                              onChange={(e) => setUnitCensus(u.id, e.target.value)}
                              error={isOver}
                              slotProps={{
                                htmlInput: {
                                  min: 0,
                                  step: 1,
                                  "aria-label": `Residents on ${u.name}`,
                                  style: { textAlign: "center", fontSize: 18, fontWeight: 600 },
                                },
                              }}
                              sx={{
                                width: 88,
                                "& .MuiInputBase-root": { minHeight: 44 },
                                ...(changed && !isOver && { "& fieldset": { borderColor: "primary.main", borderWidth: 2 } }),
                              }}
                            />
                            <IconButton
                              aria-label={`One more resident on ${u.name}`}
                              onClick={() => setUnitCensus(u.id, String((n || 0) + 1))}
                              sx={{ width: 44, height: 44, border: 1, borderColor: "grey.400", borderRadius: 2 }}
                            >
                              <FontAwesomeIcon icon={faPlus} />
                            </IconButton>
                          </Stack>
                          {carried && (
                            <Typography variant="body2" sx={{ mt: 1, maxWidth: 240, color: "warning.dark" }}>
                              Not entered. Compliance is using {carried.census} from {fmtShort(carried.date)} until you enter this day's number.
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ pt: 2.5, minWidth: 130 }}>
                          {occ === null ? (
                            <Typography color="text.secondary">{"—"}</Typography>
                          ) : (
                            <>
                              <Typography sx={{ fontWeight: 500 }}>{occ}%</Typography>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(occ, 100)}
                                color={isOver ? "error" : "primary"}
                                sx={{ mt: 0.75, width: 100, height: 6, borderRadius: 3 }}
                                aria-label={`${u.name} occupancy`}
                              />
                            </>
                          )}
                        </TableCell>
                        <TableCell sx={{ pt: 3, color: "text.secondary" }}>{delta}</TableCell>
                        <TableCell sx={{ pt: 3, fontFamily: "monospace" }}>
                          {hoursPerResident == null ? "—" : n === null ? "—" : fmtHours(hoursFor(n))}
                        </TableCell>
                        <TableCell sx={{ pr: 2.5, pt: 2.5 }}>
                          <StatusChip tone={tone} label={label} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, maxWidth: 760 }}>
            If a day has no census entered, the most recent entry from the last {CARRY_FORWARD_DAYS} days is used and flagged on
            the compliance report.
          </Typography>

          {/* Sticky save bar */}
          <Paper
            square
            elevation={0}
            sx={{
              position: "sticky",
              bottom: 0,
              mt: 3,
              px: 3,
              py: 1.75,
              borderTop: 1,
              borderColor: "divider",
              display: "flex",
              flexWrap: "wrap",
              gap: 1.5,
              alignItems: "center",
              justifyContent: "space-between",
              zIndex: 2,
            }}
          >
            <Typography
              role="status"
              sx={{
                fontWeight: dirty.length > 0 || justSaved ? 600 : 400,
                color: dirty.length > 0 ? "primary.dark" : justSaved ? "success.dark" : "text.secondary",
              }}
            >
              {dirty.length > 0
                ? `${dirty.length} ${dirty.length === 1 ? "unit" : "units"} changed. Not saved yet.`
                : justSaved
                ? `Census saved for ${fmtShort(date)}.`
                : "No changes to save."}
            </Typography>
            <Stack direction="row" spacing={1.5}>
              <Button
                variant="outlined"
                color="inherit"
                disabled={dirty.length === 0 || savingCensus}
                onClick={() => setCensus({ ...saved })}
                sx={{ minHeight: 48, borderColor: "grey.400" }}
              >
                Discard changes
              </Button>
              <Button variant="contained" disabled={dirty.length === 0 || savingCensus} onClick={saveCensus} sx={{ minHeight: 48, px: 3 }}>
                {savingCensus ? "Saving..." : `Save census${dirty.length ? ` (${dirty.length})` : ""}`}
              </Button>
            </Stack>
          </Paper>
        </Box>
      )}

      {/* ---------------- HISTORY ---------------- */}
      {section === "history" && (
        <Box>
          <InfoBox>
            Every census entry on file.{" "}
            {hoursPerResident != null ? (
              <>
                Nursing hours use the {location.state_name || location.state} rule: <strong>{hoursPerResident} nursing hours per resident per day</strong>.{" "}
              </>
            ) : (
              <>{noRuleTip} </>
            )}
            Fix a wrong number with Edit; it updates compliance for that day.
          </InfoBox>

          <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{ my: 2 }}>
            <SearchField
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search unit, date, number or who entered"
              label="Search census history"
            />
            <TextField
              select
              size="small"
              label="Unit"
              value={unitFilter}
              onChange={(e) => {
                setUnitFilter(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="all">All units</MenuItem>
              {units.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Shift length"
              value={shiftFilter}
              onChange={(e) => {
                setShiftFilter(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="8h">8 hour</MenuItem>
              <MenuItem value="12h">12 hour</MenuItem>
            </TextField>
            <Typography variant="body2" color="text.secondary">
              Showing {matches.length} of {history.length}
            </Typography>
            {filtersActive && (
              <Button
                size="small"
                onClick={() => {
                  setSearch("");
                  setUnitFilter("all");
                  setShiftFilter("all");
                  setPage(0);
                }}
              >
                Clear filters
              </Button>
            )}
          </Stack>

          <TableContainer component={Paper} variant="outlined">
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ pl: 2.5 }}>Date</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell>Census</TableCell>
                  <TableCell>
                    {hoursPerResident != null ? "Nursing hours" : <span title={noRuleTip}>Nursing hours</span>}
                  </TableCell>
                  <TableCell>Entered by</TableCell>
                  <TableCell align="right" sx={{ pr: 2.5 }}>
                    <Box component="span" sx={{ position: "absolute", left: -9999 }}>
                      Actions
                    </Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        {history.length === 0 ? "No census entries yet." : "No census entries match your search."}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {pageRows.map((h) => {
                  const unit = unitById[h.unit];
                  return (
                    <TableRow key={h.id} hover>
                      <TableCell sx={{ pl: 2.5 }}>
                        <Typography sx={{ fontWeight: 500 }}>{fmtDate(h.date)}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {fmtWeekday(h.date)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography>{h.unit_name || unit?.name || "—"}</Typography>
                        {unit && (
                          <Typography variant="body2" color="text.secondary">
                            {shiftWords(unit.shift_pattern)} shifts
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: 15 }}>{h.census}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>
                        {hoursPerResident == null ? "—" : fmtHours(hoursFor(h.census))}
                      </TableCell>
                      <TableCell>
                        <Typography>{h.entered_by_name || "—"}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {fmtStamp(h.updated_at || h.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 2.5, whiteSpace: "nowrap" }}>
                        <Button
                          variant="outlined"
                          color="inherit"
                          onClick={() => {
                            setDialogError("");
                            setEditCensus({
                              id: h.id,
                              unit_name: h.unit_name || unit?.name,
                              date: h.date,
                              census: String(h.census),
                              notes: h.notes || "",
                            });
                          }}
                          sx={{ minHeight: 44, borderColor: "grey.400" }}
                        >
                          Edit
                        </Button>
                        <IconButton
                          aria-label={`More actions for ${h.unit_name || unit?.name || "unit"} on ${fmtDate(h.date)}`}
                          aria-haspopup="menu"
                          onClick={(e) => setHistMenu({ anchorEl: e.currentTarget, entry: h })}
                          sx={{ ml: 0.75, width: 44, height: 44 }}
                        >
                          <FontAwesomeIcon icon={faEllipsis} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {matches.length > HISTORY_PAGE_SIZE && (
            <TablePagination
              component="div"
              count={matches.length}
              page={safePage}
              onPageChange={(e, p) => setPage(p)}
              rowsPerPage={HISTORY_PAGE_SIZE}
              rowsPerPageOptions={[]}
            />
          )}
        </Box>
      )}

      {/* ---------------- UNITS ---------------- */}
      {section === "units" && (
        <Box>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 640 }}>
              8 hour units work Day, Evening and Night shifts. 12 hour units work Day and Night. This sets how many staff HPPD
              requires per shift.
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Stack direction="row" spacing={1} alignItems="center">
                <Switch
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  slotProps={{ input: { "aria-label": "Show inactive units" } }}
                />
                <Typography variant="body2">Show inactive units ({inactiveCount})</Typography>
              </Stack>
              {isAdmin && (
                <Button variant="contained" startIcon={<FontAwesomeIcon icon={faPlus} />} onClick={openAddUnit} sx={{ minHeight: 44, px: 2.5 }}>
                  Add unit
                </Button>
              )}
            </Stack>
          </Stack>

          <TableContainer component={Paper} variant="outlined">
            <Table sx={{ minWidth: 860 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ pl: 2.5 }}>Unit</TableCell>
                  <TableCell>Shift length</TableCell>
                  <TableCell>Beds</TableCell>
                  <TableCell>Latest census</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right" sx={{ pr: 2.5 }}>
                    <Box component="span" sx={{ position: "absolute", left: -9999 }}>
                      Actions
                    </Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unitsShown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No units yet.</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {unitsShown.map((u) => {
                  const latest = latestFor(u.id);
                  return (
                    <TableRow key={u.id} hover sx={u.is_active ? undefined : { opacity: 0.7 }}>
                      <TableCell sx={{ pl: 2.5, fontWeight: 500, fontSize: 15 }}>{u.name}</TableCell>
                      <TableCell>
                        <ShiftLengthChip pattern={u.shift_pattern} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                          {shiftNames(u.shift_pattern)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>{u.bed_capacity ?? "—"}</TableCell>
                      <TableCell>
                        {latest ? (
                          <>
                            <Typography sx={{ fontWeight: 500 }}>{latest.census} residents</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {fmtShort(latest.date)}
                            </Typography>
                          </>
                        ) : (
                          <Typography color="text.secondary">None yet</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusChip tone={u.is_active ? "saved" : "inactive"} label={u.is_active ? "Active" : "Inactive"} />
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 2.5, whiteSpace: "nowrap" }}>
                        {isAdmin && (
                          <>
                            <Button variant="outlined" color="inherit" onClick={() => openEditUnit(u)} sx={{ minHeight: 44, borderColor: "grey.400" }}>
                              Edit
                            </Button>
                            <IconButton
                              aria-label={`More actions for ${u.name}`}
                              aria-haspopup="menu"
                              onClick={(e) => setUnitMenu({ anchorEl: e.currentTarget, unit: u })}
                              sx={{ ml: 0.75, width: 44, height: 44 }}
                            >
                              <FontAwesomeIcon icon={faEllipsis} />
                            </IconButton>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ---------------- menus ---------------- */}
      <Menu anchorEl={histMenu && histMenu.anchorEl} open={!!histMenu} onClose={() => setHistMenu(null)} slotProps={{ paper: { sx: { minWidth: 200 } } }}>
        <MenuItem
          onClick={() => {
            setDialogError("");
            setDeleteCensus(menuEntry);
            setHistMenu(null);
          }}
          sx={{ minHeight: 44, color: "error.main", fontWeight: 600 }}
        >
          Delete entry
        </MenuItem>
      </Menu>

      <Menu anchorEl={unitMenu && unitMenu.anchorEl} open={!!unitMenu} onClose={() => setUnitMenu(null)} slotProps={{ paper: { sx: { minWidth: 220 } } }}>
        <MenuItem
          onClick={() => {
            const u = menuUnit;
            setUnitMenu(null);
            setUnitActive(u, !u.is_active);
          }}
          sx={{ minHeight: 44 }}
        >
          {menuUnit && menuUnit.is_active ? "Deactivate unit" : "Reactivate unit"}
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setDialogError("");
            setDeleteUnit({ unit: menuUnit });
            setUnitMenu(null);
          }}
          sx={{ minHeight: 44, color: "error.main", fontWeight: 600 }}
        >
          Delete unit
        </MenuItem>
      </Menu>

      {/* ---------------- edit census entry ---------------- */}
      <Dialog open={!!editCensus} onClose={dialogBusy ? undefined : closeDialogs} maxWidth="xs" fullWidth>
        <DialogTitle>
          Edit census entry
          {editCensus && (
            <Typography variant="body2" color="text.secondary" component="div">
              {editCensus.unit_name} on {fmtDate(editCensus.date)}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {editCensus && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {dialogError && <Alert severity="error">{dialogError}</Alert>}
              <TextField
                label="Residents"
                type="number"
                value={editCensus.census}
                onChange={(e) => setEditCensus({ ...editCensus, census: e.target.value })}
                slotProps={{ htmlInput: { min: 0, step: 1 } }}
                autoFocus
              />
              <TextField
                label="Notes (optional)"
                multiline
                minRows={2}
                value={editCensus.notes}
                onChange={(e) => setEditCensus({ ...editCensus, notes: e.target.value })}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={closeDialogs} disabled={dialogBusy} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={saveCensusEdit} disabled={dialogBusy} sx={{ minHeight: 44, px: 3 }}>
            {dialogBusy ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------------- delete census entry ---------------- */}
      <Dialog open={!!deleteCensus} onClose={dialogBusy ? undefined : closeDialogs} maxWidth="xs" fullWidth>
        <DialogTitle>Delete census entry?</DialogTitle>
        <DialogContent>
          {deleteCensus && (
            <Stack spacing={1.5}>
              {dialogError && <Alert severity="error">{dialogError}</Alert>}
              <Typography>
                This removes the census of {deleteCensus.census} for <strong>{deleteCensus.unit_name}</strong> on{" "}
                {fmtDate(deleteCensus.date)}.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Coverage for that day will use the most recent entry from the previous {CARRY_FORWARD_DAYS} days, or show as
                "No census" if there is none.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={closeDialogs} disabled={dialogBusy} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={confirmCensusDelete} disabled={dialogBusy} sx={{ minHeight: 44, px: 3 }}>
            {dialogBusy ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------------- add / edit unit panel ---------------- */}
      {unitForm && (
        <PanelShell
          title={unitForm.id ? `Edit ${unitForm.name || "unit"}` : "Add a unit"}
          open={unitPanelOpen}
          onClose={closeUnitPanel}
          onSave={saveUnit}
          saving={unitSaving}
          saveLabel={unitForm.id ? "Save changes" : "Add unit"}
        >
          {unitSaveError && <Alert severity="error">{unitSaveError}</Alert>}

          <TextField
            label="Unit name"
            fullWidth
            value={unitForm.name}
            onChange={(e) => setUnitField("name", e.target.value)}
            error={!!unitErrors.name}
            helperText={unitErrors.name}
            autoFocus
          />

          <TextField
            label="Beds"
            type="number"
            value={unitForm.bed_capacity}
            onChange={(e) => setUnitField("bed_capacity", e.target.value)}
            error={!!unitErrors.bed_capacity}
            helperText={unitErrors.bed_capacity || "Printed as the census capacity on the daily staffing reports."}
            slotProps={{ htmlInput: { min: 0 } }}
            sx={{ width: 220 }}
          />

          <Box>
            <Typography id="unit-shift-length" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Shift length
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              aria-labelledby="unit-shift-length"
              value={unitForm.shift_pattern}
              onChange={(e, v) => v && setUnitField("shift_pattern", v)}
            >
              <ToggleButton value="8h" sx={{ minHeight: 44 }}>
                8 hour
              </ToggleButton>
              <ToggleButton value="12h" sx={{ minHeight: 44 }}>
                12 hour
              </ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ mt: 1.5 }}>
              <InfoBox>
                {unitForm.shift_pattern === "12h" ? (
                  <>
                    12 hour units work <strong>Day and Night</strong> shifts (8 hour units work Day, Evening and Night).
                  </>
                ) : (
                  <>
                    8 hour units work <strong>Day, Evening and Night</strong> shifts (12 hour units work Day and Night).
                  </>
                )}{" "}
                This sets how many staff HPPD requires per shift.
              </InfoBox>
            </Box>
          </Box>

          {unitForm.id && (
            <>
              <Paper variant="outlined" sx={{ p: 2, display: "flex", gap: 2, alignItems: "center", justifyContent: "space-between" }}>
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>Active</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active units appear when entering census and when assigning schedules.
                  </Typography>
                </Box>
                <Switch
                  checked={unitForm.is_active}
                  onChange={(e) => setUnitField("is_active", e.target.checked)}
                  slotProps={{ input: { "aria-label": "Unit is active" } }}
                />
              </Paper>

              <Divider />
              <Box>
                <Typography variant="caption" sx={{ display: "block", mb: 1, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "text.secondary" }}>
                  Danger zone
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => {
                    setDialogError("");
                    setDeleteUnit({ unit: unitById[unitForm.id] || { id: unitForm.id, name: unitForm.name, is_active: unitForm.is_active } });
                  }}
                  sx={{ minHeight: 44 }}
                >
                  Delete unit...
                </Button>
              </Box>
            </>
          )}
        </PanelShell>
      )}

      {/* ---------------- delete or deactivate a unit ---------------- */}
      <Dialog open={!!deleteUnit} onClose={dialogBusy ? undefined : closeDialogs} maxWidth="xs" fullWidth>
        <DialogTitle>Delete {deleteUnit ? deleteUnit.unit.name : "unit"}?</DialogTitle>
        <DialogContent>
          {deleteUnit && (
            <Stack spacing={1.5}>
              {dialogError && <Alert severity="error">{dialogError}</Alert>}
              {deleteUnitEntries > 0 ? (
                <>
                  <Alert severity="warning" icon={<FontAwesomeIcon icon={faTriangleExclamation} />}>
                    <strong>
                      {deleteUnit.unit.name} has {deleteUnitEntries} census {deleteUnitEntries === 1 ? "entry" : "entries"} on file
                    </strong>
                    , so it can't be deleted.
                  </Alert>
                  <Typography>
                    {deleteUnit.unit.is_active
                      ? "Deactivate it instead. It stops appearing when entering census and assigning schedules, and its history stays on record. You can reactivate it any time."
                      : "It is already inactive, which keeps its history on record. You can reactivate it any time."}
                  </Typography>
                </>
              ) : (
                <>
                  <Typography>
                    Deleting <strong>{deleteUnit.unit.name}</strong> is permanent. It can only be deleted if it has no census history
                    and no coverage rules.
                  </Typography>
                  {deleteUnit.unit.is_active && (
                    <Typography variant="body2" color="text.secondary">
                      To stop using it but keep the option to come back, deactivate it instead.
                    </Typography>
                  )}
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
          <Button color="inherit" onClick={closeDialogs} disabled={dialogBusy} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button color="error" variant="outlined" onClick={confirmUnitDelete} disabled={dialogBusy || deleteUnitEntries > 0} sx={{ minHeight: 44 }}>
            Delete permanently
          </Button>
          {deleteUnit?.unit.is_active && (
            <Button variant="contained" onClick={deactivateFromDialog} disabled={dialogBusy} sx={{ minHeight: 44, px: 2.5 }}>
              Deactivate instead
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StaffingUnitsTab;
