import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Grid, IconButton, Link, Paper, Stack, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";

const BLANK = {
  name: "", address: "", city: "", province: "", phone: "", email: "", fda_lto_number: "", lto_expiry: "",
  first_name: "", last_name: "", admin_prc_number: "", username: "", password: "",
};

/**
 * A pharmacy signs up for the POWER Pharmacy Portal: the pharmacy and its FDA License to Operate, the
 * administrator's login, and its pharmacists' PRC license numbers. It stays pending until POWER approves it.
 */
export default function PharmacyPortalRegisterPage() {
  const [form, setForm] = useState(BLANK);
  const [pharmacists, setPharmacists] = useState([{ full_name: "", prc_number: "" }]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const field = (key, label, extra = {}) => (
    <TextField size="small" fullWidth label={label} value={form[key]} onChange={set(key)} inputProps={{ "data-testid": `reg-${key}` }} {...extra} />
  );
  const setPh = (i, key) => (e) => setPharmacists((list) => list.map((p, j) => (j === i ? { ...p, [key]: e.target.value } : p)));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post(apiEndpoints.portalRegister, { ...form, pharmacists: pharmacists.filter((p) => p.prc_number.trim()) });
      setDone(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not register the pharmacy.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", p: 3 }} data-testid="reg-done">
        <Alert severity="success">
          {done.pharmacy.name} is registered. POWER will review your FDA License to Operate and your pharmacists' PRC numbers;
          you can sign in as <b>{done.username}</b> and use the portal once it is approved.
        </Alert>
        <Button component={RouterLink} to="/login" sx={{ mt: 2 }}>Go to sign in</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 860, mx: "auto", p: 3 }} data-testid="pharmacy-portal-register">
      <Typography variant="h5" sx={{ mb: 1 }}>Register your pharmacy on the POWER Pharmacy Portal</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Receive POWER prescriptions from clinics and claim printed ones with their claim code. Your pharmacy can use the portal once POWER approves it.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} data-testid="reg-error">{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Pharmacy</Typography>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, sm: 8 }}>{field("name", "Pharmacy name")}</Grid>
          <Grid size={{ xs: 12, sm: 4 }}>{field("phone", "Phone")}</Grid>
          <Grid size={12}>{field("address", "Street address")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("city", "City / municipality")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("province", "Province")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("fda_lto_number", "FDA License to Operate (LTO) number")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("lto_expiry", "LTO valid until", { type: "date", InputLabelProps: { shrink: true } })}</Grid>
          <Grid size={12}>{field("email", "Email for portal notices")}</Grid>
        </Grid>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Your sign-in (the pharmacy's administrator)</Typography>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, sm: 6 }}>{field("first_name", "First name")}</Grid>
          <Grid size={{ xs: 12, sm: 6 }}>{field("last_name", "Last name")}</Grid>
          <Grid size={{ xs: 12, sm: 4 }}>{field("admin_prc_number", "Your PRC number (if you are a pharmacist)")}</Grid>
          <Grid size={{ xs: 12, sm: 4 }}>{field("username", "Username")}</Grid>
          <Grid size={{ xs: 12, sm: 4 }}>{field("password", "Password (10+ characters)", { type: "password" })}</Grid>
        </Grid>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Pharmacists (PRC license, RA 10918)</Typography>
        {pharmacists.map((p, i) => (
          <Stack key={i} direction="row" spacing={1} sx={{ mb: 1 }}>
            <TextField size="small" fullWidth label="Full name" value={p.full_name} onChange={setPh(i, "full_name")} inputProps={{ "data-testid": `reg-ph-name-${i}` }} />
            <TextField size="small" fullWidth label="PRC license number" value={p.prc_number} onChange={setPh(i, "prc_number")} inputProps={{ "data-testid": `reg-ph-prc-${i}` }} />
            <IconButton aria-label="Remove pharmacist" onClick={() => setPharmacists((list) => list.filter((_, j) => j !== i))} disabled={pharmacists.length === 1}><DeleteIcon /></IconButton>
          </Stack>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={() => setPharmacists((list) => [...list, { full_name: "", prc_number: "" }])}>Add a pharmacist</Button>
      </Paper>
      <Stack direction="row" spacing={2} alignItems="center">
        <Button variant="contained" onClick={submit} disabled={busy} data-testid="reg-submit">Register</Button>
        <Link component={RouterLink} to="/login">Already registered? Sign in</Link>
      </Stack>
    </Box>
  );
}
