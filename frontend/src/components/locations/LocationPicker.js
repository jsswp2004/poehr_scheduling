import { useEffect, useState } from "react";
import { Box, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader } from "../patientHeader/headerApi";

/** The active location tree for pickers (facility > unit > room > bed). */
export function useLocationTree() {
  const [tree, setTree] = useState(null); // null = loading, [] = none built yet
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const headers = await authHeader();
        const res = await api.get(`${apiEndpoints.locationTree}?active=1`, { headers });
        if (live) setTree(res.data?.locations || []);
      } catch (err) {
        if (live) setTree([]);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return tree;
}

const CARE_LABEL = { outpatient: "Outpatient", inpatient: "Inpatient", emergency: "Emergency" };
const idOf = (v) => (v === "" || v == null ? "" : Number(v));

/**
 * Cascading Location > Unit > Room > Bed pick. `value` is {facility, unit, room, bed}
 * (ids or ""), `onChange` gets the new value plus the chosen unit's care_setting
 * ("ambulatory" | "acute" | "emergency" or "") so the caller can follow it.
 * `level="unit"` stops at the unit (appointments only need a unit).
 * Beds that are occupied, blocked or being cleaned are disabled unless already chosen.
 */
export default function LocationPicker({ tree, value, onChange, level = "bed", disabled = false }) {
  const v = { facility: "", unit: "", room: "", bed: "", ...(value || {}) };
  const facilities = tree || [];
  const facility = facilities.find((f) => f.id === idOf(v.facility));
  const unit = facility?.units.find((u) => u.id === idOf(v.unit));
  const room = unit?.rooms.find((r) => r.id === idOf(v.room));

  const emit = (patch) => {
    const next = { ...v, ...patch };
    const f = facilities.find((x) => x.id === idOf(next.facility));
    const u = f?.units.find((x) => x.id === idOf(next.unit));
    onChange(next, u ? u.care_setting : "");
  };

  if (tree === null) return <Typography variant="body2" color="text.secondary">Loading locations...</Typography>;
  if (!facilities.length) {
    return (
      <Typography variant="body2" color="text.secondary" data-testid="no-locations">
        No locations have been built yet. An admin can add them in the Location Manager.
      </Typography>
    );
  }

  const select = (label, key, items, onPick, extraDisabled) => (
    <FormControl size="small" fullWidth disabled={disabled || extraDisabled}>
      <InputLabel id={`loc-${key}`}>{label}</InputLabel>
      <Select
        labelId={`loc-${key}`}
        label={label}
        value={v[key] === "" ? "" : idOf(v[key])}
        onChange={(e) => onPick(e.target.value)}
        inputProps={{ "data-testid": `loc-${key}` }}
      >
        <MenuItem value="">Not specified</MenuItem>
        {items}
      </Select>
    </FormControl>
  );

  return (
    <Stack spacing={2} data-testid="location-picker">
      {select(
        "Location",
        "facility",
        facilities.map((f) => (
          <MenuItem key={f.id} value={f.id}>
            {f.name}
          </MenuItem>
        )),
        (id) => emit({ facility: id, unit: "", room: "", bed: "" })
      )}
      {select(
        "Unit",
        "unit",
        (facility?.units || []).map((u) => (
          <MenuItem key={u.id} value={u.id}>
            {u.name} <Box component="span" sx={{ ml: 1, color: "text.secondary" }}>{CARE_LABEL[u.care_type] || ""}</Box>
          </MenuItem>
        )),
        (id) => emit({ unit: id, room: "", bed: "" }),
        !facility
      )}
      {level === "bed" && (
        <>
          {select(
            "Room",
            "room",
            (unit?.rooms || []).map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.name}
              </MenuItem>
            )),
            (id) => emit({ room: id, bed: "" }),
            !unit
          )}
          {select(
            "Bed",
            "bed",
            (room?.beds || []).map((b) => {
              const taken = b.status !== "available" && b.id !== idOf(v.bed);
              return (
                <MenuItem key={b.id} value={b.id} disabled={taken}>
                  {b.name}
                  {b.status !== "available" ? ` (${b.status})` : ""}
                </MenuItem>
              );
            }),
            (id) => emit({ bed: id }),
            !room
          )}
        </>
      )}
    </Stack>
  );
}
