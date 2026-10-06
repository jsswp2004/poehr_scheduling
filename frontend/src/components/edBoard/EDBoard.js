import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
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
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import HotelIcon from "@mui/icons-material/Hotel";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "../patientHeader/headerApi";
import { DEFAULT_COLUMNS, ORDER_ICON_COLUMNS, VIEWS, filterRows, formatLos, losMinutes, ruleColors, vitalsStatus } from "./edBoardColumns";

const FRONT_LINE = ["doctor", "nurse", "registrar", "admin", "system_admin"];
const REFRESH_MS = 30000;

const ROW_COLORS = {
  available: "#90ee90",
  cleaning: "#fff3cd",
  blocked: "#f8d7da",
  waiting: "#fffde7",
  occupiedA: "#ffffff",
  occupiedB: "#eef1f5",
};
const BED_LABEL = { available: "Ready", cleaning: "Cleaning", blocked: "Blocked", occupied: "" };

/** A small "pick one" dialog used to place a waiting patient in a bed, or fill a Ready bed. */
function PickDialog({ title, label, options, onClose, onSubmit, busy }) {
  const [value, setValue] = useState("");
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {options.length === 0 ? (
          <Typography sx={{ mt: 1 }} color="text.secondary">
            Nothing to choose from right now.
          </Typography>
        ) : (
          <FormControl size="small" fullWidth sx={{ mt: 1 }}>
            <InputLabel id="pick-label">{label}</InputLabel>
            <Select labelId="pick-label" label={label} value={value} onChange={(e) => setValue(e.target.value)} inputProps={{ "data-testid": "pick-select" }}>
              {options.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" disabled={busy || value === ""} onClick={() => onSubmit(value)}>
          Place
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * The ED status board: a row per bed (empty beds are Ready) plus the patients waiting
 * for a bed. ESI, status, MD, RN, resident, comments and registration are edited in place.
 * Opening a chart, transferring, discharging and admitting are handed to the page.
 */
export default function EDBoard({
  userRole,
  currentUserId = null,
  refreshKey = 0,
  previewData = null,
  previewView = null,
  selectedUserId = null,
  onSelectPatient,
  onOpenPatient,
  onTransfer,
  onDischarge,
  onAdmit,
}) {
  const [fetched, setData] = useState(null);
  const preview = !!previewData;
  const data = previewData || fetched;
  const [unit, setUnit] = useState("");
  const [pickedView, setPickedView] = useState(null);
  const [problem, setProblem] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [picking, setPicking] = useState(null); // { title, label, options, submit }
  const [busy, setBusy] = useState(false);
  const canEdit = !preview && FRONT_LINE.includes(userRole);

  const load = useCallback(async () => {
    if (preview) return;
    try {
      const headers = await authHeader();
      const res = await api.get(apiEndpoints.edBoard, { headers, params: unit ? { unit } : undefined });
      setData(res.data);
      setProblem("");
      if (!unit && res.data.unit) setUnit(res.data.unit);
    } catch (err) {
      setProblem(errorText(err, "Could not load the ED board."));
    }
  }, [unit, preview]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // live: reload and tick LOS every 30 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // the saved views are the clinic's; the built-in three are the fallback
  const views = useMemo(
    () => (data?.views?.length ? data.views : VIEWS.map((v) => ({ key: v.value, label: v.label, filter: v.value, columns: DEFAULT_COLUMNS, rules: [] }))),
    [data]
  );
  const viewKey = pickedView && views.some((v) => v.key === pickedView) ? pickedView : data?.default_view && views.some((v) => v.key === data.default_view) ? data.default_view : "all";
  const activeView = previewView || views.find((v) => v.key === viewKey) || views[0];
  const view = activeView?.filter || "all";
  const limitedBeds = activeView?.beds;
  const rows = useMemo(() => filterRows(data?.rows || [], view, currentUserId, limitedBeds), [data, view, currentUserId, limitedBeds]);
  const columns = useMemo(() => (activeView?.columns || DEFAULT_COLUMNS).filter((c) => c.visible !== false), [activeView]);
  const rules = activeView?.rules || [];

  const chooseView = async (key) => {
    setPickedView(key);
    if (preview) return;
    try {
      const headers = await authHeader();
      await api.patch(apiEndpoints.edBoardPreference, { view: key }, { headers });
    } catch (err) {
      // remembering the choice is only a convenience
    }
  };
  const overdueMinutes = data?.config?.vitals_overdue_minutes ?? 60;
  const statuses = data?.statuses || [];
  const staff = data?.staff || { nurses: [], doctors: [] };

  const save = async (visitId, body) => {
    try {
      const headers = await authHeader();
      const res = await api.patch(apiEndpoints.admissionBoard(visitId), body, { headers });
      setData((d) => ({
        ...d,
        rows: d.rows.map((r) => (r.visit && r.visit.registration === visitId ? { ...r, visit: res.data } : r)),
      }));
    } catch (err) {
      toast.error(errorText(err, "That change was not saved."));
      load();
    }
  };

  const place = async (visitId, bedId) => {
    setBusy(true);
    try {
      const headers = await authHeader();
      await api.post(apiEndpoints.admissionTransfer(visitId), { unit, bed: bedId }, { headers });
      toast.success("Patient placed");
      setPicking(null);
      await load();
    } catch (err) {
      toast.error(errorText(err, "That did not work."));
    } finally {
      setBusy(false);
    }
  };

  const patientLike = (row) => {
    const v = row.visit;
    const dept = (data?.departments || []).find((d) => d.id === data.unit);
    return {
      id: v.patient,
      user_id: v.user_id,
      full_name: v.name,
      current_visit: {
        id: v.registration,
        visit_number: v.visit_number,
        care_setting: "emergency",
        location: row.loc ? [dept?.facility_name, dept?.name, row.loc].filter(Boolean).join(" › ") : "",
        discharge_datetime: null,
      },
    };
  };

  // a click anywhere on an occupied row sets the patient in the header, except on the controls inside it
  const rowClicked = (e, row) => {
    if (e.target.closest("input, textarea, button, a, [role='combobox'], [role='option'], .MuiSelect-select, .MuiCheckbox-root")) return;
    onSelectPatient(patientLike(row));
  };

  const readyBeds = (data?.rows || []).filter((r) => r.type === "bed" && r.bed_status === "available");
  const waitingRows = (data?.rows || []).filter((r) => r.type === "waiting");

  const iconBtn = (label, icon, onClick, color) => (
    <Tooltip title={label}>
      <span>
        <IconButton size="small" aria-label={label} onClick={onClick} sx={{ color }}>
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );

  const compact = { fontSize: "0.8rem", "& .MuiSelect-select": { py: 0.25, fontSize: "0.8rem" } };

  const customCell = (col, v) => {
    if (!v) return "";
    const kind = col.kind || "text";
    const current = v.custom?.[col.key];
    const send = (value) => save(v.registration, { custom: { [col.key]: value } });
    if (kind === "checkbox") {
      return (
        <Checkbox
          size="small"
          checked={!!current}
          disabled={!canEdit}
          onChange={(e) => send(e.target.checked)}
          inputProps={{ "aria-label": `${col.label} for ${v.name}` }}
        />
      );
    }
    if (kind === "dropdown") {
      return (
        <Select
          size="small"
          displayEmpty
          value={current || ""}
          disabled={!canEdit}
          onChange={(e) => send(e.target.value)}
          sx={{ minWidth: 90, ...compact }}
          inputProps={{ "aria-label": `${col.label} for ${v.name}`, "data-testid": `custom-${col.key}-${v.registration}` }}
        >
          <MenuItem value="">&nbsp;</MenuItem>
          {(col.options || []).map((o) => (
            <MenuItem key={o} value={o}>
              {o}
            </MenuItem>
          ))}
        </Select>
      );
    }
    return canEdit ? (
      <TextField
        key={`${v.registration}-${current || ""}`}
        size="small"
        variant="standard"
        defaultValue={current || ""}
        onBlur={(e) => e.target.value !== (current || "") && send(e.target.value)}
        inputProps={{ "aria-label": `${col.label} for ${v.name}`, "data-testid": `custom-${col.key}-${v.registration}`, style: { fontSize: "0.8rem" } }}
      />
    ) : (
      current || ""
    );
  };

  const cell = (key, row, col) => {
    const v = row.visit;
    if (col?.type === "custom") return customCell(col, v);
    switch (key) {
      case "loc":
        return row.type === "waiting" ? <b>WAITING</b> : row.loc;
      case "los":
        return v ? formatLos(losMinutes(v.arrival_time, now)) : "";
      case "patient":
        return v ? (
          <Typography
            variant="body2"
            sx={{ fontWeight: 700, cursor: onOpenPatient ? "pointer" : "default", textDecoration: onOpenPatient ? "underline" : "none" }}
            onClick={() => onOpenPatient && onOpenPatient(patientLike(row))}
          >
            {v.name}
          </Typography>
        ) : (
          ""
        );
      case "age":
        return v && v.age != null ? `${v.age}y /${v.sex || "?"}` : "";
      case "reason":
        return v?.reason || "";
      case "complaint":
        return v?.complaint || "";
      case "esi":
        return v ? (
          <Select
            variant="standard"
            disableUnderline
            displayEmpty
            value={v.esi ?? ""}
            disabled={!canEdit}
            onChange={(e) => save(v.registration, { esi: e.target.value })}
            inputProps={{ "data-testid": `esi-${v.registration}`, "aria-label": `ESI for ${v.name}` }}
            sx={compact}
          >
            <MenuItem value="">-</MenuItem>
            {[1, 2, 3, 4, 5].map((n) => (
              <MenuItem key={n} value={n}>
                {n}
              </MenuItem>
            ))}
          </Select>
        ) : (
          ""
        );
      case "status":
        if (v) {
          return (
            <Select
              variant="standard"
              disableUnderline
              displayEmpty
              value={v.ed_status || ""}
              disabled={!canEdit}
              onChange={(e) => save(v.registration, { ed_status: e.target.value })}
              inputProps={{ "data-testid": `status-${v.registration}`, "aria-label": `Status for ${v.name}` }}
              sx={compact}
            >
              <MenuItem value="">-</MenuItem>
              {statuses.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.code}
                </MenuItem>
              ))}
            </Select>
          );
        }
        return BED_LABEL[row.bed_status] || "";
      case "md":
      case "rn": {
        if (!v) return "";
        const isMd = key === "md";
        const list = isMd ? staff.doctors : staff.nurses;
        const current = (isMd ? v.md : v.rn)?.id ?? "";
        return (
          <Select
            variant="standard"
            disableUnderline
            displayEmpty
            value={list.some((s) => s.id === current) ? current : ""}
            disabled={!canEdit}
            onChange={(e) => save(v.registration, isMd ? { attending_provider: e.target.value } : { assigned_nurse: e.target.value })}
            inputProps={{ "data-testid": `${key}-${v.registration}`, "aria-label": `${isMd ? "MD" : "RN"} for ${v.name}` }}
            sx={{ ...compact, minWidth: 110 }}
          >
            <MenuItem value="">-</MenuItem>
            {list.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        );
      }
      case "resident":
        return v ? (
          <TextField
            variant="standard"
            size="small"
            defaultValue={v.resident}
            key={`res-${v.registration}-${v.resident}`}
            disabled={!canEdit}
            onBlur={(e) => e.target.value !== v.resident && save(v.registration, { resident: e.target.value })}
            inputProps={{ maxLength: 120, "data-testid": `resident-${v.registration}`, "aria-label": `Resident for ${v.name}`, style: { fontSize: "0.8rem" } }}
            InputProps={{ disableUnderline: true }}
          />
        ) : (
          ""
        );
      case "comments":
        return v ? (
          <TextField
            variant="standard"
            size="small"
            fullWidth
            defaultValue={v.comments}
            key={`com-${v.registration}-${v.comments}`}
            disabled={!canEdit}
            onBlur={(e) => e.target.value !== v.comments && save(v.registration, { comments: e.target.value })}
            inputProps={{ maxLength: 300, "data-testid": `comments-${v.registration}`, "aria-label": `Comments for ${v.name}`, style: { fontSize: "0.8rem" } }}
            InputProps={{ disableUnderline: true }}
          />
        ) : (
          row.hold_reason || ""
        );
      case "vitals": {
        if (!v) return "";
        const vs = vitalsStatus(v, now, overdueMinutes);
        const text = vs.charted ? `${formatLos(vs.minutes)} ago` : "None yet";
        return vs.overdue ? (
          <Chip size="small" color="error" label={`Due · ${text}`} data-testid={`vitals-${v.registration}`} />
        ) : (
          <span data-testid={`vitals-${v.registration}`}>{text}</span>
        );
      }
      case "meds":
      case "lab":
      case "rad":
      case "urine":
      case "ekg":
      case "cardiac": {
        const state = v?.orders?.[key];
        if (!state) return "";
        const name = ORDER_ICON_COLUMNS[key];
        return (
          <Tooltip title={`${name} ${state === "done" ? "resulted" : "ordered"}`}>
            <Chip
              size="small"
              label={name[0]}
              color={state === "done" ? "success" : "warning"}
              aria-label={`${name} ${state === "done" ? "resulted" : "ordered"} for ${v.name}`}
              data-testid={`order-${key}-${v.registration}`}
            />
          </Tooltip>
        );
      }
      case "bed_status":
        return row.type === "bed" ? BED_LABEL[row.bed_status] || "Occupied" : "";
      case "inc_reg":
        return v && !v.registration_complete ? <Chip size="small" label="R" color="secondary" variant="outlined" data-testid={`inc-reg-${v.registration}`} /> : "";
      case "gender":
        return v ? ({ F: "Female", M: "Male", X: "Other" }[v.sex] || "") : "";
      case "reg_comp":
        return v ? (
          <Checkbox
            size="small"
            checked={!!v.registration_complete}
            disabled={!canEdit}
            onChange={(e) => save(v.registration, { registration_complete: e.target.checked })}
            inputProps={{ "aria-label": `Registration complete for ${v.name}` }}
          />
        ) : (
          ""
        );
      case "actions":
        if (!canEdit) return "";
        if (v) {
          const p = patientLike(row);
          return (
            <Box sx={{ display: "flex" }}>
              {row.type === "waiting" &&
                iconBtn(
                  `Assign bed to ${v.name}`,
                  <PersonAddIcon fontSize="small" />,
                  () =>
                    setPicking({
                      title: `Assign a bed to ${v.name}`,
                      label: "Ready bed",
                      options: readyBeds.map((b) => ({ value: b.bed, label: b.loc })),
                      submit: (bedId) => place(v.registration, bedId),
                    }),
                  "#00695c"
                )}
              {row.type === "bed" && onTransfer && iconBtn(`Transfer ${v.name}`, <SwapHorizIcon fontSize="small" />, () => onTransfer(p), "#0277bd")}
              {onAdmit && iconBtn(`Admit ${v.name}`, <HotelIcon fontSize="small" />, () => onAdmit(p), "#00695c")}
              {onDischarge && iconBtn(`Discharge ${v.name}`, <ExitToAppIcon fontSize="small" />, () => onDischarge(p), "#ef6c00")}
            </Box>
          );
        }
        if (row.bed_status === "available" && waitingRows.length > 0) {
          return iconBtn(
            `Place a patient in ${row.loc}`,
            <PersonAddIcon fontSize="small" />,
            () =>
              setPicking({
                title: `Place a patient in ${row.loc}`,
                label: "Waiting patient",
                options: waitingRows.map((w) => ({ value: w.visit.registration, label: w.visit.name })),
                submit: (visitId) => place(visitId, row.bed),
              }),
            "#00695c"
          );
        }
        return "";
      default:
        return "";
    }
  };

  if (!data && !problem) return <CircularProgress aria-label="Loading ED board" sx={{ m: 3 }} />;

  const noDepartments = data && data.departments.length === 0;

  return (
    <Box sx={{ p: 1.5 }} data-testid="ed-board">
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="ed-dept">Department</InputLabel>
          <Select labelId="ed-dept" label="Department" value={unit || data?.unit || ""} onChange={(e) => setUnit(e.target.value)} inputProps={{ "data-testid": "ed-department" }}>
            {(data?.departments || []).map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="ed-view">View</InputLabel>
          <Select labelId="ed-view" label="View" value={previewView ? "" : viewKey} displayEmpty={!!previewView} renderValue={previewView ? () => previewView.label || "Preview" : undefined} onChange={(e) => chooseView(e.target.value)} inputProps={{ "data-testid": "ed-view" }}>
            {views.map((v) => (
              <MenuItem key={v.key} value={v.key}>
                {v.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {problem && <Alert severity="error" sx={{ mb: 1 }}>{problem}</Alert>}
      {noDepartments && (
        <Typography color="text.secondary" data-testid="no-ed-departments">
          There are no emergency departments yet. An admin can add a unit of type Emergency in the Location Manager.
        </Typography>
      )}

      {data && !noDepartments && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell key={c.key} sx={{ fontWeight: 700, bgcolor: "#b0bec5", minWidth: c.width, whiteSpace: "nowrap" }}>
                    {c.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} sx={{ textAlign: "center", py: 3 }}>
                    {limitedBeds && limitedBeds.length > 0 && !(data?.rows || []).some((r) => r.type === "bed" && limitedBeds.includes(r.bed))
                      ? "None of this view's beds are in this department. Pick another department."
                      : view === "all" && !(limitedBeds && limitedBeds.length)
                      ? "No beds in this department yet."
                      : "Nobody matches this view."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row, i) => {
                const colors = ruleColors(rules, row.visit, now, overdueMinutes);
                const base = row.type === "waiting" ? ROW_COLORS.waiting : row.visit ? (i % 2 ? ROW_COLORS.occupiedB : ROW_COLORS.occupiedA) : ROW_COLORS[row.bed_status] || ROW_COLORS.available;
                const bg = colors.row || base;
                const selected = !!row.visit && selectedUserId != null && String(row.visit.user_id) === String(selectedUserId);
                const clickable = !!row.visit && !!onSelectPatient;
                return (
                  <TableRow
                    key={row.type === "waiting" ? `w${row.visit.registration}` : `b${row.bed}`}
                    data-testid={row.type === "waiting" ? `ed-waiting-${row.visit.registration}` : `ed-bed-${row.bed}`}
                    hover={clickable}
                    selected={selected}
                    aria-selected={clickable ? selected : undefined}
                    onClick={clickable ? (e) => rowClicked(e, row) : undefined}
                    sx={{ bgcolor: bg, cursor: clickable ? "pointer" : "default", outline: selected ? "2px solid #1976d2" : "none", outlineOffset: "-2px" }}
                  >
                    {columns.map((c) => {
                      let cellBg = colors.cells[c.key];
                      if (!cellBg && c.key === "age" && row.visit?.sex === "F") cellBg = "#f8bbd0";
                      if (!cellBg && c.key === "reg_comp" && row.visit && !row.visit.registration_complete) cellBg = "#e53935";
                      return (
                        <TableCell key={c.key} sx={{ py: 0.5, bgcolor: cellBg, fontSize: "0.85rem" }} data-testid={`cell-${c.key}-${row.type === "waiting" ? `w${row.visit.registration}` : `b${row.bed}`}`}>
                          {cell(c.key, row, c)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {picking && (
        <PickDialog title={picking.title} label={picking.label} options={picking.options} busy={busy} onClose={() => setPicking(null)} onSubmit={picking.submit} />
      )}
    </Box>
  );
}
