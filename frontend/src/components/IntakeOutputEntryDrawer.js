import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Drawer,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { LocalizationProvider, DateTimePicker } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { ML_PER_OZ, parseVolume } from "../utils/ioHelpers";

/**
 * Chart one set of intake and output amounts at one time. Saving adds a time column
 * (or fills the one already at that minute) on the flowsheet; the nurse still saves the flowsheet.
 * `rows` is the flowsheet's flat row list; amounts are the rows whose unit is mL.
 */
export default function IntakeOutputEntryDrawer({ open, onClose, rows, onSave }) {
  const [when, setWhen] = useState(new Date());
  const [unit, setUnit] = useState("ml");
  const [values, setValues] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setWhen(new Date());
      setValues({});
      setError("");
    }
  }, [open]);

  const groups = useMemo(() => {
    const out = [];
    rows
      .filter((row) => row.field_type !== "calculated")
      .forEach((row) => {
        let group = out.find((g) => g.name === row.section_label);
        if (!group) {
          group = { name: row.section_label, rows: [] };
          out.push(group);
        }
        group.rows.push(row);
      });
    return out;
  }, [rows]);

  const set = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  const save = () => {
    const result = {};
    for (const row of rows) {
      const raw = (values[row.key] ?? "").toString().trim();
      if (!raw) continue;
      if (row.field_type === "numeric") {
        const parsed = parseVolume(raw);
        if (!parsed) {
          setError(`${row.label}: enter a number.`);
          return;
        }
        const isVolume = row.unit === "mL";
        result[row.key] = String(isVolume && unit === "oz" && !parsed.converted ? Math.round(parsed.ml * ML_PER_OZ * 10) / 10 : parsed.ml);
      } else {
        result[row.key] = raw;
      }
    }
    if (Object.keys(result).length === 0) {
      setError("Enter at least one amount.");
      return;
    }
    onSave({ time: when, values: result });
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: "100vw", sm: 420 }, p: 2.5 }} role="dialog" aria-label="Add intake and output entry">
        <Typography variant="h6" sx={{ mb: 1.5 }}>Add entry</Typography>
        <Stack spacing={2}>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DateTimePicker label="Date and time" value={when} onChange={(v) => v && setWhen(v)} />
          </LocalizationProvider>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="body2">Type amounts in</Typography>
            <ToggleButtonGroup size="small" exclusive value={unit} onChange={(_, v) => v && setUnit(v)}>
              <ToggleButton value="ml">mL</ToggleButton>
              <ToggleButton value="oz">oz</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {unit === "oz" && (
            <Typography variant="caption" color="text.secondary">
              1 oz = {ML_PER_OZ} mL. Amounts are saved in mL.
            </Typography>
          )}
          {groups.map((group) => (
            <Box key={group.name}>
              <Typography variant="overline" color="primary">{group.name}</Typography>
              <Stack spacing={1.25} sx={{ mt: 0.5 }}>
                {group.rows.map((row) =>
                  row.field_type === "dropdown" ? (
                    <TextField key={row.key} select size="small" label={row.label} value={values[row.key] ?? ""} onChange={(e) => set(row.key, e.target.value)}>
                      <MenuItem value=""><em>--</em></MenuItem>
                      {(row.options || []).map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <TextField
                      key={row.key}
                      size="small"
                      label={row.label}
                      value={values[row.key] ?? ""}
                      onChange={(e) => set(row.key, e.target.value)}
                      InputProps={row.field_type === "numeric" && row.unit ? { endAdornment: <Typography variant="caption">{row.unit === "mL" ? unit : row.unit}</Typography> } : undefined}
                      inputProps={{ inputMode: row.field_type === "numeric" ? "decimal" : "text" }}
                    />
                  )
                )}
              </Stack>
            </Box>
          ))}
          {error && <Typography color="error" variant="body2" role="alert">{error}</Typography>}
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={save}>Save entry</Button>
          </Stack>
        </Stack>
      </Box>
    </Drawer>
  );
}
