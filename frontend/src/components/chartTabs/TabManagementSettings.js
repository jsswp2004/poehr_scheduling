import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Switch,
  IconButton,
  Tooltip,
  Button,
  Stack,
  TextField,
  MenuItem,
  FormControlLabel,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "../patientHeader/headerApi";
import { applyToFacilities, isAllFacilities } from "../../utils/facilityScope";
import { CARE_SETTINGS } from "../patients/CareSettingSidebar";
import { CHART_TABS } from "../patients/PatientChartTabs";

// Gives each switch a spoken name ("Show Orders") without drawing any extra text.
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const snapshot = (items, defaultTab) => JSON.stringify([items.map((i) => [i.key, i.visible]), defaultTab || ""]);

/**
 * One editable tab list: a switch and arrows per tab, and the tab that opens first.
 * `inheritLabel`, when given, adds a "use the clinic's choice" option to the opening-tab picker.
 */
function TabEditor({ title, description, initialItems, initialDefault, readOnly, inheritLabel, saveLabel, resetLabel, canReset, onSave, onReset, testId }) {
  const [items, setItems] = useState(initialItems);
  const [defaultTab, setDefaultTab] = useState(initialDefault || "");
  const [busy, setBusy] = useState(false);
  const [saved] = useState(snapshot(initialItems, initialDefault));
  const dirty = snapshot(items, defaultTab) !== saved;
  const shown = items.filter((i) => i.visible);

  const toggle = (key) => {
    const next = items.map((i) => (i.key === key ? { ...i, visible: !i.visible } : i));
    setItems(next);
    // a hidden tab cannot be the one that opens first
    if (defaultTab === key) setDefaultTab(inheritLabel ? "" : "patient_list");
  };
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  };
  const run = async (fn, okMessage) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMessage);
    } catch (err) {
      toast.error(errorText(err, "Could not save the tabs."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box data-testid={testId}>
      <Typography variant="h6">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {description}
      </Typography>

      <Paper variant="outlined" sx={{ mb: 1.5, p: 1.5, bgcolor: "#f7fbff" }} data-testid={`${testId}-preview`}>
        <Typography variant="caption" color="text.secondary">
          Tabs, in order
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {shown.map((i) => i.label).join("  ·  ")}
        </Typography>
      </Paper>

      <Stack spacing={1}>
        {items.map((item, index) => (
          <Paper key={item.key} variant="outlined" sx={{ p: 1, display: "flex", alignItems: "center", gap: 1, opacity: item.visible ? 1 : 0.65 }} data-testid={`${testId}-row-${item.key}`}>
            <FormControlLabel
              sx={{ m: 0 }}
              control={<Switch checked={item.visible} onChange={() => toggle(item.key)} disabled={readOnly || item.locked} />}
              label={<span style={VISUALLY_HIDDEN}>{`Show ${item.label}`}</span>}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {item.label}
              </Typography>
              {item.locked && (
                <Typography variant="caption" color="text.secondary">
                  Always shown. It is how you choose a patient.
                </Typography>
              )}
            </Box>
            <Tooltip title="Move up">
              <span>
                <IconButton size="small" disabled={readOnly || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${item.label} up`}>
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Move down">
              <span>
                <IconButton size="small" disabled={readOnly || index === items.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${item.label} down`}>
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Paper>
        ))}
      </Stack>

      <TextField
        select
        size="small"
        label="Opens first"
        value={defaultTab}
        onChange={(e) => setDefaultTab(e.target.value)}
        disabled={readOnly}
        sx={{ mt: 2, minWidth: 280 }}
        inputProps={{ "data-testid": `${testId}-opens-first` }}
      >
        {inheritLabel && <MenuItem value="">{inheritLabel}</MenuItem>}
        {shown.map((i) => (
          <MenuItem key={i.key} value={i.key}>
            {i.label}
          </MenuItem>
        ))}
      </TextField>

      {!readOnly && (
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button
            variant="contained"
            disabled={!dirty || busy}
            onClick={() =>
              run(async () => {
                await onSave(items.map((i) => ({ key: i.key, visible: i.visible })), defaultTab);
              }, "Tabs saved.")
            }
          >
            {busy ? "Saving..." : saveLabel}
          </Button>
          <Button disabled={!canReset || busy} onClick={() => run(onReset, "Tabs reset.")}>
            {resetLabel}
          </Button>
        </Stack>
      )}
    </Box>
  );
}

/**
 * Settings > Tab Management. Each person arranges their own chart tabs for every module.
 * An administrator also sets the clinic's default tabs, which are what people start from
 * and the most they can switch on.
 */
function TabManagementSettings() {
  const [care, setCare] = useState("ambulatory");
  const [mine, setMine] = useState(null);
  const [canEditDefaults, setCanEditDefaults] = useState(false);
  const [defaults, setDefaults] = useState(null);
  const [problem, setProblem] = useState("");
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const headers = await authHeader();
      const res = await api.get(apiEndpoints.chartTabs, { headers });
      setMine(res.data.settings);
      setCanEditDefaults(!!res.data.can_edit_defaults);
      setProblem("");
      if (res.data.can_edit_defaults) {
        try {
          const d = await api.get(apiEndpoints.chartTabsDefaults, { headers });
          setDefaults(d.data.settings);
        } catch (err) {
          setDefaults(null);
          setProblem(errorText(err, "Could not load the clinic defaults."));
        }
      }
    } catch (err) {
      setProblem(errorText(err, "Could not load the tab settings."));
      setMine({});
    }
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (mine === null) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const mineHere = mine[care];
  const defaultsHere = defaults && defaults[care];
  const labelOf = (key) => {
    const found = (mineHere?.items || []).find((i) => i.key === key) || (defaultsHere?.items || []).find((i) => i.key === key);
    return found ? found.label : (CHART_TABS.find((t) => t.value === key) || {}).label || key;
  };

  const saveMine = async (items, defaultTab) => {
    const headers = await authHeader();
    await api.put(apiEndpoints.chartTabsMine, { care_setting: care, items, default_tab: defaultTab }, { headers });
    await load();
  };
  const resetMine = async () => {
    const headers = await authHeader();
    await api.delete(`${apiEndpoints.chartTabsMine}?care_setting=${care}`, { headers });
    await load();
  };
  const saveDefaults = async (items, defaultTab) => {
    await applyToFacilities(async () =>
      api.put(apiEndpoints.chartTabsDefaults, { care_setting: care, items, default_tab: defaultTab || "patient_list" }, { headers: await authHeader() })
    );
    await load();
  };
  const resetDefaults = async () => {
    await applyToFacilities(async () => api.delete(`${apiEndpoints.chartTabsDefaults}?care_setting=${care}`, { headers: await authHeader() }));
    await load();
  };

  return (
    <Box sx={{ p: 2, maxWidth: 760 }}>
      <Typography variant="h6">Tab management</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose which chart tabs you see, their order, and which one opens first. Each module (Ambulatory, Emergency, Acute) has its own set.
      </Typography>

      {problem && <Alert severity="warning" sx={{ mb: 2 }}>{problem}</Alert>}

      <ToggleButtonGroup exclusive size="small" value={care} onChange={(e, v) => v && setCare(v)} aria-label="Module" sx={{ mb: 3 }}>
        {CARE_SETTINGS.map((c) => (
          <ToggleButton key={c.key} value={c.key} data-testid={`tabs-module-${c.key}`}>
            {c.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {mineHere && !isAllFacilities() && (
        <TabEditor
          key={`mine-${care}-${version}`}
          testId="my-tabs"
          title="My tabs"
          description="Only you see this arrangement. Tabs your clinic has turned off for this module are not listed."
          initialItems={mineHere.items}
          initialDefault={mineHere.my_default_tab}
          inheritLabel={`Clinic default (${labelOf(mineHere.org_default_tab)})`}
          saveLabel="Save my tabs"
          resetLabel="Reset to clinic default"
          canReset={mineHere.customized}
          onSave={saveMine}
          onReset={resetMine}
        />
      )}

      {canEditDefaults && defaultsHere && (
        <>
          <Divider sx={{ my: 4 }} />
          <TabEditor
            key={`org-${care}-${version}`}
            testId="clinic-tabs"
            title="Clinic default"
            description="What everyone in your clinic starts with for this module. A tab switched off here is not available to anyone, and people who have not arranged their own tabs get exactly this list."
            initialItems={defaultsHere.items}
            initialDefault={defaultsHere.default_tab}
            saveLabel="Save clinic default"
            resetLabel="Reset to built-in"
            canReset={defaultsHere.customized}
            onSave={saveDefaults}
            onReset={resetDefaults}
          />
        </>
      )}
    </Box>
  );
}

export default TabManagementSettings;
