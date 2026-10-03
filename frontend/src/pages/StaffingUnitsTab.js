import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  Button,
  Stack,
  Alert,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

const PATTERN_HELP = {
  "8h": "8-hour shifts: Day / Evening / Night",
  "12h": "12-hour shifts: Day / Night",
};

const today = () => new Date().toISOString().slice(0, 10);
const PAGE_LIMIT = 20;
const fmtStamp = (iso) => (iso ? new Date(iso).toLocaleString() : "—");
const listOf = (res) => res.data.results || res.data || [];
const errText = (err, fallback) =>
  (err.response?.data && JSON.stringify(err.response.data)) || err.message || fallback;

function PatternToggle({ value, onChange, disabled }) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      disabled={disabled}
      onChange={(e, v) => v && onChange(v)}
    >
      <ToggleButton value="8h">8 hour</ToggleButton>
      <ToggleButton value="12h">12 hour</ToggleButton>
    </ToggleButtonGroup>
  );
}

/**
 * Units + daily census.
 * - Census entry is open to every staffing role (charge nurses enter it).
 * - Creating units and switching 8h/12h is admin only (the API enforces it).
 */
function StaffingUnitsTab({ isAdmin = false }) {
  const token = getAccessToken();
  const headers = getAuthHeaders(token);

  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  const [date, setDate] = useState(today);
  const [census, setCensus] = useState({}); // unitId -> string (what is in the box)
  const [saved, setSaved] = useState({}); // unitId -> string (what the server has)
  const [savingCensus, setSavingCensus] = useState(false);

  const [newName, setNewName] = useState("");
  const [newPattern, setNewPattern] = useState("8h");

  const [sub, setSub] = useState("census");
  const [history, setHistory] = useState([]); // last 20 census entries
  const [historyTotal, setHistoryTotal] = useState(0);
  const [editCensus, setEditCensus] = useState(null); // {id, unit_name, date, census, notes}
  const [deleteCensus, setDeleteCensus] = useState(null);
  const [editUnit, setEditUnit] = useState(null); // {id, name, shift_pattern}
  const [deleteUnit, setDeleteUnit] = useState(null); // {unit, error}
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const fetchUnits = useCallback(async () => {
    const res = await axios.get(apiEndpoints.staffingUnits, { headers });
    setUnits(listOf(res));
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
    setHistoryTotal(res.data.count ?? rows.length);
    setHistory(rows.slice(0, PAGE_LIMIT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([fetchUnits(), fetchCensus(), fetchHistory()]);
      } catch (err) {
        setStatus({ ok: false, message: errText(err, "Failed to load units.") });
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchUnits, fetchCensus, fetchHistory]);

  const activeUnits = units.filter((u) => u.is_active);
  const dirty = activeUnits.filter(
    (u) => (census[u.id] ?? "") !== (saved[u.id] ?? "") && (census[u.id] ?? "") !== ""
  );

  const saveCensus = async () => {
    setSavingCensus(true);
    setStatus(null);
    try {
      for (const u of dirty) {
        const n = Number(census[u.id]);
        if (!Number.isInteger(n) || n < 0) {
          throw new Error(`Census for ${u.name} must be a whole number, 0 or more.`);
        }
        await axios.post(
          apiEndpoints.staffingCensus,
          { unit: u.id, date, census: n },
          { headers }
        );
      }
      setStatus({ ok: true, message: `Census saved for ${dirty.length} unit(s).` });
      await Promise.all([fetchCensus(), fetchUnits(), fetchHistory()]);
    } catch (err) {
      setStatus({ ok: false, message: errText(err, "Failed to save census.") });
    } finally {
      setSavingCensus(false);
    }
  };

  const addUnit = async () => {
    if (!newName.trim()) {
      setStatus({ ok: false, message: "Enter a unit name." });
      return;
    }
    try {
      await axios.post(
        apiEndpoints.staffingUnits,
        { name: newName.trim(), shift_pattern: newPattern },
        { headers }
      );
      setNewName("");
      setStatus({ ok: true, message: "Unit added." });
      fetchUnits();
    } catch (err) {
      setStatus({ ok: false, message: errText(err, "Failed to add unit.") });
    }
  };

  const patchUnit = async (unit, changes) => {
    try {
      await axios.patch(apiEndpoints.staffingUnitDetail(unit.id), changes, { headers });
      fetchUnits();
    } catch (err) {
      setStatus({ ok: false, message: errText(err, "Failed to update unit.") });
    }
  };

  const closeDialogs = () => {
    setEditCensus(null);
    setDeleteCensus(null);
    setEditUnit(null);
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

  const saveUnitEdit = async () => {
    const name = (editUnit.name || "").trim();
    if (!name) {
      setDialogError("Name is required.");
      return;
    }
    setDialogBusy(true);
    try {
      await axios.patch(
        apiEndpoints.staffingUnitDetail(editUnit.id),
        { name, shift_pattern: editUnit.shift_pattern },
        { headers }
      );
      closeDialogs();
      setStatus({ ok: true, message: "Unit updated." });
      await Promise.all([fetchUnits(), fetchHistory()]);
    } catch (err) {
      setDialogError(errText(err, "Failed to update the unit."));
      setDialogBusy(false);
    }
  };

  const deactivateUnit = async () => {
    setDialogBusy(true);
    try {
      await axios.patch(
        apiEndpoints.staffingUnitDetail(deleteUnit.unit.id),
        { is_active: false },
        { headers }
      );
      closeDialogs();
      setStatus({ ok: true, message: "Unit deactivated." });
      fetchUnits();
    } catch (err) {
      setDialogError(errText(err, "Failed to deactivate the unit."));
      setDialogBusy(false);
    }
  };

  const confirmUnitDelete = async () => {
    setDialogBusy(true);
    try {
      await axios.delete(apiEndpoints.staffingUnitDetail(deleteUnit.unit.id), { headers });
      closeDialogs();
      setStatus({ ok: true, message: "Unit deleted." });
      await Promise.all([fetchUnits(), fetchHistory()]);
    } catch (err) {
      // The API refuses to delete a unit that has census history or coverage
      // rules, and says so; show that and leave Deactivate available.
      setDialogError(
        err.response?.data?.error || errText(err, "Failed to delete the unit.")
      );
      setDialogBusy(false);
    }
  };

  if (loading) {
    return <CircularProgress size={24} />;
  }

  const unitsRecent = units
    .slice()
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, PAGE_LIMIT);

  const actionIcons = (onEdit, onDelete, label) => (
    <>
      <Tooltip title={`Edit ${label}`}>
        <IconButton size="small" aria-label={`Edit ${label}`} onClick={onEdit}>
          <FontAwesomeIcon icon={faPen} size="xs" />
        </IconButton>
      </Tooltip>
      <Tooltip title={`Delete ${label}`}>
        <IconButton size="small" color="error" aria-label={`Delete ${label}`} onClick={onDelete}>
          <FontAwesomeIcon icon={faTrash} size="xs" />
        </IconButton>
      </Tooltip>
    </>
  );

  return (
    <Box sx={{ maxWidth: sub === "units" ? 900 : "none" }}>
      <Tabs
        value={sub}
        onChange={(e, v) => {
          setSub(v);
          setStatus(null);
        }}
        sx={{ mb: 1, minHeight: 36, "& .MuiTab-root": { minHeight: 36, py: 0.5 } }}
      >
        <Tab value="census" label="Daily Census" />
        <Tab value="units" label="Units" />
      </Tabs>

      {status && (
        <Alert severity={status.ok ? "success" : "error"} sx={{ mb: 1 }}>
          {status.message}
        </Alert>
      )}

      {sub === "census" && (
        <Box
          sx={{
            display: "grid",
            gap: 3,
            alignItems: "start",
            gridTemplateColumns: { xs: "1fr", md: "minmax(300px, 2fr) minmax(0, 3fr)" },
          }}
        >
          <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Enter the number of residents on each unit. HPPD staffing requirements
            use this number. If a day has no census entered, the most recent entry
            from the last 7 days is used and flagged on the compliance report.
          </Typography>

          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
            <TextField
              label="Date"
              type="date"
              size="small"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <Button
              variant="contained"
              onClick={saveCensus}
              disabled={savingCensus || dirty.length === 0}
            >
              {savingCensus ? "Saving..." : `Save census${dirty.length ? ` (${dirty.length})` : ""}`}
            </Button>
          </Stack>

          {activeUnits.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {isAdmin
                ? "No units yet. Add your first unit on the Units tab."
                : "No units have been set up yet. Ask an admin to add them."}
            </Typography>
          ) : (
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Unit</TableCell>
                  <TableCell>Shift</TableCell>
                  <TableCell>Census on {date}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeUnits.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.shift_pattern === "12h" ? "12 hour" : "8 hour"}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        inputProps={{ min: 0, step: 1 }}
                        value={census[u.id] ?? ""}
                        onChange={(e) =>
                          setCensus((c) => ({ ...c, [u.id]: e.target.value }))
                        }
                        sx={{ width: 110 }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          </Box>

          <Box sx={{ minWidth: 0, overflowX: "auto" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Census
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              last {PAGE_LIMIT}
              {historyTotal > PAGE_LIMIT ? ` of ${historyTotal}` : ""}
            </Typography>
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Unit</TableCell>
                <TableCell>Shift</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Census</TableCell>
                <TableCell>Most recent entry</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary">
                      No census entries yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {history.map((h) => {
                const unit = units.find((u) => u.id === h.unit);
                return (
                  <TableRow key={h.id}>
                    <TableCell>{h.unit_name || unit?.name || "—"}</TableCell>
                    <TableCell>
                      {unit ? (unit.shift_pattern === "12h" ? "12 hour" : "8 hour") : "—"}
                    </TableCell>
                    <TableCell>{h.date}</TableCell>
                    <TableCell>{h.census}</TableCell>
                    <TableCell>
                      {fmtStamp(h.updated_at || h.created_at)}
                      {h.entered_by_name ? ` · ${h.entered_by_name}` : ""}
                    </TableCell>
                    <TableCell align="right">
                      {actionIcons(
                        () => {
                          setDialogError("");
                          setEditCensus({
                            id: h.id,
                            unit_name: h.unit_name,
                            date: h.date,
                            census: String(h.census),
                            notes: h.notes || "",
                          });
                        },
                        () => {
                          setDialogError("");
                          setDeleteCensus(h);
                        },
                        "census entry"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </Box>
        </Box>
      )}

      {sub === "units" && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Each unit works either 8-hour shifts (Day / Evening / Night) or 12-hour
            shifts (Day / Night). This sets how many staff HPPD requires per shift.
          </Typography>

          {isAdmin && (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap">
              <TextField
                label="New unit name"
                size="small"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <PatternToggle value={newPattern} onChange={setNewPattern} />
              <Button variant="outlined" onClick={addUnit}>
                Add unit
              </Button>
            </Stack>
          )}

          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Last {PAGE_LIMIT} units{units.length > PAGE_LIMIT ? ` (of ${units.length})` : ""}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Shift length</TableCell>
                <TableCell>Active</TableCell>
                {isAdmin && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {unitsRecent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 4 : 3}>
                    <Typography variant="body2" color="text.secondary">
                      No units yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {unitsRecent.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <PatternToggle
                        value={u.shift_pattern}
                        onChange={(v) => patchUnit(u, { shift_pattern: v })}
                      />
                    ) : (
                      PATTERN_HELP[u.shift_pattern]
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={u.is_active}
                      disabled={!isAdmin}
                      onChange={(e) => patchUnit(u, { is_active: e.target.checked })}
                    />
                  </TableCell>
                  {isAdmin && (
                    <TableCell align="right">
                      {actionIcons(
                        () => {
                          setDialogError("");
                          setEditUnit({ id: u.id, name: u.name, shift_pattern: u.shift_pattern });
                        },
                        () => {
                          setDialogError("");
                          setDeleteUnit({ unit: u });
                        },
                        "unit"
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {/* Edit census entry */}
      <Dialog open={!!editCensus} onClose={closeDialogs} maxWidth="xs" fullWidth>
        <DialogTitle>Edit census entry</DialogTitle>
        <DialogContent>
          {editCensus && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {editCensus.unit_name} · {editCensus.date}
              </Typography>
              {dialogError && <Alert severity="error">{dialogError}</Alert>}
              <TextField
                label="Census"
                type="number"
                size="small"
                inputProps={{ min: 0, step: 1 }}
                value={editCensus.census}
                onChange={(e) => setEditCensus({ ...editCensus, census: e.target.value })}
                autoFocus
              />
              <TextField
                label="Notes"
                size="small"
                multiline
                minRows={2}
                value={editCensus.notes}
                onChange={(e) => setEditCensus({ ...editCensus, notes: e.target.value })}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialogs} disabled={dialogBusy}>Cancel</Button>
          <Button variant="contained" onClick={saveCensusEdit} disabled={dialogBusy}>
            {dialogBusy ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete census entry */}
      <Dialog open={!!deleteCensus} onClose={closeDialogs} maxWidth="xs" fullWidth>
        <DialogTitle>Delete census entry?</DialogTitle>
        <DialogContent>
          {deleteCensus && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              {dialogError && <Alert severity="error">{dialogError}</Alert>}
              <Typography variant="body2">
                This removes the census of {deleteCensus.census} for{" "}
                <strong>{deleteCensus.unit_name}</strong> on {deleteCensus.date}. Coverage
                for that day will use the most recent entry from the previous 7 days, or show
                as "No census" if there is none.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialogs} disabled={dialogBusy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmCensusDelete} disabled={dialogBusy}>
            {dialogBusy ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit unit */}
      <Dialog open={!!editUnit} onClose={closeDialogs} maxWidth="xs" fullWidth>
        <DialogTitle>Edit unit</DialogTitle>
        <DialogContent>
          {editUnit && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              {dialogError && <Alert severity="error">{dialogError}</Alert>}
              <TextField
                label="Unit name"
                size="small"
                value={editUnit.name}
                onChange={(e) => setEditUnit({ ...editUnit, name: e.target.value })}
                autoFocus
              />
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Shift length
                </Typography>
                <PatternToggle
                  value={editUnit.shift_pattern}
                  onChange={(v) => setEditUnit({ ...editUnit, shift_pattern: v })}
                />
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialogs} disabled={dialogBusy}>Cancel</Button>
          <Button variant="contained" onClick={saveUnitEdit} disabled={dialogBusy}>
            {dialogBusy ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete unit: deactivate is the safe default */}
      <Dialog open={!!deleteUnit} onClose={closeDialogs} maxWidth="xs" fullWidth>
        <DialogTitle>Delete unit?</DialogTitle>
        <DialogContent>
          {deleteUnit && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              {dialogError && <Alert severity="error">{dialogError}</Alert>}
              <Typography variant="body2">
                <strong>{deleteUnit.unit.name}</strong> can only be deleted if it has no
                census history and no coverage rules. Deleting is permanent. To keep the
                history and stop using the unit, deactivate it instead.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialogs} disabled={dialogBusy}>Cancel</Button>
          {deleteUnit?.unit.is_active && (
            <Button variant="contained" onClick={deactivateUnit} disabled={dialogBusy}>
              Deactivate instead
            </Button>
          )}
          <Button color="error" variant="outlined" onClick={confirmUnitDelete} disabled={dialogBusy}>
            Delete permanently
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StaffingUnitsTab;
