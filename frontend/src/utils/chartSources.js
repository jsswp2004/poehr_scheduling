// The parts of a patient's chart a note field can show, read-only. Mirrors SOURCES in
// appointments/chart_data.py: the key is what a "Chart data" field stores in calc.source.
export const CHART_SOURCES = [
  { value: "problems", label: "Problem list" },
  { value: "allergies", label: "Allergies" },
  { value: "medications", label: "Outpatient medications" },
  { value: "labs", label: "Laboratory results" },
  { value: "vitals", label: "Latest vital signs" },
  { value: "immunizations", label: "Immunizations given" },
  { value: "health_manager", label: "Health Manager (due and overdue)" },
  { value: "inpatient_meds", label: "Active medication orders" },
  { value: "intake_output", label: "Intake and output (24 hours)" },
];

export const chartSourceLabel = (value) => (CHART_SOURCES.find((s) => s.value === value) || {}).label || value || "";
