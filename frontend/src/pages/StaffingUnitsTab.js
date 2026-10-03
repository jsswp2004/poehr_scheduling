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
  Divider,
} from "@mui/material";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

const PATTERN_HELP = {
  "8h": "8-hour shifts: Day / Evening / Night",
  "12h": "12-hour shifts: Day / Night",
};

const today = () => new Date().toISOString().slice(0, 10);
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([fetchUnits(), fetchCensus()]);
      } catch (err) {
        setStatus({ ok: false, message: errText(err, "Failed to load units.") });
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchUnits, fetchCensus]);

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
      await Promise.all([fetchCensus(), fetchUnits()]);
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

  if (loading) {
    return <CircularProgress size={24} />;
  }

  return (
    <Box sx={{ maxWidth: 900 }}>
      {status && (
        <Alert severity={status.ok ? "success" : "error"} sx={{ mb: 1 }}>
          {status.message}
        </Alert>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>
        Daily Census
      </Typography>
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
            ? "No units yet. Add your first unit below."
            : "No units have been set up yet. Ask an admin to add them."}
        </Typography>
      ) : (
        <Table size="small" sx={{ mb: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>Unit</TableCell>
              <TableCell>Shifts</TableCell>
              <TableCell>Census on {date}</TableCell>
              <TableCell>Most recent entry</TableCell>
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
                <TableCell>
                  {u.latest_census
                    ? `${u.latest_census.census} on ${u.latest_census.date}`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Divider sx={{ mb: 1.5 }} />

      <Typography variant="h6" sx={{ mb: 1 }}>
        Units
      </Typography>
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

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Shift length</TableCell>
            <TableCell>Active</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {units.map((u) => (
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default StaffingUnitsTab;
