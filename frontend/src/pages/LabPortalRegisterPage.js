import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert, Box, Button, Checkbox, FormControlLabel, Grid, IconButton, Link, MenuItem, Paper, Stack, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";

const BLANK = {
  country: "PH", name: "", address: "", city: "", province: "", postal_code: "", phone: "", sms_mobile: "", email: "",
  license_number: "", license_expiry: "", license_category: "", head_name: "", head_license: "", hours: "",
  offers_walk_in: true, offers_bedside: false, offers_courier: false, offers_home_service: false,
  first_name: "", last_name: "", admin_license: "", admin_is_pathologist: false, admin_mobile: "", username: "", password: "",
};
const BLANK_STAFF = { full_name: "", license_number: "", email: "", mobile: "", is_pathologist: false };

/**
 * A laboratory signs up for the POWER Lab Portal: the lab and its license (DOH License to Operate in the
 * Philippines, CLIA in the US), the head of the lab, what it offers, the administrator's login and its staff.
 * It stays pending until POWER approves it.
 */
export default function LabPortalRegisterPage() {
  const [form, setForm] = useState(BLANK);
  const [staff, setStaff] = useState([{ ...BLANK_STAFF }]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const us = form.country === "US";

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const field = (key, label, extra = {}) => (
    <TextField size="small" fullWidth label={label} value={form[key]} onChange={set(key)} inputProps={{ "data-testid": `labreg-${key}` }} {...extra} />
  );
  const check = (key, label) => <FormControlLabel control={<Checkbox checked={!!form[key]} onChange={set(key)} />} label={label} />;
  const setSt = (i, key) => (e) => setStaff((list) => list.map((s, j) => (j === i ? { ...s, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value } : s)));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post(apiEndpoints.labPortalRegister, { ...form, staff: staff.filter((s) => s.full_name.trim()) });
      setDone(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not register the laboratory.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", p: 3 }} data-testid="labreg-done">
        <Alert severity="success">
          {done.lab.name} is registered. POWER will check your laboratory license and your staff's license numbers. You can sign
          in as <b>{done.username}</b> and use the portal once it is approved.
        </Alert>
        <Button component={RouterLink} to="/login" sx={{ mt: 2 }}>Go to sign in</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", p: 3 }} data-testid="lab-portal-register">
      <Typography variant="h5" sx={{ mb: 1 }}>Register your laboratory on the POWER Lab Portal</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Receive lab requests from POWER clinics and hospitals, get a text for each new request, and send results straight back to the ordering provider.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} data-testid="labreg-error">{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Laboratory</Typography>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, sm: 3 }}>
            {field("country", "Country", { select: true, children: [<MenuItem key="PH" value="PH">Philippines</MenuItem>, <MenuItem key="US" value="US">United States</MenuItem>] })}
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("name", "Laboratory name")}</Grid>
          <Grid size={{ xs: 12, sm: 3 }}>{field("phone", "Phone")}</Grid>
          <Grid size={12}>{field("address", "Street address")}</Grid>
          <Grid size={{ xs: 12, sm: 5 }}>{field("city", "City / municipality")}</Grid>
          <Grid size={{ xs: 12, sm: 4 }}>{field("province", us ? "State" : "Province")}</Grid>
          <Grid size={{ xs: 12, sm: 3 }}>{field("postal_code", us ? "ZIP code" : "Postal code")}</Grid>
          <Grid size={{ xs: 12, sm: 5 }}>{field("license_number", us ? "CLIA number" : "DOH License to Operate number")}</Grid>
          <Grid size={{ xs: 12, sm: 3 }}>{field("license_expiry", "License valid until", { type: "date", InputLabelProps: { shrink: true } })}</Grid>
          <Grid size={{ xs: 12, sm: 4 }}>{field("license_category", us ? "Certificate type (e.g. Compliance)" : "Category (primary, secondary, tertiary)")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("head_name", us ? "Laboratory director" : "Head pathologist")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("head_license", us ? "Director's license number" : "Head pathologist's PRC number")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("hours", "Hours (shown to patients)", { placeholder: "Mon-Sat 6am-6pm" })}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("email", "Email for portal notices")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("sms_mobile", "Mobile number for new-request texts", { placeholder: us ? "(555) 123-4567" : "0917 123 4567", helperText: "Used when none of your staff has a mobile number" })}</Grid>
          <Grid size={12}>
            {check("offers_walk_in", "Walk-in patients")}
            {check("offers_bedside", "Bedside collection (inpatients)")}
            {check("offers_courier", "Specimen courier pickup")}
            {check("offers_home_service", "Home service")}
          </Grid>
        </Grid>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Your sign-in (the laboratory's administrator)</Typography>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, sm: 6 }}>{field("first_name", "First name")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("last_name", "Last name")}</Grid>
          <Grid size={{ xs: 12, sm: 4 }}>{field("admin_license", us ? "Your license number (if you run tests)" : "Your PRC number (if you are an RMT or pathologist)")}</Grid>
          <Grid size={{ xs: 12, sm: 4 }}>{field("admin_mobile", "Your mobile for texts (optional)")}</Grid>
          <Grid size={{ xs: 12, sm: 4 }}>{check("admin_is_pathologist", "I am a pathologist")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("username", "Username")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("password", "Password (10+ characters)", { type: "password" })}</Grid>
        </Grid>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>{us ? "Testing personnel" : "Medical technologists and pathologists (PRC license)"}</Typography>
        {staff.map((s, i) => (
          <Stack key={i} direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 1 }} alignItems={{ md: "center" }}>
            <TextField size="small" fullWidth label="Full name" value={s.full_name} onChange={setSt(i, "full_name")} inputProps={{ "data-testid": `labreg-st-name-${i}` }} />
            <TextField size="small" fullWidth label={us ? "License number" : "PRC license number"} value={s.license_number} onChange={setSt(i, "license_number")} />
            <TextField size="small" fullWidth label="Email" value={s.email} onChange={setSt(i, "email")} />
            <TextField size="small" fullWidth label="Mobile for texts (optional)" value={s.mobile} onChange={setSt(i, "mobile")} />
            <FormControlLabel control={<Checkbox checked={s.is_pathologist} onChange={setSt(i, "is_pathologist")} />} label="Pathologist" />
            <IconButton aria-label="Remove person" onClick={() => setStaff((list) => list.filter((_, j) => j !== i))} disabled={staff.length === 1}><DeleteIcon /></IconButton>
          </Stack>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={() => setStaff((list) => [...list, { ...BLANK_STAFF }])}>Add a person</Button>
      </Paper>
      <Stack direction="row" spacing={2} alignItems="center">
        <Button variant="contained" onClick={submit} disabled={busy} data-testid="labreg-submit">Register</Button>
        <Link component={RouterLink} to="/login">Already registered? Sign in</Link>
      </Stack>
    </Box>
  );
}
