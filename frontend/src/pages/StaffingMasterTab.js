import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import {
  DAY_LETTERS,
  MONTH_NAMES,
  WEEKDAY_OPTIONS,
  gridDays,
} from "../utils/masterSchedule";

const NAME_W = 200;
const HP_W = 72;
const STATUS_W = 80;
const DAY_W = 46;
const HEAD_BG = "#f5f5f5";

const headers = () => getAuthHeaders(getAccessToken());
const errText = (err, fallback) =>
  err?.response?.data?.error || err?.response?.data?.detail || err?.message || fallback;

// One day cell: a plain <select> keeps a month of cells fast.
const CodeSelect = memo(function CodeSelect({ value, codes, color, disabled, onChange }) {
  return (
    <select
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Shift code"
      style={{
        width: "100%",
        height: 26,
        border: "none",
        outline: "none",
        textAlign: "center",
        textAlignLast: "center",
        fontSize: 12,
        fontWeight: 600,
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        appearance: "none",
        WebkitAppearance: "none",
        padding: 0,
        color: "inherit",
      }}
    >
      <option value="" />
      {codes.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
});

const LabelBox = ({ options, value, disabled, width, label, onCommit }) => (
  <Autocomplete
    freeSolo
    autoSelect
    size="small"
    disabled={disabled}
    options={options}
    value={value || ""}
    onChange={(e, v) => onCommit(typeof v === "string" ? v.trim() : "")}
    slotProps={{ paper: { sx: { minWidth: width + 40 } } }}
    sx={{ width }}
    renderInput={(params) => (
      <TextField
        {...params}
        variant="standard"
        placeholder={label}
        slotProps={{
          htmlInput: { ...params.inputProps, "aria-label": label, maxLength: 20, style: { fontSize: 12, textAlign: "center" } },
        }}
      />
    )}
  />
);

const RowView = memo(function RowView({
  row,
  days,
  cells,
  codes,
  staffOptions,
  hpValues,
  statusValues,
  isAdmin,
  sectionId,
  onAddRowBelow,
  onPatchRow,
  onDeleteRow,
  onSetCell,
}) {
  const current = useMemo(
    () => staffOptions.find((s) => s.id === row.staff_id) || null,
    [staffOptions, row.staff_id]
  );
  return (
    <tr>
      <td style={{ ...stickyCell(0, NAME_W), padding: "0 4px" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Autocomplete
            size="small"
            disabled={!isAdmin}
            options={staffOptions}
            value={current}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            getOptionLabel={(o) => o.name || ""}
            onChange={(e, v) => onPatchRow(row.id, { staff: v ? v.id : null })}
            noOptionsText="No one left on the roster"
            sx={{ flex: 1, minWidth: 0 }}
            renderOption={(props, o) => {
              const { key, ...rest } = props;
              return (
                <li key={key} {...rest}>
                  <Box>
                    <Typography variant="body2">{o.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{o.profession}</Typography>
                  </Box>
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                variant="standard"
                placeholder="Select staff…"
                slotProps={{ htmlInput: { ...params.inputProps, "aria-label": "Staff name", style: { fontSize: 13 } } }}
              />
            )}
          />
          {isAdmin && (
            <Tooltip title="Add a row below this one">
              <IconButton size="small" aria-label="Add row below" onClick={() => onAddRowBelow(sectionId, row.id)}>
                <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} />
              </IconButton>
            </Tooltip>
          )}
          {isAdmin && (
            <Tooltip title="Remove this row">
              <IconButton size="small" aria-label="Remove row" onClick={() => onDeleteRow(row)}>
                <FontAwesomeIcon icon={faTrash} style={{ fontSize: 11 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </td>
      <td style={{ ...stickyCell(NAME_W, HP_W), padding: "0 2px" }}>
        <LabelBox
          label="HP"
          width={HP_W - 4}
          options={hpValues}
          value={row.hp}
          disabled={!isAdmin}
          onCommit={(v) => v !== (row.hp || "") && onPatchRow(row.id, { hp: v })}
        />
      </td>
      <td style={{ ...stickyCell(NAME_W + HP_W, STATUS_W), padding: "0 2px" }}>
        <LabelBox
          label="Status"
          width={STATUS_W - 4}
          options={statusValues}
          value={row.status}
          disabled={!isAdmin}
          onCommit={(v) => v !== (row.status || "") && onPatchRow(row.id, { status: v })}
        />
      </td>
      {days.map((d) => (
        <td
          key={d.iso}
          style={{
            width: DAY_W,
            minWidth: DAY_W,
            padding: 0,
            border: "1px solid #e0e0e0",
            background: d.color || "#fff",
            opacity: d.inMonth ? 1 : 0.7,
          }}
        >
          <CodeSelect
            value={cells?.[d.iso]}
            codes={codes}
            disabled={!isAdmin}
            onChange={(code) => onSetCell(row.id, d.iso, code)}
          />
        </td>
      ))}
    </tr>
  );
});

function stickyCell(left, width) {
  return {
    position: "sticky",
    left,
    width,
    minWidth: width,
    maxWidth: width,
    background: "#fff",
    zIndex: 1,
    border: "1px solid #e0e0e0",
  };
}

function StaffingMasterTab({ isAdmin }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [data, setData] = useState(null);
  const [cells, setCells] = useState({});
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newSection, setNewSection] = useState({ open: false, name: "", sub: false, after: "end" });
  const [copy, setCopy] = useState({ open: false, month: 0, year: today.getFullYear(), overwrite: false, busy: false });
  const [auto, setAuto] = useState({ open: false, overwrite: false, busy: false });
  const [newRow, setNewRow] = useState({ open: false, section: "", after: "end", staff: null });
  const [notice, setNotice] = useState("");

  const weekStart = data?.settings?.week_start ?? 3;
  const days = useMemo(() => gridDays(year, month, weekStart), [year, month, weekStart]);
  const rangeStart = days[0].iso;
  const rangeEnd = days[days.length - 1].iso;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(apiEndpoints.staffingMasterSchedule, {
        headers: headers(),
        params: { start: rangeStart, end: rangeEnd },
      });
      setData(res.data);
      setCells(res.data.cells || {});
    } catch (err) {
      setError(errText(err, "Could not load the master schedule."));
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const mutateRow = useCallback((rowId, fn) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            sections: prev.sections.map((s) =>
              s.rows.some((r) => r.id === rowId)
                ? { ...s, rows: s.rows.map((r) => (r.id === rowId ? fn(r) : r)) }
                : s
            ),
          }
        : prev
    );
  }, []);

  const patchRow = useCallback(
    async (rowId, body) => {
      setError("");
      try {
        const res = await axios.patch(apiEndpoints.staffingMasterScheduleRow(rowId), body, { headers: headers() });
        mutateRow(rowId, () => res.data);
        // a brand-new HP / Status value joins the dropdown for every row
        setData((prev) => {
          if (!prev) return prev;
          const s = prev.settings;
          const add = (list, v) => (v && !list.includes(v) ? [...list, v] : list);
          return {
            ...prev,
            settings: { ...s, hp_values: add(s.hp_values, res.data.hp), status_values: add(s.status_values, res.data.status) },
          };
        });
      } catch (err) {
        setError(errText(err, "Could not save that change."));
        load();
      }
    },
    [mutateRow, load]
  );

  // Reads the old value from a ref so this callback stays the same between edits
  // (otherwise every row would re-render each time one cell changes).
  const setCell = useCallback(
    async (rowId, iso, code) => {
      const before = cellsRef.current[rowId]?.[iso] || "";
      const apply = (v) =>
        setCells((prev) => {
          const rowCells = { ...(prev[rowId] || {}) };
          if (v) rowCells[iso] = v;
          else delete rowCells[iso];
          return { ...prev, [rowId]: rowCells };
        });
      apply(code);
      try {
        await axios.put(apiEndpoints.staffingMasterScheduleCells, { row: rowId, date: iso, code }, { headers: headers() });
      } catch (err) {
        apply(before);
        setError(errText(err, "Could not save that cell."));
      }
    },
    []
  );

  // after: "start" | "end" | the id of the row to place the new one below
  const addRow = useCallback(async (sectionId, after = "end", staffId = null) => {
    setError("");
    try {
      const body = { section: sectionId, after };
      if (staffId) body.staff = staffId;
      const res = await axios.post(apiEndpoints.staffingMasterScheduleRows, body, { headers: headers() });
      const { index, ...created } = res.data;
      setData((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.id !== sectionId) return s;
          const rows = [...s.rows];
          rows.splice(Number.isInteger(index) ? index : rows.length, 0, created);
          return { ...s, rows };
        }),
      }));
      return true;
    } catch (err) {
      setError(errText(err, "Could not add a row."));
      return false;
    }
  }, []);

  const createRow = async () => {
    if (!newRow.section) return;
    const ok = await addRow(Number(newRow.section), newRow.after, newRow.staff);
    if (ok) setNewRow({ open: false, section: "", after: "end", staff: null });
  };

  const deleteRow = useCallback(async (row) => {
    const who = row.staff_name || "this blank row";
    if (!window.confirm(`Remove ${who} and all of their entries from the master schedule?`)) return;
    try {
      await axios.delete(apiEndpoints.staffingMasterScheduleRow(row.id), { headers: headers() });
      setData((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== row.id) })),
      }));
    } catch (err) {
      setError(errText(err, "Could not remove that row."));
    }
  }, []);

  const deleteSection = useCallback(async (section) => {
    const people = section.rows.filter((r) => r.staff_id).length;
    const detail = people
      ? `${people} ${people === 1 ? "person" : "people"} on it and all of their entries on this sheet will be removed (they stay on the roster).`
      : "Its blank rows will be removed.";
    if (!window.confirm(`Delete the section "${section.name}"? ${detail}`)) return;
    try {
      await axios.delete(apiEndpoints.staffingMasterScheduleSection(section.id), { headers: headers() });
      setData((prev) => ({ ...prev, sections: prev.sections.filter((s) => s.id !== section.id) }));
    } catch (err) {
      setError(errText(err, "Could not delete the section."));
    }
  }, []);

  const openCopy = () => {
    // default the source to the month before the one on screen
    const prev = new Date(Date.UTC(year, month - 1, 1));
    setCopy((c) => ({ ...c, open: !c.open, month: prev.getUTCMonth(), year: prev.getUTCFullYear(), overwrite: false }));
  };

  const copyMonth = async () => {
    const ym = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
    const source = ym(copy.year, copy.month);
    const target = ym(year, month);
    const label = (y, m) => `${MONTH_NAMES[m]} ${y}`;
    if (source === target) {
      setError("Pick a different month to copy from.");
      return;
    }
    const msg = copy.overwrite
      ? `Replace ${label(year, month)} with an exact copy of ${label(copy.year, copy.month)}? Entries already in ${MONTH_NAMES[month]} will be overwritten or cleared.`
      : `Copy ${label(copy.year, copy.month)} into ${label(year, month)}? Only empty cells are filled; nothing already entered is changed.`;
    if (!window.confirm(msg)) return;
    setError("");
    setNotice("");
    setCopy((c) => ({ ...c, busy: true }));
    try {
      const res = await axios.post(
        apiEndpoints.staffingMasterScheduleCopy,
        { source, target, overwrite: copy.overwrite },
        { headers: headers() }
      );
      const { created, updated, cleared } = res.data;
      setNotice(
        `Copied ${label(copy.year, copy.month)} into ${label(year, month)}: ${created} added, ${updated} changed, ${cleared} cleared.`
      );
      setCopy((c) => ({ ...c, open: false, busy: false }));
      load();
    } catch (err) {
      setError(errText(err, "Could not copy that month."));
      setCopy((c) => ({ ...c, busy: false }));
    }
  };

  const createSchedule = async () => {
    const target = `${year}-${String(month + 1).padStart(2, "0")}`;
    const name = `${MONTH_NAMES[month]} ${year}`;
    const msg = auto.overwrite
      ? `Create the ${name} calendar schedule from this master schedule? Shifts created from it earlier will be brought in line with it (removed if you cleared or changed the entry). Shifts entered any other way are not touched.`
      : `Create the ${name} calendar schedule from this master schedule? Anyone who already has that shift on that day is left as is, so nothing is duplicated.`;
    if (!window.confirm(msg)) return;
    setError("");
    setNotice("");
    setAuto((a) => ({ ...a, busy: true }));
    try {
      const res = await axios.post(
        apiEndpoints.staffingMasterScheduleCreateSchedule,
        { month: target, overwrite: auto.overwrite },
        { headers: headers() }
      );
      const { created, already_scheduled: already, updated, removed, people, blank_rows_skipped: blank } = res.data;
      setNotice(
        `${name} calendar schedule: ${created} ${created === 1 ? "shift" : "shifts"} created for ${people} ${people === 1 ? "person" : "people"}` +
          (already ? `, ${already} already on the calendar` : "") +
          (updated ? `, ${updated} updated` : "") +
          (removed ? `, ${removed} removed` : "") +
          (blank ? `. ${blank} blank ${blank === 1 ? "row was" : "rows were"} skipped (pick a person first).` : ".")
      );
      setAuto((a) => ({ ...a, open: false, busy: false }));
      load();
    } catch (err) {
      setError(errText(err, "Could not create the schedule."));
      setAuto((a) => ({ ...a, busy: false }));
    }
  };

  const addSectionBelow = useCallback((sectionId) => {
    setNewSection((s) => ({ ...s, open: true, after: String(sectionId) }));
  }, []);

  const changeWeekStart = async (value) => {
    setError("");
    try {
      const res = await axios.patch(apiEndpoints.staffingMasterScheduleSettings, { week_start: value }, { headers: headers() });
      setData((prev) => ({ ...prev, settings: { ...prev.settings, ...res.data } }));
    } catch (err) {
      setError(errText(err, "Could not change the start of the work week."));
    }
  };

  const createSection = async () => {
    const name = newSection.name.trim();
    if (!name) return;
    try {
      const res = await axios.post(
        apiEndpoints.staffingMasterScheduleSections,
        { name, level: newSection.sub ? 1 : 0, after: newSection.after },
        { headers: headers() }
      );
      const { index, ...created } = res.data;
      setData((prev) => {
        const list = [...prev.sections];
        list.splice(Number.isInteger(index) ? index : list.length, 0, created);
        return { ...prev, sections: list };
      });
      setNewSection({ open: false, name: "", sub: false, after: "end" });
    } catch (err) {
      setError(errText(err, "Could not add the section."));
    }
  };

  // People already on the sheet are removed from the dropdown so no one lands on two rows.
  const usedIds = useMemo(() => {
    const ids = new Set();
    (data?.sections || []).forEach((s) => s.rows.forEach((r) => r.staff_id && ids.add(r.staff_id)));
    return ids;
  }, [data]);
  const freeStaff = useMemo(() => (data?.staff || []).filter((s) => !usedIds.has(s.id)), [data, usedIds]);
  const allStaff = data?.staff || [];

  const years = useMemo(() => {
    const y = today.getFullYear();
    return [y - 2, y - 1, y, y + 1, y + 2, y + 3];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colSpan = 3 + days.length;

  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <TextField select size="small" label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))} sx={{ minWidth: 150 }}>
          {MONTH_NAMES.map((m, i) => (
            <MenuItem key={m} value={i}>{m}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} sx={{ minWidth: 100 }}>
          {(years.includes(year) ? years : [...years, year].sort()).map((y) => (
            <MenuItem key={y} value={y}>{y}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Work week starts"
          value={weekStart}
          disabled={!isAdmin || !data}
          onChange={(e) => changeWeekStart(Number(e.target.value))}
          sx={{ minWidth: 170 }}
        >
          {WEEKDAY_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
        {isAdmin && (
          <Button size="small" variant="outlined" onClick={() => setNewSection((s) => ({ ...s, open: !s.open }))}>
            Add section
          </Button>
        )}
        {isAdmin && (
          <Button
            size="small"
            variant="outlined"
            onClick={() =>
              setNewRow((r) => ({ ...r, open: !r.open, section: r.section || String(data?.sections?.[0]?.id ?? ""), after: "end" }))
            }
          >
            Add row
          </Button>
        )}
        {isAdmin && (
          <Button size="small" variant="outlined" onClick={openCopy}>
            Copy month…
          </Button>
        )}
        {isAdmin && (
          <Button size="small" variant="outlined" onClick={() => setAuto((a) => ({ ...a, open: !a.open, overwrite: false }))}>
            Create schedule…
          </Button>
        )}
        {loading && <CircularProgress size={20} />}
        {!isAdmin && <Typography variant="caption" color="text.secondary">View only — admins can edit.</Typography>}
      </Stack>

      {newSection.open && isAdmin && (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
          <TextField
            size="small"
            label="New section name"
            value={newSection.name}
            onChange={(e) => setNewSection((s) => ({ ...s, name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && createSection()}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            size="small"
            label="Place it"
            value={newSection.after}
            onChange={(e) => setNewSection((s) => ({ ...s, after: e.target.value }))}
            sx={{ minWidth: 240 }}
          >
            <MenuItem value="start">At the very top</MenuItem>
            <MenuItem value="end">At the end (bottom)</MenuItem>
            {data?.sections.map((s, i) => (
              <MenuItem key={s.id} value={String(s.id)}>
                {`After ${i + 1}. ${s.name}`}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Checkbox size="small" checked={newSection.sub} onChange={(e) => setNewSection((s) => ({ ...s, sub: e.target.checked }))} />}
            label="Sub-heading (like Unit 2)"
          />
          <Button size="small" variant="contained" onClick={createSection} disabled={!newSection.name.trim()}>
            Add
          </Button>
        </Stack>
      )}

      {newRow.open && isAdmin && (
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          <TextField
            select
            size="small"
            label="Section"
            value={newRow.section}
            onChange={(e) => setNewRow((r) => ({ ...r, section: e.target.value, after: "end" }))}
            sx={{ minWidth: 240 }}
          >
            {data?.sections.map((s, i) => (
              <MenuItem key={s.id} value={String(s.id)}>
                {`${i + 1}. ${s.name}`}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Place it"
            value={newRow.after}
            onChange={(e) => setNewRow((r) => ({ ...r, after: e.target.value }))}
            sx={{ minWidth: 260 }}
          >
            <MenuItem value="start">At the top of the section</MenuItem>
            <MenuItem value="end">At the end (bottom)</MenuItem>
            {(data?.sections.find((s) => String(s.id) === newRow.section)?.rows || []).map((r, i) => (
              <MenuItem key={r.id} value={String(r.id)}>
                {`After ${i + 1}. ${r.staff_name || "(blank row)"}`}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            size="small"
            options={freeStaff}
            value={freeStaff.find((s) => s.id === newRow.staff) || null}
            onChange={(e, v) => setNewRow((r) => ({ ...r, staff: v ? v.id : null }))}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            getOptionLabel={(o) => o.name || ""}
            noOptionsText="No one left on the roster"
            sx={{ width: 240 }}
            renderInput={(params) => <TextField {...params} label="Person (optional)" />}
          />
          <Button size="small" variant="contained" onClick={createRow} disabled={!newRow.section}>
            Add
          </Button>
        </Stack>
      )}

      {copy.open && isAdmin && (
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          <Typography variant="body2">Copy from</Typography>
          <TextField select size="small" label="Month" value={copy.month} onChange={(e) => setCopy((c) => ({ ...c, month: Number(e.target.value) }))} sx={{ minWidth: 140 }}>
            {MONTH_NAMES.map((m, i) => (
              <MenuItem key={m} value={i}>{m}</MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Year" value={copy.year} onChange={(e) => setCopy((c) => ({ ...c, year: Number(e.target.value) }))} sx={{ minWidth: 100 }}>
            {(years.includes(copy.year) ? years : [...years, copy.year].sort()).map((y) => (
              <MenuItem key={y} value={y}>{y}</MenuItem>
            ))}
          </TextField>
          <Typography variant="body2">
            into <strong>{MONTH_NAMES[month]} {year}</strong>
          </Typography>
          <FormControlLabel
            control={<Checkbox size="small" checked={copy.overwrite} onChange={(e) => setCopy((c) => ({ ...c, overwrite: e.target.checked }))} />}
            label="Replace entries already in this month"
          />
          <Button size="small" variant="contained" onClick={copyMonth} disabled={copy.busy}>
            {copy.busy ? "Copying…" : "Copy"}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ flexBasis: "100%" }}>
            Copies work week by work week (the first week shown goes into the first week shown). People, HP and Status already carry over. Days that belong to the neighboring months are never changed.
          </Typography>
        </Stack>
      )}

      {auto.open && isAdmin && (
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          <Typography variant="body2">
            Create the calendar schedule for <strong>{MONTH_NAMES[month]} {year}</strong> from this master schedule
          </Typography>
          <FormControlLabel
            control={<Checkbox size="small" checked={auto.overwrite} onChange={(e) => setAuto((a) => ({ ...a, overwrite: e.target.checked }))} />}
            label="Also update shifts created from here earlier"
          />
          <Button size="small" variant="contained" onClick={createSchedule} disabled={auto.busy}>
            {auto.busy ? "Creating…" : "Create"}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ flexBasis: "100%" }}>
            Every code in a person's row becomes a shift on the Calendar tab for that date: 7 = 7a–3p, 7A = 7a–7p, 7P / 7p = 7p–7a, 3 = 3p–11p, 11 = 11p–7a, and "3 11" = both the 3–11 and the 11–7 shift. R and x are days off and create nothing. Blank rows (no person) are skipped. Only dates inside {MONTH_NAMES[month]} are used, and running it again never duplicates a shift.
          </Typography>
        </Stack>
      )}

      {notice && (
        <Alert severity="success" sx={{ mb: 1 }} onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {data && (
        <Box sx={{ overflow: "auto", maxHeight: "calc(100vh - 290px)", border: "1px solid #e0e0e0", borderRadius: 1 }}>
          <table
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              tableLayout: "fixed",
              fontSize: 13,
              width: NAME_W + HP_W + STATUS_W + days.length * DAY_W,
            }}
          >
            <thead>
              <tr>
                <th style={{ ...headCell(0, NAME_W), textAlign: "left", paddingLeft: 8 }}>STAFF</th>
                <th style={headCell(NAME_W, HP_W)}>HP</th>
                <th style={headCell(NAME_W + HP_W, STATUS_W)}>Status</th>
                {days.map((d) => (
                  <th
                    key={d.iso}
                    title={d.iso}
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      width: DAY_W,
                      minWidth: DAY_W,
                      background: d.color || HEAD_BG,
                      border: "1px solid #e0e0e0",
                      lineHeight: 1.1,
                      padding: "3px 0",
                      opacity: d.inMonth ? 1 : 0.7,
                    }}
                  >
                    <div>{DAY_LETTERS[d.dow]}</div>
                    <div style={{ fontSize: 10, fontWeight: 400 }}>{d.inMonth ? d.day : `${d.day}*`}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sections.map((section) => (
                <SectionBlock
                  key={section.id}
                  section={section}
                  colSpan={colSpan}
                  days={days}
                  cells={cells}
                  codes={data.codes}
                  freeStaff={freeStaff}
                  allStaff={allStaff}
                  hpValues={data.settings.hp_values}
                  statusValues={data.settings.status_values}
                  isAdmin={isAdmin}
                  onAddRow={addRow}
                  onAddRowBelow={addRow}
                  onDeleteSection={deleteSection}
                  onAddSectionBelow={addSectionBelow}
                  onPatchRow={patchRow}
                  onDeleteRow={deleteRow}
                  onSetCell={setCell}
                />
              ))}
            </tbody>
          </table>
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
        * dates outside {MONTH_NAMES[month]} that complete the first and last work week. Changes save as you make them.
      </Typography>
    </Box>
  );
}

function headCell(left, width) {
  return {
    position: "sticky",
    top: 0,
    left,
    zIndex: 3,
    width,
    minWidth: width,
    maxWidth: width,
    background: HEAD_BG,
    border: "1px solid #e0e0e0",
    padding: "4px 2px",
  };
}

const SectionBlock = memo(function SectionBlock({
  section,
  colSpan,
  days,
  cells,
  codes,
  freeStaff,
  allStaff,
  hpValues,
  statusValues,
  isAdmin,
  onAddRow,
  onAddRowBelow,
  onDeleteSection,
  onAddSectionBelow,
  onPatchRow,
  onDeleteRow,
  onSetCell,
}) {
  return (
    <>
      <tr>
        <td
          colSpan={colSpan}
          style={{
            background: "#eceff1",
            border: "1px solid #e0e0e0",
            padding: "3px 8px",
            fontWeight: 700,
            paddingLeft: section.level ? 22 : 8,
            position: "sticky",
            left: 0,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, position: "sticky", left: 8, width: "fit-content" }}>
            <span style={{ fontSize: section.level ? 12 : 13 }}>{section.name}</span>
            {isAdmin && (
              <Button
                size="small"
                sx={{ minWidth: 0, py: 0, px: 0.75, fontSize: 11, textTransform: "none" }}
                startIcon={<FontAwesomeIcon icon={faPlus} style={{ fontSize: 10 }} />}
                onClick={() => onAddRow(section.id)}
              >
                Add row
              </Button>
            )}
            {isAdmin && (
              <Button
                size="small"
                sx={{ minWidth: 0, py: 0, px: 0.75, fontSize: 11, textTransform: "none" }}
                startIcon={<FontAwesomeIcon icon={faPlus} style={{ fontSize: 10 }} />}
                onClick={() => onAddSectionBelow(section.id)}
              >
                Section below
              </Button>
            )}
            {isAdmin && (
              <Tooltip title="Delete this section">
                <IconButton size="small" aria-label={`Delete section ${section.name}`} onClick={() => onDeleteSection(section)}>
                  <FontAwesomeIcon icon={faTrash} style={{ fontSize: 11 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </td>
      </tr>
      {section.rows.map((row) => (
        <RowOptions
          key={row.id}
          row={row}
          days={days}
          cells={cells[row.id]}
          codes={codes}
          freeStaff={freeStaff}
          allStaff={allStaff}
          hpValues={hpValues}
          statusValues={statusValues}
          isAdmin={isAdmin}
          sectionId={section.id}
          onAddRowBelow={onAddRowBelow}
          onPatchRow={onPatchRow}
          onDeleteRow={onDeleteRow}
          onSetCell={onSetCell}
        />
      ))}
    </>
  );
});

// A row's dropdown is the free roster plus the person already in that row.
const RowOptions = memo(function RowOptions({ row, freeStaff, allStaff, ...rest }) {
  const staffOptions = useMemo(() => {
    const own = row.staff_id ? allStaff.find((s) => s.id === row.staff_id) : null;
    return own ? [own, ...freeStaff] : freeStaff;
  }, [row.staff_id, freeStaff, allStaff]);
  return <RowView row={row} staffOptions={staffOptions} {...rest} />;
});

export default StaffingMasterTab;
