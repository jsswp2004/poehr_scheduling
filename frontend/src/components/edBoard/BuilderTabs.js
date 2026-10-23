import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

export const ALWAYS_VISIBLE = ["loc", "patient", "actions"];
/** A follow-up board has no bed, so only the patient's name has to stay. */
export const alwaysVisible = (kind) => (kind === "follow_up" ? ["patient"] : ALWAYS_VISIBLE);
const FOLLOW_UP_ONLY = ["discharged", "new_results"];
const KINDS = [
  { value: "text", label: "Text" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

/** "Isolation type" -> "c_isolation_type", unique among the existing keys. */
export const customKey = (name, existing) => {
  const body = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 27).replace(/_+$/, "") || "column";
  const base = `c_${body}`;
  let key = base;
  let n = 2;
  while (existing.includes(key)) {
    const suffix = `_${n++}`;
    key = base.slice(0, 30 - suffix.length) + suffix;
  }
  return key;
};

const move = (list, index, by) => {
  const target = index + by;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
};

const iconBtn = (label, icon, onClick, disabled) => (
  <Tooltip title={label}>
    <span>
      <IconButton size="small" aria-label={label} onClick={onClick} disabled={disabled}>
        {icon}
      </IconButton>
    </span>
  </Tooltip>
);

/* ---------------------------------------------------------------- Columns */

/** Show/hide, rename, resize and reorder the columns of one view. Custom columns are defined under Shared settings. */
export function ColumnsTab({ config, onChange }) {
  const columns = config.columns;
  const pinned = alwaysVisible(config.kind);
  const set = (index, patch) => onChange({ ...config, columns: columns.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Choose what this view shows and in what order. Columns you add under Shared settings appear here, hidden, ready to switch on.
      </Typography>
      <Table size="small" aria-label="View columns">
        <TableHead>
          <TableRow>
            <TableCell>Show</TableCell>
            <TableCell>Column name</TableCell>
            <TableCell>Width</TableCell>
            <TableCell>Kind</TableCell>
            <TableCell align="right">Order</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {columns.map((c, i) => (
            <TableRow key={c.key} data-testid={`col-row-${c.key}`}>
              <TableCell>
                <Checkbox
                  size="small"
                  checked={c.visible !== false}
                  disabled={pinned.includes(c.key)}
                  onChange={(e) => set(i, { visible: e.target.checked })}
                  inputProps={{ "aria-label": `Show ${c.label || c.key}` }}
                />
              </TableCell>
              <TableCell>
                <TextField size="small" variant="standard" value={c.label} onChange={(e) => set(i, { label: e.target.value })} inputProps={{ "aria-label": `Name of ${c.key}`, maxLength: 40 }} />
              </TableCell>
              <TableCell>
                <TextField
                  size="small"
                  variant="standard"
                  type="number"
                  value={c.width}
                  onChange={(e) => set(i, { width: Number(e.target.value) })}
                  inputProps={{ "aria-label": `Width of ${c.label || c.key}`, min: 40, max: 600, style: { width: 64 } }}
                />
              </TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" label={c.type === "custom" ? KINDS.find((k) => k.value === c.kind)?.label || "Text" : FOLLOW_UP_ONLY.includes(c.key) ? "Follow-up" : "Built in"} />
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                {iconBtn(`Move ${c.label || c.key} up`, <ArrowUpwardIcon fontSize="small" />, () => onChange({ ...config, columns: move(columns, i, -1) }), i === 0)}
                {iconBtn(`Move ${c.label || c.key} down`, <ArrowDownwardIcon fontSize="small" />, () => onChange({ ...config, columns: move(columns, i, 1) }), i === columns.length - 1)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/* ----------------------------------------------------------- Patients shown */

export const FILTER_CHOICES = [
  { value: "all", label: "Everyone on the board" },
  { value: "waiting", label: "Waiting Area (everyone in the ED without a bed)" },
  { value: "mine", label: "Only the signed-in person's patients" },
];

/** Limit a view to chosen beds: pick a location, then a unit, then tick its beds. */
function BedPicker({ beds, locations, onChange }) {
  const [facilityId, setFacilityId] = useState("");
  const [unitId, setUnitId] = useState("");
  const facility = locations.find((f) => String(f.id) === facilityId);
  const unit = facility?.units.find((u) => String(u.id) === unitId);
  const names = {};
  for (const f of locations) for (const u of f.units) for (const b of u.beds) names[b.id] = `${u.name} ${b.name}`;
  const toggle = (id) => onChange(beds.includes(id) ? beds.filter((b) => b !== id) : [...beds, id]);
  const unitIds = unit ? unit.beds.map((b) => b.id) : [];
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Beds this view covers
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Leave empty to show every bed in the department. Pick beds to make a view for just those, such as Fast Track.
      </Typography>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", rowGap: 1.5, mb: 1.5 }}>
        <TextField select size="small" label="Location" value={facilityId} onChange={(e) => { setFacilityId(e.target.value); setUnitId(""); }} sx={{ minWidth: 220 }} inputProps={{ "data-testid": "bed-location" }}>
          {locations.map((f) => (
            <MenuItem key={f.id} value={String(f.id)}>
              {f.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Unit" value={unitId} disabled={!facility} onChange={(e) => setUnitId(e.target.value)} sx={{ minWidth: 220 }} inputProps={{ "data-testid": "bed-unit" }}>
          {(facility?.units || []).map((u) => (
            <MenuItem key={u.id} value={String(u.id)}>
              {u.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {unit && (
        <Box sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
            <Button size="small" onClick={() => onChange([...beds, ...unitIds.filter((id) => !beds.includes(id))])}>
              Select all in {unit.name}
            </Button>
            <Button size="small" color="inherit" onClick={() => onChange(beds.filter((id) => !unitIds.includes(id)))}>
              Clear {unit.name}
            </Button>
          </Stack>
          <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2 }}>
            {unit.beds.map((b) => (
              <FormControlLabel key={b.id} control={<Checkbox size="small" checked={beds.includes(b.id)} onChange={() => toggle(b.id)} />} label={b.name} />
            ))}
          </Box>
        </Box>
      )}
      <Box data-testid="bed-summary">
        {beds.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Every bed in the department
          </Typography>
        ) : (
          <>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {beds.length} bed{beds.length === 1 ? "" : "s"} chosen
            </Typography>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
              {beds.map((id) => (
                <Chip key={id} size="small" label={names[id] || `Bed ${id}`} onDelete={() => toggle(id)} />
              ))}
            </Stack>
            <Button size="small" sx={{ mt: 1 }} onClick={() => onChange([])}>
              Clear all beds
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}

/* ------------------------------------------------------- Conditions on the patient */

export const CONDITION_FIELDS = [
  { value: "age", label: "Age" },
  { value: "esi", label: "ESI (triage level)" },
  { value: "ed_status", label: "Status" },
  { value: "sex", label: "Gender" },
  { value: "md", label: "MD" },
  { value: "rn", label: "RN" },
  { value: "complaint", label: "Chief complaint" },
];
const AGE_OPS = [
  { value: "lt", label: "under" },
  { value: "lte", label: "up to" },
  { value: "gt", label: "over" },
  { value: "gte", label: "at least" },
];
const AGE_UNITS = [
  { value: "years", label: "years" },
  { value: "months", label: "months" },
  { value: "days", label: "days" },
];
const SEX_CHOICES = [
  { value: "F", label: "Female" },
  { value: "M", label: "Male" },
  { value: "X", label: "Other" },
];

/** A fresh condition for a field, with a sensible starting value. */
export const newCondition = (field, settings) => {
  switch (field) {
    case "age":
      return { field, op: "lt", value: 18, unit: "years" };
    case "esi":
      return { field, op: "in", value: [1, 2] };
    case "ed_status":
      return { field, op: "in", value: settings?.statuses?.[0] ? [settings.statuses[0].value] : [] };
    case "sex":
      return { field, op: "in", value: ["F"] };
    case "complaint":
      return { field, op: "contains", value: "" };
    default:
      return { field, op: "in", value: [] };
  }
};

/** A condition the server will accept: it has a number, a choice or some text to look for. */
export const conditionComplete = (c) => {
  if (c.field === "age") return c.value !== "" && c.value != null && Number.isInteger(Number(c.value)) && Number(c.value) >= 0 && Number(c.value) <= 150;
  if (c.field === "complaint") return String(c.value || "").trim() !== "";
  return Array.isArray(c.value) && c.value.length > 0;
};

export const criteriaComplete = (criteria) => (criteria?.conditions || []).every(conditionComplete);

const PRESETS = [
  { id: "children", label: "Children (under 18)", make: () => ({ field: "age", op: "lt", value: 18, unit: "years" }) },
  { id: "adults", label: "Adults (18 and over)", make: () => ({ field: "age", op: "gte", value: 18, unit: "years" }) },
  { id: "esi12", label: "Triage level 1 or 2", make: () => ({ field: "esi", op: "in", value: [1, 2] }) },
];

/** Conditions on the patient: "all of" or "any of" a list of age, triage level, status, gender, staff and complaint tests. */
export function ConditionsEditor({ config, settings, people, onChange }) {
  const criteria = config.criteria || { match: "all", conditions: [] };
  const conditions = criteria.conditions || [];
  const set = (next) => onChange({ ...config, criteria: { ...criteria, ...next } });
  const update = (i, patch) => set({ conditions: conditions.map((c, n) => (n === i ? { ...c, ...patch } : c)) });
  const choices = (field) => {
    if (field === "esi") return [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `ESI ${n}` }));
    if (field === "sex") return SEX_CHOICES;
    if (field === "ed_status") return (settings?.statuses || []).map((s) => ({ value: s.value, label: `${s.code} · ${s.label}` }));
    const list = field === "md" ? people?.doctors : people?.nurses;
    return (list || []).map((p) => ({ value: p.id, label: p.name }));
  };
  return (
    <Box data-testid="conditions-editor">
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5, flexWrap: "wrap", rowGap: 1 }}>
        <Typography variant="subtitle2">Then keep patients who match</Typography>
        <TextField select size="small" value={criteria.match || "all"} onChange={(e) => set({ match: e.target.value })} sx={{ width: 90 }} inputProps={{ "data-testid": "match-mode", "aria-label": "Match all or any" }}>
          <MenuItem value="all">all</MenuItem>
          <MenuItem value="any">any</MenuItem>
        </TextField>
        <Typography variant="body2">of these conditions</Typography>
      </Stack>
      {conditions.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }} data-testid="no-conditions">
          No conditions: everyone who passes the choice above is listed. Add one to make a view such as a Peds board.
        </Typography>
      )}
      {conditions.map((c, i) => {
        const listField = c.field !== "age" && c.field !== "complaint"; // only these hold a list of choices
        const options = listField ? choices(c.field) : [];
        const picked = listField && Array.isArray(c.value) ? options.filter((o) => c.value.includes(o.value)) : [];
        return (
          <Paper key={i} variant="outlined" sx={{ p: 1.25, mb: 1, display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }} data-testid={`condition-${i}`}>
            <TextField
              select
              size="small"
              label="Field"
              value={c.field}
              onChange={(e) => onChange({ ...config, criteria: { ...criteria, conditions: conditions.map((x, n) => (n === i ? newCondition(e.target.value, settings) : x)) } })}
              sx={{ width: 170 }}
              inputProps={{ "data-testid": `cond-field-${i}` }}
            >
              {CONDITION_FIELDS.map((f) => (
                <MenuItem key={f.value} value={f.value}>
                  {f.label}
                </MenuItem>
              ))}
            </TextField>
            {c.field === "age" && (
              <>
                <TextField select size="small" label="Is" value={c.op} onChange={(e) => update(i, { op: e.target.value })} sx={{ width: 130 }} inputProps={{ "data-testid": `cond-op-${i}` }}>
                  {AGE_OPS.map((o) => (
                    <MenuItem key={o.value} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  label="Age"
                  type="number"
                  value={c.value}
                  onChange={(e) => update(i, { value: e.target.value === "" ? "" : Number(e.target.value) })}
                  sx={{ width: 100 }}
                  inputProps={{ min: 0, max: 150, "data-testid": `cond-value-${i}` }}
                />
                <TextField select size="small" label="Unit" value={c.unit || "years"} onChange={(e) => update(i, { unit: e.target.value })} sx={{ width: 120 }} inputProps={{ "data-testid": `cond-unit-${i}` }}>
                  {AGE_UNITS.map((o) => (
                    <MenuItem key={o.value} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))}
                </TextField>
              </>
            )}
            {c.field === "complaint" && (
              <TextField
                size="small"
                label="Chief complaint contains"
                value={c.value}
                onChange={(e) => update(i, { value: e.target.value })}
                sx={{ width: 280 }}
                inputProps={{ maxLength: 80, "data-testid": `cond-value-${i}` }}
              />
            )}
            {c.field !== "age" && c.field !== "complaint" && (
              <Autocomplete
                multiple
                size="small"
                options={options}
                value={picked}
                isOptionEqualToValue={(a, b) => a.value === b.value}
                getOptionLabel={(o) => o.label}
                onChange={(_e, next) => update(i, { value: next.map((o) => o.value) })}
                renderInput={(params) => <TextField {...params} label="Is one of" inputProps={{ ...params.inputProps, "data-testid": `cond-value-${i}` }} />}
                sx={{ minWidth: 300, flex: 1 }}
              />
            )}
            <Box sx={{ flexGrow: 1 }} />
            {iconBtn(`Remove condition ${i + 1}`, <DeleteOutlineIcon fontSize="small" />, () => set({ conditions: conditions.filter((_x, n) => n !== i) }))}
          </Paper>
        );
      })}
      {!criteriaComplete(criteria) && (
        <Alert severity="warning" sx={{ mb: 1 }} data-testid="conditions-incomplete">
          Finish each condition (pick a value) before saving.
        </Alert>
      )}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
        <Button size="small" variant="outlined" onClick={() => set({ conditions: [...conditions, newCondition("age", settings)] })} disabled={conditions.length >= 10} data-testid="add-condition">
          Add a condition
        </Button>
        <Typography variant="caption" color="text.secondary">
          Quick start:
        </Typography>
        {PRESETS.map((p) => (
          <Chip key={p.id} size="small" clickable variant="outlined" label={p.label} onClick={() => set({ conditions: [...conditions, p.make()] })} disabled={conditions.length >= 10} data-testid={`preset-${p.id}`} />
        ))}
      </Stack>
    </Box>
  );
}

/* ----------------------------------------------------------- Patients shown */

export function PatientsTab({ config, locations = [], settings = null, people = null, onChange }) {
  const followUp = config.kind === "follow_up";
  const waiting = config.filter === "waiting";
  const hasConditions = (config.criteria?.conditions || []).length > 0;
  const hasBeds = (config.beds || []).length > 0;
  return (
    <Stack spacing={3}>
      {followUp ? (
        <Typography variant="body2" color="text.secondary" data-testid="follow-up-patients">
          A follow-up board lists ED patients who have been discharged. How far back it looks is set on the Follow-up tab. Add conditions below to narrow it, such as a Peds follow-up board.
        </Typography>
      ) : (
        <>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Start with
            </Typography>
            <TextField select label="Which patients" size="small" value={config.filter || "all"} onChange={(e) => onChange({ ...config, filter: e.target.value })} sx={{ minWidth: 340 }} inputProps={{ "data-testid": "view-filter" }}>
              {FILTER_CHOICES.map((f) => (
                <MenuItem key={f.value} value={f.value}>
                  {f.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          {waiting ? (
            <Typography variant="body2" color="text.secondary" data-testid="beds-not-applicable">
              The Waiting Area shows every ED patient who has no bed yet, so there are no beds to choose.
            </Typography>
          ) : (
            <BedPicker beds={config.beds || []} locations={locations} onChange={(beds) => onChange({ ...config, beds })} />
          )}
        </>
      )}
      <ConditionsEditor config={config} settings={settings} people={people} onChange={onChange} />
      {!followUp && !waiting && hasBeds && hasConditions && (
        <FormControlLabel
          control={<Checkbox size="small" checked={config.show_empty_beds !== false} onChange={(e) => onChange({ ...config, show_empty_beds: e.target.checked })} />}
          label="Also show empty beds in the chosen locations"
          data-testid="show-empty-beds"
        />
      )}
    </Stack>
  );
}

/* ---------------------------------------------------------------- Follow-up */

export const FOLLOW_UP_WINDOWS = [1, 3, 7, 14, 30];

/** How far back a follow-up board looks, and how its flag works. */
export function FollowUpTab({ config, onChange }) {
  const days = config.follow_up?.days ?? 7;
  return (
    <Stack spacing={2} data-testid="follow-up-tab">
      <TextField
        select
        size="small"
        label="Show patients discharged in the last"
        value={days}
        onChange={(e) => onChange({ ...config, follow_up: { ...(config.follow_up || {}), days: Number(e.target.value) } })}
        sx={{ width: 300 }}
        inputProps={{ "data-testid": "follow-up-days" }}
      >
        {FOLLOW_UP_WINDOWS.map((n) => (
          <MenuItem key={n} value={n}>
            {n === 1 ? "24 hours" : `${n} days`}
          </MenuItem>
        ))}
      </TextField>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          How the New results flag works
        </Typography>
        <Typography variant="body2" color="text.secondary">
          A patient is flagged when a lab result for the ED visit came in after the discharge time and nobody has reviewed it yet. The flag clears once a clinician marks the result reviewed.
          Results entered in error never count; preliminary and corrected results do.
        </Typography>
      </Box>
    </Stack>
  );
}

/* ----------------------------------------------------------------- Colors */

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20) || "status";

const RULE_FIELD_LABELS = {
  esi: "ESI",
  ed_status: "Status",
  vitals_overdue: "Vitals overdue",
  recheck_overdue: "Triage recheck overdue",
  registration_complete: "Registration complete",
  sex: "Gender",
};

/** The value picker that fits a rule's field. */
function RuleValue({ rule, settings, disabled, onChange }) {
  const field = rule.field;
  const custom = settings.custom_columns.find((c) => c.key === field);
  let options = null;
  if (field === "esi") options = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
  else if (field === "ed_status") options = settings.statuses.map((s) => ({ value: s.value, label: s.code }));
  else if (field === "sex") options = [{ value: "F", label: "Female" }, { value: "M", label: "Male" }, { value: "X", label: "Other" }];
  else if (field === "vitals_overdue" || field === "recheck_overdue" || field === "registration_complete" || custom?.kind === "checkbox")
    options = [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];
  else if (custom?.kind === "dropdown") options = (custom.options || []).map((o) => ({ value: o, label: o }));

  if (options) {
    return (
      <Select size="small" value={String(rule.value ?? "")} disabled={disabled} onChange={(e) => onChange(e.target.value)} displayEmpty inputProps={{ "aria-label": "Rule value" }} sx={{ minWidth: 110 }}>
        {options.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </Select>
    );
  }
  return <TextField size="small" value={rule.value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} inputProps={{ "aria-label": "Rule value", maxLength: 40 }} />;
}


/* Staff lists */
function RosterPicker({ title, role, people, value, editable, onChange }) {
  const everyone = value === null || value === undefined;
  const chosen = everyone ? [] : people.filter((p) => value.includes(p.id));
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <RadioGroup
        value={everyone ? "all" : "some"}
        onChange={(e) => onChange(e.target.value === "all" ? null : people.map((p) => p.id))}
        aria-label={`${title} list`}
      >
        <FormControlLabel value="all" control={<Radio size="small" disabled={!editable} />} label={`Every ${role} in the clinic (${people.length})`} />
        <FormControlLabel value="some" control={<Radio size="small" disabled={!editable} />} label={`Only the ${role}s I choose`} />
      </RadioGroup>
      {!everyone && (
        <Autocomplete
          multiple
          size="small"
          options={people}
          value={chosen}
          disabled={!editable}
          getOptionLabel={(p) => p.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_e, next) => onChange(next.map((p) => p.id))}
          renderInput={(params) => <TextField {...params} label={`${title} on this board`} />}
          sx={{ mt: 1, maxWidth: 520 }}
        />
      )}
    </Box>
  );
}


export function ColorsTab({ config, settings, onChange }) {
  const rules = config.rules;
  const setRule = (i, patch) => onChange({ ...config, rules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const fields = [
    ...Object.entries(RULE_FIELD_LABELS).map(([value, label]) => ({ value, label })),
    ...settings.custom_columns.map((c) => ({ value: c.key, label: c.label })),
  ];
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Color a whole row or one cell when a value matches. The first matching rule wins. Colors belong to this view only.
      </Typography>
      <Stack spacing={1} data-testid="rules">
        {rules.map((r, i) => (
          <Paper key={i} variant="outlined" sx={{ p: 1, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Select size="small" value={r.field} onChange={(e) => setRule(i, { field: e.target.value, value: "" })} inputProps={{ "aria-label": "Rule field" }}>
              {fields.map((f) => (
                <MenuItem key={f.value} value={f.value}>
                  {f.label}
                </MenuItem>
              ))}
            </Select>
            <Select size="small" value={r.op} onChange={(e) => setRule(i, { op: e.target.value })} inputProps={{ "aria-label": "Rule comparison" }}>
              <MenuItem value="eq">is</MenuItem>
              <MenuItem value="neq">is not</MenuItem>
            </Select>
            <RuleValue rule={r} settings={settings} onChange={(value) => setRule(i, { value })} />
            <Select size="small" value={r.target} onChange={(e) => setRule(i, { target: e.target.value })} inputProps={{ "aria-label": "Rule colors" }}>
              <MenuItem value="row">color the whole row</MenuItem>
              <MenuItem value="cell">color just that cell</MenuItem>
            </Select>
            <input type="color" aria-label="Rule color" value={r.color} onChange={(e) => setRule(i, { color: e.target.value })} />
            {iconBtn("Delete rule", <DeleteOutlineIcon fontSize="small" />, () => onChange({ ...config, rules: rules.filter((_, j) => j !== i) }))}
          </Paper>
        ))}
      </Stack>
      <Button size="small" variant="outlined" sx={{ mt: 1 }} disabled={rules.length >= 30} onClick={() => onChange({ ...config, rules: [...rules, { field: "esi", op: "eq", value: "1", target: "row", color: "#ffcdd2" }] })}>
        Add a color rule
      </Button>
    </Box>
  );
}

/* --------------------------------------------------------- Shared settings */

/** Statuses, the vitals limit, custom column definitions and the staff lists: shared by every view. */
export function SettingsTab({ settings, people, departments, onChange }) {
  const { statuses, custom_columns: customs } = settings;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("text");
  const [choices, setChoices] = useState("");
  const [deptId, setDeptId] = useState("");
  const setStatus = (i, patch) => onChange({ ...settings, statuses: statuses.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setCustom = (i, patch) => onChange({ ...settings, custom_columns: customs.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const roster = settings.roster || { default: { nurses: null, doctors: null }, units: {} };
  const setDefault = (patch) => onChange({ ...settings, roster: { ...roster, default: { ...roster.default, ...patch } } });
  const unitRoster = deptId ? roster.units?.[deptId] : null;
  const setUnit = (value) => {
    const units = { ...(roster.units || {}) };
    if (value) units[deptId] = value;
    else delete units[deptId];
    onChange({ ...settings, roster: { ...roster, units } });
  };

  const addStatus = () => {
    const taken = statuses.map((s) => s.value);
    let value = "status";
    let n = 2;
    while (taken.includes(value)) value = `status_${n++}`;
    onChange({ ...settings, statuses: [...statuses, { value, code: "NEW", label: "New status" }] });
  };
  const choiceList = (text) => text.split(/[\n,]/).map((o) => o.trim()).filter(Boolean);
  const addColumn = () => {
    const label = name.trim();
    if (!label) return;
    const column = { key: customKey(label, customs.map((c) => c.key)), label, kind };
    if (kind === "dropdown") column.options = choiceList(choices);
    onChange({ ...settings, custom_columns: [...customs, column] });
    setAdding(false);
    setName("");
    setKind("text");
    setChoices("");
  };
  const dropdownEmpty = kind === "dropdown" && choiceList(choices).length === 0;

  return (
    <Stack spacing={3}>
      <Alert severity="info">These settings are shared by every view. Changing them changes the board for everyone who uses it.</Alert>

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Statuses
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          The choices in the STS column. The short code is what shows on the board.
        </Typography>
        <Table size="small" aria-label="Board statuses">
          <TableBody>
            {statuses.map((s, i) => (
              <TableRow key={s.value}>
                <TableCell>
                  <TextField size="small" variant="standard" value={s.code} onChange={(e) => setStatus(i, { code: e.target.value.toUpperCase() })} inputProps={{ "aria-label": `Code for ${s.label}`, maxLength: 8, style: { width: 70 } }} />
                </TableCell>
                <TableCell>
                  <TextField size="small" variant="standard" value={s.label} onChange={(e) => setStatus(i, { label: e.target.value, ...(s.code === "NEW" ? { value: slug(e.target.value) } : {}) })} inputProps={{ "aria-label": `Name of ${s.code}`, maxLength: 40 }} />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  {iconBtn(`Move ${s.code} up`, <ArrowUpwardIcon fontSize="small" />, () => onChange({ ...settings, statuses: move(statuses, i, -1) }), i === 0)}
                  {iconBtn(`Move ${s.code} down`, <ArrowDownwardIcon fontSize="small" />, () => onChange({ ...settings, statuses: move(statuses, i, 1) }), i === statuses.length - 1)}
                  {iconBtn(`Delete status ${s.code}`, <DeleteOutlineIcon fontSize="small" />, () => onChange({ ...settings, statuses: statuses.filter((_, j) => j !== i) }), statuses.length <= 1)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button size="small" variant="outlined" sx={{ mt: 1 }} disabled={statuses.length >= 12} onClick={addStatus}>
          Add a status
        </Button>
      </Box>

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Vitals
        </Typography>
        <TextField
          label="Vitals are overdue after (minutes)"
          type="number"
          size="small"
          value={settings.vitals_overdue_minutes}
          onChange={(e) => onChange({ ...settings, vitals_overdue_minutes: Number(e.target.value) })}
          inputProps={{ min: 5, max: 1440 }}
          sx={{ mt: 1, width: 280 }}
        />
      </Box>

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Custom columns
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Extra columns your clinic fills in on the board. Once added, switch them on in any view. Deleting one removes it from every view.
        </Typography>
        <Table size="small" aria-label="Custom columns">
          <TableBody>
            {customs.length === 0 && (
              <TableRow>
                <TableCell>No custom columns yet.</TableCell>
              </TableRow>
            )}
            {customs.map((c, i) => (
              <TableRow key={c.key} data-testid={`custom-def-${c.key}`}>
                <TableCell>
                  <TextField size="small" variant="standard" value={c.label} onChange={(e) => setCustom(i, { label: e.target.value })} inputProps={{ "aria-label": `Name of custom column ${c.key}`, maxLength: 40 }} />
                </TableCell>
                <TableCell>
                  <Chip size="small" variant="outlined" label={KINDS.find((k) => k.value === c.kind)?.label || "Text"} />
                </TableCell>
                <TableCell>
                  {c.kind === "dropdown" && (
                    <TextField
                      size="small"
                      variant="standard"
                      fullWidth
                      placeholder="Choices, separated by commas"
                      value={(c.options || []).join(", ")}
                      onChange={(e) => setCustom(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                      inputProps={{ "aria-label": `Choices for ${c.label}` }}
                    />
                  )}
                </TableCell>
                <TableCell align="right">{iconBtn(`Delete custom column ${c.label}`, <DeleteOutlineIcon fontSize="small" />, () => onChange({ ...settings, custom_columns: customs.filter((_, j) => j !== i) }))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button size="small" variant="outlined" sx={{ mt: 1 }} disabled={customs.length >= 20} onClick={() => setAdding(true)}>
          Add a custom column
        </Button>
      </Box>

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Staff lists
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Nurses fill the RN dropdown. Doctors fill both the MD and the Resident dropdowns. Leave a list on "every" and anyone with that role in the clinic is offered.
        </Typography>
        <Stack spacing={2}>
          <RosterPicker title="Nurses" role="nurse" people={people.nurses} value={roster.default.nurses} editable onChange={(nurses) => setDefault({ nurses })} />
          <RosterPicker title="Doctors" role="doctor" people={people.doctors} value={roster.default.doctors} editable onChange={(doctors) => setDefault({ doctors })} />
        </Stack>
        {departments.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <TextField select size="small" label="Department with its own lists" value={deptId} onChange={(e) => setDeptId(e.target.value)} sx={{ minWidth: 280 }} inputProps={{ "data-testid": "roster-dept" }}>
              <MenuItem value="">(none selected)</MenuItem>
              {departments.map((d) => (
                <MenuItem key={d.id} value={String(d.id)}>
                  {d.name} ({d.facility_name})
                </MenuItem>
              ))}
            </TextField>
            {deptId && (
              <Box sx={{ mt: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={!!unitRoster}
                      onChange={(e) => setUnit(e.target.checked ? { nurses: people.nurses.map((p) => p.id), doctors: people.doctors.map((p) => p.id) } : null)}
                    />
                  }
                  label="This department has its own staff lists"
                />
                {unitRoster && (
                  <Stack spacing={2} sx={{ mt: 1 }}>
                    <RosterPicker title="Nurses here" role="nurse" people={people.nurses} value={unitRoster.nurses} editable onChange={(nurses) => setUnit({ ...unitRoster, nurses })} />
                    <RosterPicker title="Doctors here" role="doctor" people={people.doctors} value={unitRoster.doctors} editable onChange={(doctors) => setUnit({ ...unitRoster, doctors })} />
                  </Stack>
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Dialog open={adding} onClose={() => setAdding(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add a custom column</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Column name" value={name} onChange={(e) => setName(e.target.value)} inputProps={{ maxLength: 40 }} autoFocus />
            <TextField select label="What goes in it" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <MenuItem key={k.value} value={k.value}>
                  {k.label}
                </MenuItem>
              ))}
            </TextField>
            {kind === "dropdown" && <TextField label="Choices (one per line or comma separated)" multiline minRows={3} value={choices} onChange={(e) => setChoices(e.target.value)} />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdding(false)}>Cancel</Button>
          <Button variant="contained" onClick={addColumn} disabled={!name.trim() || dropdownEmpty}>
            Add column
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
