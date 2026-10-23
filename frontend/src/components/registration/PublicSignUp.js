import React from "react";
import { Alert, Box, Button, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import Select from "react-select";
import { formatPhone, passwordStrength } from "./registerHelpers";

const STRENGTH = ["", "Weak password", "Okay password", "Good password"];
const STRENGTH_COLOR = ["#e4e7ec", "#f04438", "#f79009", "#16a34a"];

// The public "Create your account" card. Staff registration is a separate screen.
function PublicSignUp({ values, errors, onChange, onSubmit, submitting, doctors, needsOrganization, signedIn }) {
  const field = (name, label, extra = {}) => ({
    name,
    label,
    size: "small",
    fullWidth: true,
    required: true,
    value: values[name] ?? "",
    error: !!errors[name],
    helperText: errors[name] || " ",
    onChange: (e) => onChange(name, e.target.value),
    ...extra,
  });
  const level = passwordStrength(values.password);

  return (
    <Box sx={{ display: "flex", justifyContent: "center", px: 2, py: 4 }}>
      <Paper
        elevation={0}
        component="form"
        noValidate
        data-testid="public-sign-up"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        sx={{ width: "100%", maxWidth: 460, p: { xs: 2.5, sm: 3.5 }, border: "1px solid #e2e8f0", borderRadius: 3 }}
      >
        <Stack spacing={1}>
          <Box sx={{ mb: 1 }}>
            <Typography variant="h5" fontWeight={600}>
              Create your account
            </Typography>
            <Typography variant="body2" color="text.secondary">
              It takes about a minute.
            </Typography>
          </Box>

          {needsOrganization && <TextField {...field("organization_name", "Clinic name")} />}

          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, rowGap: 0 }}>
            <TextField {...field("first_name", "First name", { autoComplete: "given-name" })} />
            <TextField {...field("last_name", "Last name", { autoComplete: "family-name" })} />
          </Box>
          <TextField {...field("email", "Email", { type: "email", autoComplete: "email" })} />
          <TextField
            {...field("phone_number", "Mobile phone", { required: values.has_provider === "no", placeholder: "(555) 123-4567", autoComplete: "tel" })}
            value={formatPhone(values.phone_number)}
            onChange={(e) => onChange("phone_number", e.target.value.replace(/\D/g, "").slice(0, 10))}
          />
          <TextField {...field("password", "Password", { type: "password", autoComplete: "new-password" })} />
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: -1 }} aria-live="polite">
            {[1, 2, 3].map((i) => (
              <Box key={i} sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: level >= i ? STRENGTH_COLOR[level] : "#e4e7ec" }} />
            ))}
            <Typography variant="caption" color="text.secondary" sx={{ width: 104, textAlign: "right" }}>
              {STRENGTH[level]}
            </Typography>
          </Box>

          <Box sx={{ pt: 1 }}>
            <Typography variant="body2" fontWeight={500} sx={{ mb: 0.75 }}>
              Do you have a primary care provider here?
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              value={values.has_provider || null}
              onChange={(e, next) => next && onChange("has_provider", next)}
              aria-label="Do you have a primary care provider here?"
            >
              <ToggleButton value="yes" sx={{ textTransform: "none" }}>
                Yes
              </ToggleButton>
              <ToggleButton value="no" sx={{ textTransform: "none" }}>
                No, I need one
              </ToggleButton>
            </ToggleButtonGroup>
            {errors.has_provider && (
              <Typography variant="caption" color="error">
                {errors.has_provider}
              </Typography>
            )}
          </Box>

          {values.has_provider === "yes" && (
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Select your doctor
              </Typography>
              <Select
                options={doctors.map((d) => ({ value: d.id, label: `Dr. ${d.first_name} ${d.last_name}` }))}
                placeholder="Search or select doctor..."
                onChange={(selected) => onChange("assigned_doctor", selected?.value || "")}
                isClearable
                styles={{ control: (base) => ({ ...base, minHeight: 40 }), menu: (base) => ({ ...base, zIndex: 9999 }) }}
              />
            </Box>
          )}
          {values.has_provider === "no" && !signedIn && (
            <Alert severity="info">No problem. A member of our team will call you within one business day.</Alert>
          )}

          {errors._form && <Alert severity="error">{errors._form}</Alert>}

          <Button type="submit" variant="contained" size="large" disabled={submitting} sx={{ mt: 1.5 }} fullWidth>
            Create account
          </Button>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ pt: 1 }}>
            Already have an account?{" "}
            <Button href="/login" size="small" sx={{ textTransform: "none", minWidth: 0, p: 0, verticalAlign: "baseline" }}>
              Sign in
            </Button>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}

export default PublicSignUp;
