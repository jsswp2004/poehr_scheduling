import { useEffect, useState } from "react";
import { Alert, Box, CircularProgress, Divider, FormControl, InputLabel, ListSubheader, MenuItem, Select, Typography } from "@mui/material";
import { jwtDecode } from "jwt-decode";
import { api } from "../../api/client";
import { getValidToken } from "../../utils/auth";
import { authHeader } from "../patientHeader/headerApi";
import SettingsToolbarPortal from "../settings/SettingsToolbarSlot";
import { chooseActingOrg, ownOrgIdFromToken, useActingOrg } from "../../utils/actingOrg";
import { ALL, chooseFacility, configureFacilityScope, resetFacilityScope, useFacilityScope } from "../../utils/facilityScope";

const roleOf = async () => {
  try {
    const token = await getValidToken();
    const raw = token && (token.access_token || token);
    return raw ? jwtDecode(raw).role || "" : "";
  } catch (err) {
    return "";
  }
};

/**
 * "Which facility am I changing?" for system administrators. Everything inside `children` acts for
 * the facility chosen here, or for all of them. Other roles see their own settings, no picker.
 */
export default function FacilityPicker({ children }) {
  const scope = useFacilityScope();
  const acting = useActingOrg();
  const actingId = acting?.id || "";
  const [role, setRole] = useState(null);
  const [problem, setProblem] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await roleOf();
      if (cancelled) return;
      setRole(r);
      if (r !== "system_admin") {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get("/api/users/organizations/", { headers: await authHeader() });
        if (cancelled) return;
        const list = (Array.isArray(res.data) ? res.data : res.data?.results || []).map((o) => ({ id: o.id, name: o.name }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        configureFacilityScope(list);
      } catch (err) {
        if (!cancelled) setProblem("Could not load the list of facilities.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      resetFacilityScope(); // leaving Settings: later requests go back to normal
    };
  }, []);

  // The header's organization choice drives this picker (and the picker updates the header), so the two never disagree.
  // "All facilities" is the one choice that exists only here; picking an organization in the header leaves it.
  useEffect(() => {
    if (role !== "system_admin" || loading || scope.facilities.length === 0) return;
    const want = actingId || ownOrgIdFromToken();
    if (want && scope.choice !== want) chooseFacility(String(want));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, loading, actingId, scope.facilities.length]);

  const onPick = async (value) => {
    if (value === ALL) {
      chooseFacility(ALL);
      return;
    }
    const facility = scope.facilities.find((f) => String(f.id) === String(value));
    if (!facility) return;
    try {
      await chooseActingOrg({ id: facility.id, name: facility.name }, "header");
      chooseFacility(String(value));
    } catch (err) {
      setProblem("Could not switch organization.");
    }
  };

  if (role === null || loading) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <CircularProgress size={26} />
      </Box>
    );
  }
  if (role !== "system_admin") return children;

  const { facilities, choice } = scope;
  const first = facilities[0];

  return (
    <Box>
      <SettingsToolbarPortal>
      <Box sx={{ width: "100%", pb: 0.5, display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 320 }}>
          <InputLabel id="facility-picker-label">Facility</InputLabel>
          <Select
            labelId="facility-picker-label"
            label="Facility"
            data-testid="facility-picker"
            value={choice}
            displayEmpty
            onChange={(e) => onPick(e.target.value)}
            renderValue={(v) => (v === ALL ? "All facilities (system-wide)" : facilities.find((f) => String(f.id) === String(v))?.name || "Choose a facility")}
          >
            <ListSubheader>Change one facility</ListSubheader>
            {facilities.map((f) => (
              <MenuItem key={f.id} value={String(f.id)}>
                {f.name}
              </MenuItem>
            ))}
            <Divider />
            <ListSubheader>Change every facility</ListSubheader>
            <MenuItem value={ALL} disabled={facilities.length === 0}>
              All facilities (system-wide)
            </MenuItem>
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          Settings below apply to the facility you choose here, the same one chosen in the header.
        </Typography>
      </Box>

      {problem && (
        <Alert severity="error" sx={{ py: 0 }}>
          {problem}
        </Alert>
      )}
      {choice === ALL && (
        <Alert severity="warning" sx={{ py: 0 }} data-testid="all-facilities-note">
          System-wide: what you save is copied to all {facilities.length} facilities, replacing what each one has now. The values shown start from {first?.name}.
        </Alert>
      )}
      {!choice && !problem && (
        <Alert severity="info" sx={{ py: 0 }} data-testid="choose-facility-note">
          Choose a facility (or All facilities) to begin.
        </Alert>
      )}

      </Box>
      </SettingsToolbarPortal>
      {choice && <Box key={choice}>{children}</Box>}
    </Box>
  );
}
