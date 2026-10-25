import { Autocomplete, Box, Chip, FormControlLabel, Radio, RadioGroup, TextField, Typography } from "@mui/material";

/**
 * "Applies to" field for a staffing standard: all units, or a list of units.
 *
 *   value    { all: boolean, unitIds: number[] }
 *   units    [{ id, name }]
 *   owners   { [unitId]: ruleId }  units already covered by a standard (when units are set one by one)
 *   ruleNames{ [ruleId]: name }
 *   ruleId   the standard being edited (its own units stay selectable)
 */
export default function AppliesToPicker({ units = [], value, onChange, owners = {}, ruleNames = {}, ruleId = null, error = "" }) {
  const selected = units.filter((u) => value.unitIds.includes(u.id));
  const takenBy = (u) => {
    const owner = owners[String(u.id)];
    return owner && owner !== ruleId ? ruleNames[owner] || "another standard" : "";
  };

  return (
    <Box
      sx={{ border: 1, borderStyle: "dashed", borderColor: "primary.main", borderRadius: 2, p: 1.5, bgcolor: "action.hover" }}
      role="group"
      aria-label="Applies to"
    >
      <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "primary.main" }}>
        Applies to
      </Typography>
      <RadioGroup
        value={value.all ? "all" : "selected"}
        onChange={(e) => onChange({ all: e.target.value === "all", unitIds: value.unitIds })}
      >
        <FormControlLabel
          value="all"
          control={<Radio />}
          label={
            <Box>
              <Typography>All units</Typography>
              <Typography variant="caption" color="text.secondary">
                Every unit in your organization, including new ones
              </Typography>
            </Box>
          }
        />
        <FormControlLabel
          value="selected"
          control={<Radio />}
          label={
            <Box>
              <Typography>Selected units</Typography>
              <Typography variant="caption" color="text.secondary">
                Choose which units this standard checks
              </Typography>
            </Box>
          }
        />
      </RadioGroup>
      {!value.all && (
        <Autocomplete
          multiple
          disableCloseOnSelect
          options={units}
          value={selected}
          onChange={(e, opts) => onChange({ all: false, unitIds: opts.map((o) => o.id) })}
          getOptionLabel={(u) => u.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          getOptionDisabled={(u) => !!takenBy(u)}
          noOptionsText="No units"
          renderOption={(props, u) => {
            const { key, ...rest } = props;
            const taken = takenBy(u);
            return (
              <li key={key} {...rest}>
                <Box sx={{ flex: 1 }}>{u.name}</Box>
                {taken && <Chip size="small" color="warning" variant="outlined" label={`Covered by ${taken}`} />}
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField {...params} label="Units" placeholder="Add a unit" size="small" error={!!error} helperText={error} sx={{ mt: 1 }} />
          )}
        />
      )}
    </Box>
  );
}
