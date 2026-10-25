import { useState, useEffect, useCallback, useMemo } from "react";
import {
  alpha,
  Alert,
  Autocomplete,
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
  Menu,
  MenuItem,
  Paper,
  Stack,
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
  faEllipsis,
  faMagnifyingGlass,
  faPlus,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import { toISO } from "./staffingCoverage";
import WhoCanBeAssigned from "../components/calendar/WhoCanBeAssigned";

// ---------- constants ----------

const DAYS = [
  { code: "mon", label: "Mon", letter: "M" },
  { code: "tue", label: "Tue", letter: "T" },
  { code: "wed", label: "Wed", letter: "W" },
  { code: "thu", label: "Thu", letter: "T" },
  { code: "fri", label: "Fri", letter: "F" },
  { code: "sat", label: "Sat", letter: "S" },
  { code: "sun", label: "Sun", letter: "S" },
];
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const WEEKENDS = ["sat", "sun"];
const ALL_DAYS = DAYS.map((d) => d.code);

const SHIFT_TYPES = [
  { value: "day", label: "Day" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "custom", label: "Custom" },
];
const SHIFT_LABEL = Object.fromEntries(SHIFT_TYPES.map((s) => [s.value, s.label]));
const SHIFT_COLOR = { day: "#1d4ed8", evening: "#0e7490", night: "#3730a3", custom: "#334155" };

// Default start/end times filled in when a shift type is picked. A unit on
// 12-hour shifts uses the 12h set (there is no evening shift in that pattern,
// so it falls back to the 8h evening times). Edit these to match the facility.
const SHIFT_PRESETS = {
  "8h": { day: ["07:00", "15:00"], evening: ["15:00", "23:00"], night: ["23:00", "07:00"] },
  "12h": { day: ["07:00", "19:00"], night: ["19:00", "07:00"] },
};

const ROWS_PER_PAGE = 14;
const ENDING_SOON_DAYS = 60;
const COUNTED_ROLES = ["rn", "lpn", "cna"];

// ---------- helpers ----------

const DAY_NAMES = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

const daysHaystack = (codes) => (codes || []).map((c) => `${c} ${DAY_NAMES[c] || ""}`).join(" ");

// Every whitespace-separated term must appear somewhere in the haystack.
const matchesTerms = (haystack, search) => {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = haystack.toLowerCase();
  return terms.every((t) => hay.includes(t));
};

const parseISO = (s) => {
  const [y, m, d] = (s || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const fmtDate = (s) =>
  s ? parseISO(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const daysUntil = (s) => Math.round((parseISO(s) - parseISO(toISO(new Date()))) / 86400000);
const hhmm = (t) => (t || "").slice(0, 5);
const minutes = (t) => {
  const [h, m] = hhmm(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const sortDays = (codes) => ALL_DAYS.filter((c) => (codes || []).includes(c));
const joinWords = (words) =>
  words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
const describeDays = (codes) => {
  const sorted = sortDays(codes);
  if (sorted.length === 7) return "every day";
  return joinWords(sorted.map((c) => DAYS.find((d) => d.code === c).label));
};

const presetFor = (unit, shiftType) => {
  const pattern = unit && unit.shift_pattern === "12h" ? "12h" : "8h";
  return SHIFT_PRESETS[pattern][shiftType] || SHIFT_PRESETS["8h"][shiftType] || null;
};

// Two shifts overlap when their time ranges do; a range that ends at or before
// its start runs overnight.
const timesOverlap = (aStart, aEnd, bStart, bEnd) => {
  const a1 = minutes(aStart);
  const a2 = minutes(aEnd) <= a1 ? minutes(aEnd) + 1440 : minutes(aEnd);
  const b1 = minutes(bStart);
  const b2 = minutes(bEnd) <= b1 ? minutes(bEnd) + 1440 : minutes(bEnd);
  return a1 < b2 && b1 < a2;
};

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

// ---------- small shared pieces ----------

function ShiftTag({ type, label }) {
  const color = SHIFT_COLOR[type] || SHIFT_COLOR.custom;
  return (
    <Chip
      size="small"
      label={label || SHIFT_LABEL[type] || type}
      sx={{ fontWeight: 600, bgcolor: alpha(color, 0.12), color }}
    />
  );
}

function DayStrip({ codes }) {
  const on = new Set(codes || []);
  return (
    <Stack direction="row" spacing={0.5} role="img" aria-label={`Works ${describeDays(codes) || "no days"}`}>
      {DAYS.map((d) => (
        <Box
          key={d.code}
          aria-hidden="true"
          sx={{
            width: 26,
            height: 26,
            borderRadius: 1,
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: on.has(d.code) ? "primary.main" : "grey.100",
            color: on.has(d.code) ? "primary.contrastText" : "text.secondary",
          }}
        >
          {d.letter}
        </Box>
      ))}
    </Stack>
  );
}

function SectionLabel({ children, id }) {
  return (
    <Typography id={id} variant="body2" color="text.secondary" sx={{ mb: 1 }}>
      {children}
    </Typography>
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

function ShiftPicker({ value, onChange }) {
  return (
    <Box>
      <SectionLabel id="shift-type-label">Shift</SectionLabel>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        color="primary"
        aria-labelledby="shift-type-label"
        value={value}
        onChange={(e, v) => v && onChange(v)}
      >
        {SHIFT_TYPES.map((s) => (
          <ToggleButton key={s.value} value={s.value} sx={{ minHeight: 44 }}>
            {s.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}

function DaysPicker({ value, onChange, error }) {
  return (
    <Box>
      <SectionLabel id="days-label">Days of the week</SectionLabel>
      <ToggleButtonGroup
        fullWidth
        size="small"
        color="primary"
        aria-labelledby="days-label"
        value={value}
        onChange={(e, v) => onChange(v)}
      >
        {DAYS.map((d) => (
          <ToggleButton key={d.code} value={d.code} sx={{ minHeight: 44, px: 0.5 }}>
            {d.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Chip clickable variant="outlined" color="primary" label="Weekdays" onClick={() => onChange(WEEKDAYS)} />
        <Chip clickable variant="outlined" color="primary" label="Weekends" onClick={() => onChange(WEEKENDS)} />
        <Chip clickable variant="outlined" color="primary" label="Every day" onClick={() => onChange(ALL_DAYS)} />
      </Stack>
      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

function SummaryBox({ children }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: "info.main", bgcolor: (th) => alpha(th.palette.info.main, 0.07) }}>
      <Typography variant="caption" sx={{ display: "block", mb: 0.75, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "info.dark" }}>
        What this will do
      </Typography>
      <Typography sx={{ lineHeight: 1.5 }}>{children}</Typography>
    </Box>
  );
}

function WarningBox({ children }) {
  return (
    <Alert severity="warning" icon={<FontAwesomeIcon icon={faTriangleExclamation} />}>
      {children}
    </Alert>
  );
}

function ConfirmDeleteDialog({ open, title, detail, extra, canEndToday, onEndToday, onDelete, onClose, busy, error }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="assign-delete-title">
      <DialogTitle id="assign-delete-title">
        {title}
        {detail && (
          <Typography variant="body2" color="text.secondary" component="div">
            {detail}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography>Deleting removes this completely, so it cannot be undone.</Typography>
          {extra && (
            <Typography variant="body2" color="text.secondary">
              {extra}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
        <Button color="inherit" onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        {canEndToday && (
          <Button variant="outlined" onClick={onEndToday} disabled={busy} sx={{ minHeight: 44 }}>
            End schedule today
          </Button>
        )}
        <Button variant="contained" color="error" onClick={onDelete} disabled={busy} sx={{ minHeight: 44, px: 3 }}>
          {busy ? "Working..." : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FilterChip({ label, count, selected, onClick }) {
  return (
    <Chip
      clickable
      onClick={onClick}
      aria-pressed={selected}
      color={selected ? "primary" : "default"}
      variant={selected ? "filled" : "outlined"}
      label={
        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
          {label}
          <Box
            component="span"
            sx={{
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 999,
              px: 1,
              bgcolor: selected ? "rgba(255,255,255,0.22)" : "grey.100",
              color: selected ? "inherit" : "text.secondary",
            }}
          >
            {count}
          </Box>
        </Box>
      }
      sx={{ minHeight: 44, borderRadius: 999, fontSize: 14, fontWeight: 500, px: 0.5 }}
    />
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
      sx={{ flex: "1 1 320px", maxWidth: 460, "& .MuiInputBase-root": { minHeight: 44 } }}
    />
  );
}

// ---------- recurring schedules ----------

const emptyScheduleForm = () => {
  const preset = presetFor(null, "day");
  return {
    id: null,
    staff: "",
    unit: "",
    repeat: "weekly",
    shift_type: "day",
    start_time: preset[0],
    end_time: preset[1],
    timesTouched: false,
    days_of_week: [],
    start_date: toISO(new Date()),
    end_date: "",
    notes: "",
  };
};

function SchedulesSection({ staffList, patterns, units, loading, token, reload, flash, prefill, onPrefillUsed, onNavigate }) {
  const [search, setSearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [endingOnly, setEndingOnly] = useState(false);
  const [unitFilter, setUnitFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page, setPage] = useState(0);

  const [menu, setMenu] = useState(null); // { anchorEl, pattern }
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [String(u.id), u])), [units]);
  const staffById = useMemo(() => Object.fromEntries(staffList.map((s) => [String(s.id), s])), [staffList]);
  const today = toISO(new Date());

  const isActive = (p) => p.is_active !== false;
  const endsSoon = (p) => {
    if (!p.end_date) return false;
    const d = daysUntil(p.end_date);
    return d >= 0 && d <= ENDING_SOON_DAYS;
  };

  const baseFiltered = useMemo(
    () =>
      patterns.filter((p) => {
        if (statusFilter === "active" && p.is_active === false) return false;
        if (statusFilter === "inactive" && p.is_active !== false) return false;
        if (unitFilter === "none" && p.unit) return false;
        if (unitFilter && unitFilter !== "none" && String(p.unit) !== String(unitFilter)) return false;
        const hay = [
          p.staff_name,
          p.unit_name,
          p.shift_type_display,
          p.shift_type,
          daysHaystack(p.days_of_week),
          p.start_date,
          p.end_date || "ongoing",
          p.notes,
        ]
          .filter(Boolean)
          .join(" ");
        return matchesTerms(hay, search);
      }),
    [patterns, statusFilter, unitFilter, search]
  );

  const chipCounts = useMemo(() => {
    const out = { all: baseFiltered.length };
    SHIFT_TYPES.forEach((s) => {
      out[s.value] = baseFiltered.filter((p) => p.shift_type === s.value).length;
    });
    return out;
  }, [baseFiltered]);

  const endingCount = baseFiltered.filter(endsSoon).length;
  const filtered = baseFiltered.filter(
    (p) => (shiftFilter === "all" || p.shift_type === shiftFilter) && (!endingOnly || endsSoon(p))
  );

  const lastPage = Math.max(0, Math.ceil(filtered.length / ROWS_PER_PAGE) - 1);
  const safePage = Math.min(page, lastPage);
  const paged = filtered.slice(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE);
  const filtersActive =
    search.trim() !== "" || shiftFilter !== "all" || endingOnly || unitFilter !== "" || statusFilter !== "active";

  // ---- panel ----

  const openAdd = () => {
    setForm(emptyScheduleForm());
    setErrors({});
    setSaveError("");
    setPanelOpen(true);
  };

  const openEdit = (p) => {
    setForm({
      id: p.id,
      staff: p.staff,
      unit: p.unit || "",
      repeat: "weekly",
      shift_type: p.shift_type,
      start_time: hhmm(p.start_time) || "07:00",
      end_time: hhmm(p.end_time) || "15:00",
      timesTouched: true,
      days_of_week: p.days_of_week || [],
      start_date: p.start_date,
      end_date: p.end_date || "",
      notes: p.notes || "",
    });
    setErrors({});
    setSaveError("");
    setPanelOpen(true);
  };

  // Arriving from the Calendar's "Assign" button: open the add panel with the unit, date and shift filled in.
  const startPrefill = (pf) => {
    const prefill = pf;
    const unit = unitById[String(prefill.unit_id)];
    const shiftType = prefill.shift_type || "day";
    const preset = shiftType === "custom" ? null : presetFor(unit, shiftType);
    const base = emptyScheduleForm();
    setForm({
      ...base,
      repeat: "once",
      ...(prefill.staff_id ? { staff: prefill.staff_id } : {}),
      unit: prefill.unit_id || "",
      shift_type: shiftType,
      ...(preset ? { start_time: preset[0], end_time: preset[1] } : {}),
      start_date: prefill.date || base.start_date,
    });
    setErrors({});
    setSaveError("");
    setPanelOpen(true);
  };

  useEffect(() => {
    if (!prefill) return;
    startPrefill(prefill);
    if (onPrefillUsed) onPrefillUsed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const closePanel = () => {
    if (saving) return;
    setPanelOpen(false);
  };

  const setField = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const pickShift = (shiftType) => {
    setForm((f) => {
      const preset = shiftType === "custom" ? null : presetFor(unitById[String(f.unit)], shiftType);
      return {
        ...f,
        shift_type: shiftType,
        ...(preset ? { start_time: preset[0], end_time: preset[1], timesTouched: false } : {}),
      };
    });
  };

  const pickUnit = (unitId) => {
    setForm((f) => {
      const preset =
        !f.timesTouched && f.shift_type !== "custom" ? presetFor(unitById[String(unitId)], f.shift_type) : null;
      return { ...f, unit: unitId, ...(preset ? { start_time: preset[0], end_time: preset[1] } : {}) };
    });
  };

  const handleSave = async () => {
    const errs = {};
    if (!form.staff) errs.staff = "Choose a person.";
    if (form.repeat === "weekly" && form.days_of_week.length === 0) errs.days_of_week = "Choose at least one day.";
    if (!form.start_date) errs.start_date = "Choose a date.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setSaveError("");
    try {
      if (form.id) {
        await axios.patch(
          apiEndpoints.staffingRecurringPatternDetail(form.id),
          {
            staff: form.staff,
            unit: form.unit || null,
            shift_type: form.shift_type,
            start_time: form.start_time,
            end_time: form.end_time,
            days_of_week: form.days_of_week,
            start_date: form.start_date,
            end_date: form.end_date || null,
            notes: form.notes,
          },
          { headers: getAuthHeaders(token) }
        );
        flash("success", "Schedule updated.");
      } else if (form.repeat === "once") {
        await axios.post(
          apiEndpoints.staffingShifts,
          {
            staff: form.staff,
            unit: form.unit || null,
            date: form.start_date,
            shift_type: form.shift_type,
            start_time: form.start_time,
            end_time: form.end_time,
            notes: form.notes,
          },
          { headers: getAuthHeaders(token) }
        );
        flash("success", "One-time shift assigned.");
      } else {
        await axios.post(
          apiEndpoints.staffingRecurringPatterns,
          {
            staff: form.staff,
            unit: form.unit || null,
            shift_type: form.shift_type,
            start_time: form.start_time,
            end_time: form.end_time,
            days_of_week: form.days_of_week,
            start_date: form.start_date,
            end_date: form.end_date || null,
            notes: form.notes,
          },
          { headers: getAuthHeaders(token) }
        );
        flash("success", "Recurring schedule created.");
      }
      setPanelOpen(false);
      reload();
    } catch (err) {
      setSaveError(formatApiError(err.response?.data, err.message || "Save failed."));
    } finally {
      setSaving(false);
    }
  };

  // ---- end today / delete ----

  const canEndToday = (p) => isActive(p) && p.start_date <= today && (!p.end_date || p.end_date > today);

  const endToday = async (p) => {
    try {
      await axios.patch(
        apiEndpoints.staffingRecurringPatternDetail(p.id),
        { end_date: today },
        { headers: getAuthHeaders(token) }
      );
      flash("success", `${p.staff_name}'s ${SHIFT_LABEL[p.shift_type] || p.shift_type} schedule ends today.`);
      reload();
      return true;
    } catch (err) {
      return formatApiError(err.response?.data, "Failed to end that schedule.");
    }
  };

  const confirmEndToday = async () => {
    setDeleteBusy(true);
    setDeleteError("");
    const result = await endToday(deleteTarget);
    setDeleteBusy(false);
    if (result === true) setDeleteTarget(null);
    else setDeleteError(result);
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await axios.delete(apiEndpoints.staffingRecurringPatternDetail(deleteTarget.id), {
        headers: getAuthHeaders(token),
      });
      flash("success", `${deleteTarget.staff_name}'s schedule was deleted.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      setDeleteError(formatApiError(err.response?.data, "Failed to delete that schedule."));
    } finally {
      setDeleteBusy(false);
    }
  };

  // ---- derived values for the form ----

  const formStaff = form ? staffById[String(form.staff)] : null;
  const formUnit = form ? unitById[String(form.unit)] : null;
  const roleNotCounted = formStaff && !COUNTED_ROLES.includes(formStaff.nursing_role || "other");
  const overlaps = useMemo(() => {
    if (!form || !form.staff || form.repeat !== "weekly" || form.days_of_week.length === 0) return [];
    return patterns.filter(
      (p) =>
        p.is_active !== false &&
        String(p.staff) === String(form.staff) &&
        p.id !== form.id &&
        (p.days_of_week || []).some((d) => form.days_of_week.includes(d)) &&
        (p.shift_type === form.shift_type ||
          timesOverlap(form.start_time, form.end_time, p.start_time, p.end_time))
    );
  }, [patterns, form]);

  const menuPattern = menu && menu.pattern;

  return (
    <Box>
      <WhoCanBeAssigned
        token={token}
        units={units}
        reloadKey={patterns.length}
        onAssign={(pf) => startPrefill(pf)}
        onReviewTimeOff={() => onNavigate && onNavigate("timeoff")}
      />

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }} role="group" aria-label="Filter by shift">
        <FilterChip label="All" count={chipCounts.all} selected={shiftFilter === "all"} onClick={() => { setShiftFilter("all"); setPage(0); }} />
        {SHIFT_TYPES.map((s) => (
          <FilterChip
            key={s.value}
            label={s.label}
            count={chipCounts[s.value]}
            selected={shiftFilter === s.value}
            onClick={() => {
              setShiftFilter(s.value);
              setPage(0);
            }}
          />
        ))}
        <FilterChip
          label={`Ending within ${ENDING_SOON_DAYS} days`}
          count={endingCount}
          selected={endingOnly}
          onClick={() => {
            setEndingOnly((v) => !v);
            setPage(0);
          }}
        />
      </Stack>

      <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        <SearchField
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search person, unit, shift or day"
          label="Search schedules"
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
          <MenuItem value="">All units</MenuItem>
          <MenuItem value="none">No unit</MenuItem>
          {units.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 130 }}
        >
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="inactive">Inactive</MenuItem>
          <MenuItem value="all">All</MenuItem>
        </TextField>
        <Typography variant="body2" color="text.secondary">
          Showing {filtered.length} of {patterns.length}
        </Typography>
        {filtersActive && (
          <Button
            size="small"
            onClick={() => {
              setSearch("");
              setShiftFilter("all");
              setEndingOnly(false);
              setUnitFilter("");
              setStatusFilter("active");
              setPage(0);
            }}
          >
            Clear filters
          </Button>
        )}
        <Button variant="contained" startIcon={<FontAwesomeIcon icon={faPlus} />} onClick={openAdd} sx={{ minHeight: 44, px: 2.5, ml: "auto" }}>
          Assign a schedule
        </Button>
      </Stack>

      {!loading && (
        <TableContainer component={Paper} variant="outlined">
          <Table sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ pl: 2.5 }}>Person</TableCell>
                <TableCell>Shift</TableCell>
                <TableCell>Days</TableCell>
                <TableCell>Dates</TableCell>
                <TableCell align="right" sx={{ pr: 2.5 }}>
                  <Box component="span" sx={{ position: "absolute", left: -9999 }}>
                    Actions
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      {patterns.length === 0 ? "No recurring schedules yet." : "No schedules match these filters."}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {paged.map((p) => (
                <TableRow key={p.id} hover sx={isActive(p) ? undefined : { opacity: 0.65 }}>
                  <TableCell sx={{ pl: 2.5 }}>
                    <Typography sx={{ fontWeight: 500 }}>{p.staff_name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {p.unit_name || "No unit"}
                      {!isActive(p) ? " · Inactive" : ""}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <ShiftTag type={p.shift_type} label={p.shift_type_display} />
                    <Typography variant="body2" sx={{ mt: 0.5, fontFamily: "monospace", color: "text.secondary" }}>
                      {hhmm(p.start_time)} to {hhmm(p.end_time)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <DayStrip codes={p.days_of_week} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {fmtDate(p.start_date)} to {p.end_date ? fmtDate(p.end_date) : "Ongoing"}
                    </Typography>
                    {endsSoon(p) && (
                      <Typography variant="caption" sx={{ color: "warning.dark" }}>
                        Ends in {daysUntil(p.end_date)} days
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ pr: 2.5, whiteSpace: "nowrap" }}>
                    <Button variant="outlined" color="inherit" onClick={() => openEdit(p)} sx={{ minHeight: 44, borderColor: "grey.400" }}>
                      Edit
                    </Button>
                    <IconButton
                      aria-label={`More actions for ${p.staff_name}`}
                      aria-haspopup="menu"
                      onClick={(e) => setMenu({ anchorEl: e.currentTarget, pattern: p })}
                      sx={{ ml: 0.75, width: 44, height: 44 }}
                    >
                      <FontAwesomeIcon icon={faEllipsis} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {filtered.length > ROWS_PER_PAGE && (
        <TablePagination
          component="div"
          count={filtered.length}
          page={safePage}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={ROWS_PER_PAGE}
          rowsPerPageOptions={[]}
        />
      )}

      <Menu anchorEl={menu && menu.anchorEl} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { minWidth: 220 } } }}>
        <MenuItem
          disabled={!menuPattern || !canEndToday(menuPattern)}
          onClick={async () => {
            const p = menuPattern;
            setMenu(null);
            const result = await endToday(p);
            if (result !== true) flash("error", result);
          }}
          sx={{ minHeight: 44 }}
        >
          End schedule today
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setDeleteError("");
            setDeleteTarget(menuPattern);
            setMenu(null);
          }}
          sx={{ minHeight: 44, color: "error.main", fontWeight: 600 }}
        >
          Delete schedule
        </MenuItem>
      </Menu>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title={deleteTarget ? `Delete ${deleteTarget.staff_name}'s ${(SHIFT_LABEL[deleteTarget.shift_type] || "").toLowerCase()} schedule?` : ""}
        detail={
          deleteTarget
            ? `${deleteTarget.shift_type_display || deleteTarget.shift_type}, ${describeDays(deleteTarget.days_of_week)}, ${fmtDate(deleteTarget.start_date)} to ${deleteTarget.end_date ? fmtDate(deleteTarget.end_date) : "ongoing"}`
            : ""
        }
        extra={deleteTarget && canEndToday(deleteTarget) ? "Upcoming shifts from this schedule are removed from the calendar; shifts already worked stay on record. If they are just stopping, choose End schedule today instead." : "Upcoming shifts from this schedule are removed from the calendar; shifts already worked stay on record."}
        canEndToday={!!deleteTarget && canEndToday(deleteTarget)}
        onEndToday={confirmEndToday}
        onDelete={confirmDelete}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        busy={deleteBusy}
        error={deleteError}
      />

      {form && (
        <PanelShell
          title={form.id ? "Edit schedule" : "Assign a schedule"}
          open={panelOpen}
          onClose={closePanel}
          onSave={handleSave}
          saving={saving}
          saveLabel={form.id ? "Save changes" : form.repeat === "once" ? "Assign shift" : "Create schedule"}
        >
          {saveError && <Alert severity="error">{saveError}</Alert>}

          <Autocomplete
            options={staffList}
            value={staffList.find((s) => String(s.id) === String(form.staff)) || null}
            onChange={(e, opt) => setField("staff", opt ? opt.id : "")}
            getOptionLabel={(s) => `${s.full_name} (${s.profession_display || s.profession})`}
            isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
            noOptionsText="No staff match"
            renderInput={(params) => (
              <TextField {...params} label="Person" placeholder="Type a name to search" error={!!errors.staff} helperText={errors.staff} />
            )}
          />

          <TextField
            select
            label="Unit (optional)"
            fullWidth
            value={form.unit}
            onChange={(e) => pickUnit(e.target.value)}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            helperText={
              formUnit
                ? `${formUnit.name} works ${formUnit.shift_pattern === "12h" ? "12-hour" : "8-hour"} shifts, so Day and Night times are filled in for you.`
                : undefined
            }
          >
            <MenuItem value="">No unit</MenuItem>
            {units.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name} ({u.shift_pattern === "12h" ? "12h" : "8h"})
              </MenuItem>
            ))}
          </TextField>

          {!form.id && (
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              aria-label="Repeats"
              value={form.repeat}
              onChange={(e, v) => v && setField("repeat", v)}
            >
              <ToggleButton value="weekly" sx={{ minHeight: 40 }}>
                Repeats weekly
              </ToggleButton>
              <ToggleButton value="once" sx={{ minHeight: 40 }}>
                One time
              </ToggleButton>
            </ToggleButtonGroup>
          )}

          <ShiftPicker value={form.shift_type} onChange={pickShift} />

          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Starts"
              type="time"
              fullWidth
              value={form.start_time}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value, timesTouched: true }))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Ends"
              type="time"
              fullWidth
              value={form.end_time}
              onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value, timesTouched: true }))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          {form.repeat === "weekly" && (
            <DaysPicker value={form.days_of_week} onChange={(v) => setField("days_of_week", v)} error={errors.days_of_week} />
          )}

          <Stack direction="row" spacing={1.5}>
            <TextField
              label={form.repeat === "once" ? "Date" : "Starts on"}
              type="date"
              fullWidth
              value={form.start_date}
              onChange={(e) => setField("start_date", e.target.value)}
              error={!!errors.start_date}
              helperText={errors.start_date}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            {form.repeat === "weekly" && (
              <TextField
                label="Ends on (optional)"
                type="date"
                fullWidth
                value={form.end_date}
                onChange={(e) => setField("end_date", e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
          </Stack>

          <TextField
            label="Notes (optional)"
            multiline
            minRows={2}
            fullWidth
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
          />

          {formStaff && (
            <SummaryBox>
              {formStaff.full_name} works{" "}
              <strong>
                {SHIFT_LABEL[form.shift_type]}, {form.start_time} to {form.end_time}
              </strong>
              {form.repeat === "weekly" ? (
                form.days_of_week.length ? (
                  <>
                    {" "}
                    on <strong>{describeDays(form.days_of_week)}</strong>
                  </>
                ) : (
                  " (choose the days)"
                )
              ) : (
                <>
                  {" "}
                  on <strong>{fmtDate(form.start_date)}</strong> only
                </>
              )}
              {formUnit ? ` in ${formUnit.name}` : ""}
              {form.repeat === "weekly" && (
                <>
                  , starting <strong>{fmtDate(form.start_date)}</strong>
                  {form.end_date ? (
                    <>
                      , until <strong>{fmtDate(form.end_date)}</strong>
                    </>
                  ) : (
                    ", with no end date"
                  )}
                </>
              )}
              .
            </SummaryBox>
          )}

          {roleNotCounted && (
            <WarningBox>
              <strong>Heads up:</strong> {formStaff.full_name} has no nursing role set (Other), so this shift will not count toward
              compliance. Set a role on the Roster tab to include them.
            </WarningBox>
          )}
          {overlaps.length > 0 && (
            <WarningBox>
              <strong>Possible overlap:</strong> {formStaff ? formStaff.full_name : "This person"} already has{" "}
              {overlaps
                .map((p) => `${(SHIFT_LABEL[p.shift_type] || p.shift_type).toLowerCase()} ${hhmm(p.start_time)} to ${hhmm(p.end_time)} on ${describeDays(p.days_of_week)}`)
                .join("; ")}
              .
            </WarningBox>
          )}
        </PanelShell>
      )}
    </Box>
  );
}

// ---------- coverage requirements ----------

const emptyCoverageForm = () => ({
  id: null,
  mode: "fixed",
  unit: "",
  shift_type: "day",
  days_of_week: [],
  min_staff_required: 1,
  start_date: toISO(new Date()),
  end_date: "",
  notes: "",
});

// Shows the staffing standard that HPPD requirements are calculated from, read
// from the organization's active rule (not hardcoded), so a custom rule or a
// different state is described correctly.
function RuleBox({ rule, stateName }) {
  if (!rule) {
    return (
      <Alert severity="warning" icon={<FontAwesomeIcon icon={faTriangleExclamation} />}>
        No staffing standard applies to {stateName || "your state"} yet, so HPPD requirements cannot be calculated from census.
        Pick or add a rule on the Staffing Standards tab first.
      </Alert>
    );
  }
  const lines = [];
  lines.push(`${rule.hppd_min} nursing hours per resident per day`);
  if (Number(rule.min_licensed_hppd) > 0) lines.push(`${rule.min_licensed_hppd} of those hours from licensed nurses`);
  if (Number(rule.min_cna_hppd) > 0) lines.push(`${rule.min_cna_hppd} of those hours from CNAs`);
  if (Number(rule.max_residents_per_staff) > 0) lines.push(`At least 1 staff per ${rule.max_residents_per_staff} residents`);
  if (Number(rule.min_rn_per_shift) > 0)
    lines.push(`At least ${rule.min_rn_per_shift} RN${Number(rule.min_rn_per_shift) === 1 ? "" : "s"} every shift`);
  return (
    <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: "info.main", bgcolor: (th) => alpha(th.palette.info.main, 0.07) }}>
      <Typography variant="caption" sx={{ display: "block", mb: 0.75, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "info.dark" }}>
        Staffing standard applied: {rule.name}
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5, typography: "body2", lineHeight: 1.5 }}>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </Box>
      <Typography variant="body2" sx={{ mt: 1 }}>
        Only staff assigned to this unit with a nursing role set on the Roster tab are counted. To change these numbers, use the
        Staffing Standards tab.
      </Typography>
      {rule.needs_verification && (
        <Typography variant="body2" sx={{ mt: 1, color: "warning.dark", fontWeight: 600 }}>
          This standard still needs to be verified against the official text.
        </Typography>
      )}
    </Box>
  );
}

function CoverageSection({ coverageRequirements, units, rule, stateName, loading, token, reload, flash }) {
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [page, setPage] = useState(0);

  const [menu, setMenu] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [String(u.id), u])), [units]);

  const filtered = useMemo(
    () =>
      coverageRequirements.filter((r) => {
        if (unitFilter === "none" && r.unit) return false;
        if (unitFilter && unitFilter !== "none" && String(r.unit) !== String(unitFilter)) return false;
        if (shiftFilter && r.shift_type !== shiftFilter) return false;
        if (modeFilter && r.mode !== modeFilter) return false;
        const hay = [
          r.unit_name,
          r.shift_type_display,
          r.shift_type,
          daysHaystack(r.days_of_week),
          r.mode === "hppd" ? "hppd census-based census" : `fixed minimum min ${r.min_staff_required}`,
          r.start_date,
          r.end_date || "ongoing",
          r.notes,
        ]
          .filter(Boolean)
          .join(" ");
        return matchesTerms(hay, search);
      }),
    [coverageRequirements, search, unitFilter, shiftFilter, modeFilter]
  );

  const lastPage = Math.max(0, Math.ceil(filtered.length / ROWS_PER_PAGE) - 1);
  const safePage = Math.min(page, lastPage);
  const paged = filtered.slice(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE);
  const filtersActive = search.trim() !== "" || unitFilter !== "" || shiftFilter !== "" || modeFilter !== "";

  const openAdd = () => {
    setForm(emptyCoverageForm());
    setErrors({});
    setSaveError("");
    setPanelOpen(true);
  };

  const openEdit = (r) => {
    setForm({
      id: r.id,
      mode: r.mode || "fixed",
      unit: r.unit || "",
      shift_type: r.shift_type,
      days_of_week: r.days_of_week || [],
      min_staff_required: r.min_staff_required || 1,
      start_date: r.start_date,
      end_date: r.end_date || "",
      notes: r.notes || "",
    });
    setErrors({});
    setSaveError("");
    setPanelOpen(true);
  };

  const closePanel = () => {
    if (saving) return;
    setPanelOpen(false);
  };

  const setField = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const handleSave = async () => {
    const errs = {};
    if (form.days_of_week.length === 0) errs.days_of_week = "Choose at least one day.";
    if (form.mode === "hppd" && !form.unit) errs.unit = "Choose a unit: HPPD staffing is calculated from that unit's census.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setSaveError("");
    const body = {
      shift_type: form.shift_type,
      mode: form.mode,
      unit: form.unit || null,
      days_of_week: form.days_of_week,
      min_staff_required: form.min_staff_required,
      start_date: form.start_date,
      end_date: form.end_date || null,
      notes: form.notes,
    };
    try {
      if (form.id) {
        await axios.patch(apiEndpoints.staffingCoverageRequirementDetail(form.id), body, { headers: getAuthHeaders(token) });
        flash("success", "Coverage requirement updated.");
      } else {
        await axios.post(apiEndpoints.staffingCoverageRequirements, body, { headers: getAuthHeaders(token) });
        flash("success", "Coverage requirement saved.");
      }
      setPanelOpen(false);
      reload();
    } catch (err) {
      setSaveError(formatApiError(err.response?.data, err.message || "Save failed."));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await axios.delete(apiEndpoints.staffingCoverageRequirementDetail(deleteTarget.id), { headers: getAuthHeaders(token) });
      flash("success", "Coverage requirement deleted.");
      setDeleteTarget(null);
      reload();
    } catch (err) {
      setDeleteError(formatApiError(err.response?.data, "Failed to delete that coverage requirement."));
    } finally {
      setDeleteBusy(false);
    }
  };

  const formUnit = form ? unitById[String(form.unit)] : null;
  const menuReq = menu && menu.req;

  return (
    <Box>
      <Alert severity="info" icon={false} sx={{ mb: 2 }}>
        <strong>How this is used.</strong> If fewer than the minimum number of staff are assigned to a covered shift 24 hours
        before it starts, an email alert goes to this organization's admins automatically.
      </Alert>

      <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        <SearchField
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search unit, shift, day or minimum"
          label="Search requirements"
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
          <MenuItem value="">All units</MenuItem>
          <MenuItem value="none">No unit</MenuItem>
          {units.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Shift"
          value={shiftFilter}
          onChange={(e) => {
            setShiftFilter(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 130 }}
        >
          <MenuItem value="">All shifts</MenuItem>
          {SHIFT_TYPES.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Type"
          value={modeFilter}
          onChange={(e) => {
            setModeFilter(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">All types</MenuItem>
          <MenuItem value="fixed">Fixed minimum</MenuItem>
          <MenuItem value="hppd">HPPD</MenuItem>
        </TextField>
        <Typography variant="body2" color="text.secondary">
          Showing {filtered.length} of {coverageRequirements.length}
        </Typography>
        {filtersActive && (
          <Button
            size="small"
            onClick={() => {
              setSearch("");
              setUnitFilter("");
              setShiftFilter("");
              setModeFilter("");
              setPage(0);
            }}
          >
            Clear filters
          </Button>
        )}
        <Button variant="contained" startIcon={<FontAwesomeIcon icon={faPlus} />} onClick={openAdd} sx={{ minHeight: 44, px: 2.5, ml: "auto" }}>
          Add requirement
        </Button>
      </Stack>

      {!loading && (
        <TableContainer component={Paper} variant="outlined">
          <Table sx={{ minWidth: 860 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ pl: 2.5 }}>Unit and shift</TableCell>
                <TableCell>Requirement</TableCell>
                <TableCell>Days</TableCell>
                <TableCell>Dates</TableCell>
                <TableCell align="right" sx={{ pr: 2.5 }}>
                  <Box component="span" sx={{ position: "absolute", left: -9999 }}>
                    Actions
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      {coverageRequirements.length === 0 ? "No coverage requirements yet." : "No requirements match these filters."}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {paged.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ pl: 2.5 }}>
                    <Typography sx={{ fontWeight: 500 }}>{r.unit_name || "No unit"}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {(r.shift_type_display || SHIFT_LABEL[r.shift_type] || r.shift_type)} shift
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {r.mode === "hppd" ? (
                      <Chip size="small" label="HPPD · from census" sx={{ fontWeight: 600, bgcolor: (th) => alpha(th.palette.primary.main, 0.12), color: "primary.dark" }} />
                    ) : (
                      <Chip size="small" label={`Minimum ${r.min_staff_required} staff`} sx={{ fontWeight: 600, bgcolor: "grey.100", color: "text.secondary" }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <DayStrip codes={r.days_of_week} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {fmtDate(r.start_date)} to {r.end_date ? fmtDate(r.end_date) : "Ongoing"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ pr: 2.5, whiteSpace: "nowrap" }}>
                    <Button variant="outlined" color="inherit" onClick={() => openEdit(r)} sx={{ minHeight: 44, borderColor: "grey.400" }}>
                      Edit
                    </Button>
                    <IconButton
                      aria-label={`More actions for ${r.unit_name || "no unit"} ${r.shift_type} coverage`}
                      aria-haspopup="menu"
                      onClick={(e) => setMenu({ anchorEl: e.currentTarget, req: r })}
                      sx={{ ml: 0.75, width: 44, height: 44 }}
                    >
                      <FontAwesomeIcon icon={faEllipsis} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {filtered.length > ROWS_PER_PAGE && (
        <TablePagination
          component="div"
          count={filtered.length}
          page={safePage}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={ROWS_PER_PAGE}
          rowsPerPageOptions={[]}
        />
      )}

      <Menu anchorEl={menu && menu.anchorEl} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { minWidth: 220 } } }}>
        <MenuItem
          onClick={() => {
            setDeleteError("");
            setDeleteTarget(menuReq);
            setMenu(null);
          }}
          sx={{ minHeight: 44, color: "error.main", fontWeight: 600 }}
        >
          Delete requirement
        </MenuItem>
      </Menu>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title={deleteTarget ? "Delete this coverage requirement?" : ""}
        detail={
          deleteTarget
            ? `${deleteTarget.unit_name || "No unit"}, ${(SHIFT_LABEL[deleteTarget.shift_type] || deleteTarget.shift_type).toLowerCase()} shift, ${describeDays(deleteTarget.days_of_week)}`
            : ""
        }
        extra="Understaffing alerts stop for this shift once it is deleted."
        canEndToday={false}
        onDelete={confirmDelete}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        busy={deleteBusy}
        error={deleteError}
      />

      {form && (
        <PanelShell
          title={form.id ? "Edit coverage requirement" : "Add a coverage requirement"}
          open={panelOpen}
          onClose={closePanel}
          onSave={handleSave}
          saving={saving}
          saveLabel={form.id ? "Save changes" : "Save requirement"}
        >
          {saveError && <Alert severity="error">{saveError}</Alert>}

          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            color="primary"
            aria-label="Requirement type"
            value={form.mode}
            onChange={(e, v) => v && setField("mode", v)}
          >
            <ToggleButton value="fixed" sx={{ minHeight: 40 }}>
              Fixed minimum
            </ToggleButton>
            <ToggleButton value="hppd" sx={{ minHeight: 40 }}>
              HPPD from census
            </ToggleButton>
          </ToggleButtonGroup>

          <TextField
            select
            label={form.mode === "hppd" ? "Unit (required for HPPD)" : "Unit (optional)"}
            fullWidth
            value={form.unit}
            onChange={(e) => setField("unit", e.target.value)}
            error={!!errors.unit}
            helperText={errors.unit}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">No unit</MenuItem>
            {units.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name} ({u.shift_pattern === "12h" ? "12h" : "8h"})
              </MenuItem>
            ))}
          </TextField>

          {form.mode === "hppd" && <RuleBox rule={rule} stateName={stateName} />}

          <ShiftPicker value={form.shift_type} onChange={(v) => setField("shift_type", v)} />

          {form.mode === "fixed" && (
            <TextField
              label="Minimum staff required"
              type="number"
              fullWidth
              value={form.min_staff_required}
              onChange={(e) => setField("min_staff_required", Math.max(1, Number(e.target.value) || 1))}
              slotProps={{ htmlInput: { min: 1 } }}
            />
          )}

          <DaysPicker value={form.days_of_week} onChange={(v) => setField("days_of_week", v)} error={errors.days_of_week} />

          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Starts on"
              type="date"
              fullWidth
              value={form.start_date}
              onChange={(e) => setField("start_date", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Ends on (optional)"
              type="date"
              fullWidth
              value={form.end_date}
              onChange={(e) => setField("end_date", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          <TextField
            label="Notes (optional)"
            multiline
            minRows={2}
            fullWidth
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
          />

          <SummaryBox>
            {formUnit ? formUnit.name : "Any unit"} <strong>{SHIFT_LABEL[form.shift_type]}</strong> shift needs{" "}
            {form.mode === "hppd" ? (
              <>enough staff to meet the {rule ? rule.name : "staffing"} standard for that day's census</>
            ) : (
              <>
                at least <strong>{form.min_staff_required}</strong> {form.min_staff_required === 1 ? "person" : "people"}
              </>
            )}
            {form.days_of_week.length ? (
              <>
                {" "}
                on <strong>{describeDays(form.days_of_week)}</strong>
              </>
            ) : (
              " (choose the days)"
            )}
            , starting <strong>{fmtDate(form.start_date)}</strong>
            {form.end_date ? (
              <>
                , until <strong>{fmtDate(form.end_date)}</strong>
              </>
            ) : (
              ", with no end date"
            )}
            .
          </SummaryBox>
        </PanelShell>
      )}
    </Box>
  );
}

// ---------- tab ----------

function StaffingAssignTab({ prefill = null, onPrefillUsed = null, onNavigate = null }) {
  const token = getAccessToken();

  const [staffList, setStaffList] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [coverageRequirements, setCoverageRequirements] = useState([]);
  const [units, setUnits] = useState([]);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [flashMsg, setFlashMsg] = useState(null); // { severity, message }
  const [section, setSection] = useState("schedules");

  const flash = useCallback((severity, message) => setFlashMsg({ severity, message }), []);

  const fetchData = useCallback(async () => {
    try {
      const [staffRes, patternsRes, coverageRes, unitsRes] = await Promise.all([
        axios.get(apiEndpoints.staffingStaff, { headers: getAuthHeaders(token), params: { active_only: 1 } }),
        axios.get(apiEndpoints.staffingRecurringPatterns, { headers: getAuthHeaders(token) }),
        axios.get(apiEndpoints.staffingCoverageRequirements, { headers: getAuthHeaders(token) }),
        axios.get(apiEndpoints.staffingUnits, { headers: getAuthHeaders(token), params: { active_only: 1 } }),
      ]);
      setUnits(unitsRes.data.results || unitsRes.data || []);
      setStaffList(staffRes.data.results || staffRes.data || []);
      setPatterns(patternsRes.data.results || patternsRes.data || []);
      setCoverageRequirements(coverageRes.data.results || coverageRes.data || []);
      setLoadError("");
      // The active staffing standard is only informational here; a failure just hides its numbers.
      axios
        .get(apiEndpoints.staffingLocation, { headers: getAuthHeaders(token) })
        .then((res) => setLocation(res.data))
        .catch(() => setLocation(null));
    } catch (err) {
      console.error("Failed to load staffing data", err);
      setLoadError("Failed to load staff, schedules and coverage requirements.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Stack
        direction="row"
        spacing={2}
        alignItems="flex-end"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        sx={{
          mb: 2,
          position: "sticky",
          top: "calc(64px + var(--staffing-sticky-h, 110px))",
          zIndex: 900,
          bgcolor: "background.paper",
          py: 1,
        }}
      >
        <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
          Assign Schedule
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={section}
          onChange={(e, v) => v && setSection(v)}
          aria-label="What are you managing"
        >
          <ToggleButton value="schedules" sx={{ minHeight: 44, px: 2.5 }}>
            Recurring schedules
          </ToggleButton>
          <ToggleButton value="coverage" sx={{ minHeight: 44, px: 2.5 }}>
            Coverage requirements
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}
      {flashMsg && (
        <Alert severity={flashMsg.severity} sx={{ mb: 2 }} onClose={() => setFlashMsg(null)}>
          {flashMsg.message}
        </Alert>
      )}

      {section === "schedules" ? (
        <SchedulesSection
          staffList={staffList}
          patterns={patterns}
          units={units}
          loading={loading}
          token={token}
          reload={fetchData}
          flash={flash}
          prefill={prefill}
          onPrefillUsed={onPrefillUsed}
          onNavigate={onNavigate}
        />
      ) : (
        <CoverageSection
          coverageRequirements={coverageRequirements}
          units={units}
          rule={location ? location.rule : null}
          stateName={location ? location.state_name || location.state : ""}
          loading={loading}
          token={token}
          reload={fetchData}
          flash={flash}
        />
      )}
    </Box>
  );
}

export default StaffingAssignTab;
