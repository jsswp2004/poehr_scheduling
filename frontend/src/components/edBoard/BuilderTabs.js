import { useState } from "react";
import {
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

export function ColumnsTab({ config, onChange, editable }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("text");
  const [choices, setChoices] = useState("");
  const columns = config.columns;
  const set = (index, patch) => onChange({ ...config, columns: columns.map((c, i) => (i === index ? { ...c, ...patch } : c)) });

  const addColumn = () => {
    const label = name.trim();
    if (!label) return;
    const column = { key: customKey(label, columns.map((c) => c.key)), label, width: 120, visible: true, type: "custom", kind };
    if (kind === "dropdown") column.options = choices.split(/[\n,]/).map((o) => o.trim()).filter(Boolean);
    onChange({ ...config, columns: [...columns, column] });
    setAdding(false);
    setName("");
    setKind("text");
    setChoices("");
  };

  const dropdownEmpty = kind === "dropdown" && !choices.split(/[\n,]/).some((o) => o.trim());

  return (
    <Box>
      <Table size="small" aria-label="Board columns">
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
                  disabled={!editable || ALWAYS_VISIBLE.includes(c.key)}
                  onChange={(e) => set(i, { visible: e.target.checked })}
                  inputProps={{ "aria-label": `Show ${c.label || c.key}` }}
                />
              </TableCell>
              <TableCell>
                <TextField
                  size="small"
                  variant="standard"
                  value={c.label}
                  disabled={!editable}
                  onChange={(e) => set(i, { label: e.target.value })}
                  inputProps={{ "aria-label": `Name of ${c.key}`, maxLength: 40 }}
                />
                {c.type === "custom" && c.kind === "dropdown" && (
                  <TextField
                    size="small"
                    variant="standard"
                    fullWidth
                    placeholder="Choices, separated by commas"
                    disabled={!editable}
                    value={(c.options || []).join(", ")}
                    onChange={(e) => set(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                    inputProps={{ "aria-label": `Choices for ${c.label}` }}
                    sx={{ mt: 0.5 }}
                  />
                )}
              </TableCell>
              <TableCell>
                <TextField
                  size="small"
                  variant="standard"
                  type="number"
                  value={c.width}
                  disabled={!editable}
                  onChange={(e) => set(i, { width: Number(e.target.value) })}
                  inputProps={{ "aria-label": `Width of ${c.label || c.key}`, min: 40, max: 600, style: { width: 64 } }}
                />
              </TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" label={c.type === "custom" ? KINDS.find((k) => k.value === c.kind)?.label || "Text" : "Built in"} />
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                {iconBtn(`Move ${c.label || c.key} up`, <ArrowUpwardIcon fontSize="small" />, () => onChange({ ...config, columns: move(columns, i, -1) }), !editable || i === 0)}
                {iconBtn(`Move ${c.label || c.key} down`, <ArrowDownwardIcon fontSize="small" />, () => onChange({ ...config, columns: move(columns, i, 1) }), !editable || i === columns.length - 1)}
                {c.type === "custom" &&
                  iconBtn(`Delete ${c.label}`, <DeleteOutlineIcon fontSize="small" />, () => onChange({ ...config, columns: columns.filter((_, j) => j !== i) }), !editable)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button sx={{ mt: 1 }} variant="outlined" size="small" disabled={!editable} onClick={() => setAdding(true)}>
        Add a column
      </Button>

      <Dialog open={adding} onClose={() => setAdding(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add a column</DialogTitle>
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
            {kind === "dropdown" && (
              <TextField label="Choices (one per line or comma separated)" multiline minRows={3} value={choices} onChange={(e) => setChoices(e.target.value)} />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdding(false)}>Cancel</Button>
          <Button variant="contained" onClick={addColumn} disabled={!name.trim() || dropdownEmpty}>
            Add column
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ------------------------------------------------------ Statuses & colors */

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20) || "status";

const RULE_FIELD_LABELS = {
  esi: "ESI",
  ed_status: "Status",
  vitals_overdue: "Vitals overdue",
  registration_complete: "Registration complete",
  sex: "Gender",
};

/** The value picker that fits a rule's field. */
function RuleValue({ rule, config, disabled, onChange }) {
  const field = rule.field;
  const custom = config.columns.find((c) => c.key === field && c.type === "custom");
  let options = null;
  if (field === "esi") options = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
  else if (field === "ed_status") options = config.statuses.map((s) => ({ value: s.value, label: s.code }));
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

export function StatusesTab({ config, onChange, editable }) {
  const { statuses, rules } = config;
  const setStatus = (i, patch) => onChange({ ...config, statuses: statuses.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setRule = (i, patch) => onChange({ ...config, rules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const customColumns = config.columns.filter((c) => c.type === "custom");
  const fields = [
    ...Object.entries(RULE_FIELD_LABELS).map(([value, label]) => ({ value, label })),
    ...customColumns.map((c) => ({ value: c.key, label: c.label })),
  ];

  const addStatus = () => {
    const taken = statuses.map((s) => s.value);
    let value = "status";
    let n = 2;
    while (taken.includes(value)) value = `status_${n++}`;
    onChange({ ...config, statuses: [...statuses, { value, code: "NEW", label: "New status" }] });
  };

  return (
    <Stack spacing={3}>
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
                  <TextField size="small" variant="standard" value={s.code} disabled={!editable} onChange={(e) => setStatus(i, { code: e.target.value.toUpperCase() })} inputProps={{ "aria-label": `Code for ${s.label}`, maxLength: 8, style: { width: 70 } }} />
                </TableCell>
                <TableCell>
                  <TextField size="small" variant="standard" value={s.label} disabled={!editable} onChange={(e) => setStatus(i, { label: e.target.value, ...(s.code === "NEW" ? { value: slug(e.target.value) } : {}) })} inputProps={{ "aria-label": `Name of ${s.code}`, maxLength: 40 }} />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  {iconBtn(`Move ${s.code} up`, <ArrowUpwardIcon fontSize="small" />, () => onChange({ ...config, statuses: move(statuses, i, -1) }), !editable || i === 0)}
                  {iconBtn(`Move ${s.code} down`, <ArrowDownwardIcon fontSize="small" />, () => onChange({ ...config, statuses: move(statuses, i, 1) }), !editable || i === statuses.length - 1)}
                  {iconBtn(`Delete status ${s.code}`, <DeleteOutlineIcon fontSize="small" />, () => onChange({ ...config, statuses: statuses.filter((_, j) => j !== i) }), !editable || statuses.length <= 1)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button size="small" variant="outlined" sx={{ mt: 1 }} disabled={!editable || statuses.length >= 12} onClick={addStatus}>
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
          disabled={!editable}
          value={config.vitals_overdue_minutes}
          onChange={(e) => onChange({ ...config, vitals_overdue_minutes: Number(e.target.value) })}
          inputProps={{ min: 5, max: 1440 }}
          sx={{ mt: 1, width: 280 }}
        />
      </Box>

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Color rules
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Color a whole row or one cell when a value matches. The first matching rule wins.
        </Typography>
        <Stack spacing={1} data-testid="rules">
          {rules.map((r, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 1, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Select size="small" value={r.field} disabled={!editable} onChange={(e) => setRule(i, { field: e.target.value, value: "" })} inputProps={{ "aria-label": "Rule field" }}>
                {fields.map((f) => (
                  <MenuItem key={f.value} value={f.value}>
                    {f.label}
                  </MenuItem>
                ))}
              </Select>
              <Select size="small" value={r.op} disabled={!editable} onChange={(e) => setRule(i, { op: e.target.value })} inputProps={{ "aria-label": "Rule comparison" }}>
                <MenuItem value="eq">is</MenuItem>
                <MenuItem value="neq">is not</MenuItem>
              </Select>
              <RuleValue rule={r} config={config} disabled={!editable} onChange={(value) => setRule(i, { value })} />
              <Select size="small" value={r.target} disabled={!editable} onChange={(e) => setRule(i, { target: e.target.value })} inputProps={{ "aria-label": "Rule colors" }}>
                <MenuItem value="row">color the whole row</MenuItem>
                <MenuItem value="cell">color just that cell</MenuItem>
              </Select>
              <input type="color" aria-label="Rule color" value={r.color} disabled={!editable} onChange={(e) => setRule(i, { color: e.target.value })} />
              {iconBtn("Delete rule", <DeleteOutlineIcon fontSize="small" />, () => onChange({ ...config, rules: rules.filter((_, j) => j !== i) }), !editable)}
            </Paper>
          ))}
        </Stack>
        <Button size="small" variant="outlined" sx={{ mt: 1 }} disabled={!editable || rules.length >= 30} onClick={() => onChange({ ...config, rules: [...rules, { field: "esi", op: "eq", value: "1", target: "row", color: "#ffcdd2" }] })}>
          Add a color rule
        </Button>
      </Box>
    </Stack>
  );
}

/* ----------------------------------------------------------------- Staff */

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

export function StaffTab({ config, people, onChange, editable }) {
  const roster = config.roster || { nurses: null, doctors: null };
  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        These people fill the RN and MD dropdowns on the board. Leave a list on "every" and anyone with that role in the clinic is offered.
      </Typography>
      <RosterPicker title="Nurses" role="nurse" people={people.nurses} value={roster.nurses} editable={editable} onChange={(nurses) => onChange({ ...config, roster: { ...roster, nurses } })} />
      <RosterPicker title="Doctors" role="doctor" people={people.doctors} value={roster.doctors} editable={editable} onChange={(doctors) => onChange({ ...config, roster: { ...roster, doctors } })} />
    </Stack>
  );
}

/* -------------------------------------------------------------- Versions */

const when = (iso) => (iso ? new Date(iso).toLocaleString() : "");
const STATUS_COLOR = { published: "success", draft: "warning", archived: "default" };

export function VersionsTab({ versions, picked, onPick, onRestore, canRestore, diff, diffTitle, onCompare }) {
  return (
    <Box>
      <Table size="small" aria-label="Saved versions">
        <TableHead>
          <TableRow>
            <TableCell />
            <TableCell>Version</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Note</TableCell>
            <TableCell>Saved by</TableCell>
            <TableCell>Published</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {versions.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} align="center">
                Nothing has been saved for this board yet.
              </TableCell>
            </TableRow>
          )}
          {versions.map((v) => (
            <TableRow key={v.id} data-testid={`version-${v.number}`}>
              <TableCell>
                <Checkbox size="small" checked={picked.includes(v.id)} onChange={() => onPick(v.id)} inputProps={{ "aria-label": `Compare version ${v.number}` }} />
              </TableCell>
              <TableCell>v{v.number}</TableCell>
              <TableCell>
                <Chip size="small" label={v.status} color={STATUS_COLOR[v.status]} />
              </TableCell>
              <TableCell>{v.note}</TableCell>
              <TableCell>{v.author?.name || ""}</TableCell>
              <TableCell>{when(v.published_at)}</TableCell>
              <TableCell align="right">
                <Button size="small" disabled={!canRestore || v.status === "draft"} onClick={() => onRestore(v)} aria-label={`Restore version ${v.number}`}>
                  Restore
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Box sx={{ mt: 2, display: "flex", gap: 2, alignItems: "center" }}>
        <Button variant="outlined" size="small" disabled={picked.length !== 2} onClick={onCompare}>
          Compare the two ticked versions
        </Button>
        {picked.length !== 2 && (
          <Typography variant="caption" color="text.secondary">
            Tick two versions to see what changed between them.
          </Typography>
        )}
      </Box>
      {diff && (
        <Paper variant="outlined" sx={{ mt: 2, p: 2 }} data-testid="diff">
          <Typography variant="subtitle2">{diffTitle}</Typography>
          {diff.length === 0 ? (
            <Typography variant="body2">No differences.</Typography>
          ) : (
            <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
              {diff.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </Paper>
      )}
    </Box>
  );
}
