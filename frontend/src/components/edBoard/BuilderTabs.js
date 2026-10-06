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
                  disabled={ALWAYS_VISIBLE.includes(c.key)}
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
                <Chip size="small" variant="outlined" label={c.type === "custom" ? KINDS.find((k) => k.value === c.kind)?.label || "Text" : "Built in"} />
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

export function PatientsTab({ config, locations = [], onChange }) {
  const waiting = config.filter === "waiting";
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Which patients does this view list?
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
    </Stack>
  );
}

/* ----------------------------------------------------------------- Colors */

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20) || "status";

const RULE_FIELD_LABELS = {
  esi: "ESI",
  ed_status: "Status",
  vitals_overdue: "Vitals overdue",
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
  else if (field === "vitals_overdue" || field === "registration_complete" || custom?.kind === "checkbox")
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
          These people fill the RN and MD dropdowns. Leave a list on "every" and anyone with that role in the clinic is offered.
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
