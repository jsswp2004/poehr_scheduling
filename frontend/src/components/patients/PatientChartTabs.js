import { Box, Tabs, Tab, Typography } from "@mui/material";

/**
 * The chart tab strip under the patient header on the Patients page.
 * `clinical` tabs need a doctor, nurse or admin (the same roles the server lets into
 * Orders, Results, Documents and Flowsheets); everyone else sees the rest.
 */
export const CHART_TABS = [
  { value: "patient_list", label: "Patient List", clinical: false },
  { value: "orders", label: "Orders", clinical: true },
  { value: "prescriptions", label: "Prescriptions", clinical: true },
  { value: "results", label: "Results", clinical: true },
  { value: "patient_info", label: "Patient Info", clinical: false },
  { value: "documents", label: "Documents", clinical: true },
  { value: "flowsheets", label: "Flowsheets", clinical: true },
  { value: "my_schedule", label: "My Schedule", clinical: false },
  { value: "referral_list", label: "Referral List", clinical: false },
  { value: "task_list", label: "Task List", clinical: true },
  { value: "clinical_summary", label: "Clinical Summary", clinical: true },
];

// Tabs that have no page behind them yet (none at the moment: every chart tab has its page).
export const COMING_SOON = {};

export const CLINICAL_ROLES = ["doctor", "nurse", "admin", "system_admin"];

/**
 * The tabs this role may see. `keys`, when given, is the clinic's and the person's own list for
 * the current module: only those tabs, in that order. The Patient List is always kept, since it
 * is how a patient gets chosen.
 */
export function visibleChartTabs(role, keys = null) {
  const clinical = CLINICAL_ROLES.includes(role);
  const allowed = CHART_TABS.filter((t) => !t.clinical || clinical);
  if (!Array.isArray(keys) || keys.length === 0) return allowed;
  const byKey = Object.fromEntries(allowed.map((t) => [t.value, t]));
  const ordered = keys.map((k) => byKey[k]).filter(Boolean);
  if (!ordered.some((t) => t.value === "patient_list")) ordered.unshift(byKey.patient_list);
  return ordered;
}

export function PatientChartTabs({ value, onChange, role, right = null, listLabel = null, keys = null }) {
  const tabs = visibleChartTabs(role, keys);
  const current = tabs.some((t) => t.value === value) ? value : "patient_list";
  return (
    <Box sx={{ flexShrink: 0, mb: 0.5, borderBottom: 1, borderColor: "divider", bgcolor: "#f5faff", display: "flex", alignItems: "center" }}>
      <Tabs
        value={current}
        onChange={(e, v) => onChange(v)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Patient chart"
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 36,
          "& .MuiTab-root": { minHeight: 36, py: 0.5, textTransform: "none", fontSize: "0.9rem" },
        }}
      >
        {tabs.map((t) => (
          <Tab key={t.value} value={t.value} label={t.value === "patient_list" && listLabel ? listLabel : t.label} data-testid={`chart-tab-${t.value}`} />
        ))}
      </Tabs>
      {right}
    </Box>
  );
}

/** Shown for the chart tabs that are planned but not built yet. */
export function ComingSoonPanel({ title, patient }) {
  return (
    <Box sx={{ p: 3 }} data-testid="coming-soon-panel">
      <Typography variant="h6" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Coming soon.{patient ? ` This tab will show ${title.toLowerCase()} for ${patient.name}.` : ""}
      </Typography>
    </Box>
  );
}

/** Shown on a tab that needs a patient when none is selected. */
export function SelectPatientPrompt() {
  return (
    <Box sx={{ p: 3 }} data-testid="select-patient-prompt">
      <Typography variant="body1" color="text.secondary">
        Select a patient from the Patient List to see this tab.
      </Typography>
    </Box>
  );
}
