import React from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { SEX_OPTIONS, formatDobInput, formatPhone, showDob } from "./registerHelpers";

// Arrival choices on the staff form. The values are the visit's admission types.
export const ARRIVALS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "emergency", label: "Emergency" },
  { value: "direct", label: "Direct admit" },
];

// Staff Quick Register: the minimum needed to open a chart, and optionally start the visit.
// All state lives in RegisterPage; this component only draws it.
function QuickRegisterForm({
  values,
  errors,
  onChange,
  onSubmit,
  submitting,
  modalMode,
  doctors,
  dupes,
  onDismissDupes,
  onUsePatient,
}) {
  const field = (name, label, extra = {}) => ({
    name,
    label,
    size: "small",
    fullWidth: true,
    required: extra.required,
    value: values[name] ?? "",
    error: !!errors[name],
    helperText: errors[name] || extra.helperText || " ",
    onChange: (e) => onChange(name, e.target.value),
    ...extra,
  });

  return (
    <Box
      component="form"
      noValidate
      data-testid="quick-register-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(!modalMode);
      }}
    >
      <Stack spacing={1}>
        {!modalMode && (
          <Box sx={{ mb: 0.5 }}>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.75 }}>
              How is the patient arriving?
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              value={values.admission_type}
              onChange={(e, next) => next && onChange("admission_type", next)}
              aria-label="How is the patient arriving?"
            >
              {ARRIVALS.map((a) => (
                <ToggleButton key={a.value} value={a.value} sx={{ textTransform: "none" }}>
                  {a.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary">
              Starts the visit and puts the patient on that list. Choose Register only to skip it.
            </Typography>
          </Box>
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, rowGap: 0 }}>
          <TextField {...field("first_name", "First name", { required: true, autoComplete: "off" })} />
          <TextField {...field("last_name", "Last name", { required: true, autoComplete: "off" })} />
          <TextField
            {...field("dob", "Date of birth", {
              required: true,
              placeholder: "MM/DD/YYYY",
              inputProps: { inputMode: "numeric", maxLength: 10 },
            })}
            onChange={(e) => onChange("dob", formatDobInput(e.target.value))}
          />
          <TextField {...field("legal_sex", "Sex at birth", { required: true, select: true })}>
            {SEX_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            {...field("phone_number", "Mobile phone", { placeholder: "(555) 123-4567" })}
            value={formatPhone(values.phone_number)}
            onChange={(e) => onChange("phone_number", e.target.value.replace(/\D/g, "").slice(0, 10))}
          />
          <TextField {...field("email", "Email", { required: true, type: "email", helperText: errors.email || "Needed for the patient's account." })} />
        </Box>

        {dupes.length > 0 && (
          <Alert
            severity="warning"
            role="alert"
            data-testid="possible-matches"
            sx={{ alignItems: "flex-start" }}
          >
            <Typography variant="body2" fontWeight={600}>
              {dupes.length === 1 ? "1 possible match" : `${dupes.length} possible matches`}
            </Typography>
            {dupes.map((p) => (
              <Box key={p.id} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 0.5 }}>
                <Typography variant="body2" sx={{ flex: "1 1 160px" }}>
                  {p.last_name}, {p.first_name} &middot; DOB {showDob(p.date_of_birth)}
                  {p.mrn ? ` · ${p.mrn}` : ""}
                </Typography>
                <Button size="small" variant="outlined" onClick={() => onUsePatient(p)}>
                  Use this patient
                </Button>
              </Box>
            ))}
            <Button size="small" sx={{ mt: 0.5, px: 0 }} onClick={onDismissDupes}>
              Not the same person
            </Button>
          </Alert>
        )}

        <TextField {...field("assigned_doctor", "Primary care provider", { select: true, helperText: " " })}>
          <MenuItem value="">None</MenuItem>
          {doctors.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              Dr. {d.first_name} {d.last_name}
            </MenuItem>
          ))}
        </TextField>

        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, px: 1.5, py: 0.5, bgcolor: "#fbfcfe" }}>
          <FormControlLabel
            sx={{ width: "100%", m: 0, justifyContent: "space-between", flexDirection: "row-reverse" }}
            control={
              <Switch
                size="small"
                checked={!!values.portal_login}
                onChange={(e) => onChange("portal_login", e.target.checked)}
                inputProps={{ "aria-label": "Patient portal login" }}
              />
            }
            label={
              <Box>
                <Typography variant="body2" fontWeight={600} component="span">
                  Patient portal login
                </Typography>{" "}
                <Typography variant="caption" color="text.secondary" component="span">
                  Optional
                </Typography>
              </Box>
            }
          />
          <Collapse in={!!values.portal_login} unmountOnExit>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, rowGap: 0, pt: 1 }}>
              <TextField {...field("username", "Username", { required: true, autoComplete: "off" })} />
              <TextField {...field("password", "Password", { required: true, type: "password", autoComplete: "new-password" })} />
            </Box>
          </Collapse>
        </Box>

        {errors._form && <Alert severity="error">{errors._form}</Alert>}

        <Box sx={{ display: "flex", gap: 1, pt: 1 }}>
          {!modalMode && (
            <Button type="submit" variant="contained" size="large" disabled={submitting} sx={{ flex: 1 }}>
              Register and start visit
            </Button>
          )}
          <Button
            type={modalMode ? "submit" : "button"}
            variant={modalMode ? "contained" : "outlined"}
            size="large"
            disabled={submitting}
            sx={modalMode ? { flex: 1 } : undefined}
            onClick={modalMode ? undefined : () => onSubmit(false)}
          >
            {modalMode ? "Register" : "Register only"}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

export default QuickRegisterForm;
