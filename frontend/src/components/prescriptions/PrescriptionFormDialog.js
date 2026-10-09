import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import IcdCodePicker, { dxLabel } from "../IcdCodePicker";
import PharmacyDialog from "./PharmacyDialog";
import FavoritesDialog from "./FavoritesDialog";
import { authHeader, buildSig, errorText, pharmacyLine, saveFavorite } from "./rxShared";

const BLANK = {
  drug_name: "", code_system: "", code: "", strength: "", form: "", dose: "", route: "PO", frequency: "",
  duration_days: "", prn: false, prn_reason: "", sig_extra: "", quantity: "", quantity_unit: "", days_supply: "",
  refills: 0, dispense_as_written: false, note_to_pharmacist: "", prescriber: "", pharmacy: null, dx: [],
};

const fromRx = (rx, pharmacies) => ({
  ...BLANK,
  drug_name: rx.drug_name, code_system: rx.code_system || "", code: rx.code || "", strength: rx.strength || "", form: rx.form || "",
  dose: rx.dose || "", route: rx.route || "", frequency: rx.frequency || "", duration_days: rx.duration_days ?? "",
  prn: !!rx.prn, prn_reason: rx.prn_reason || "", sig_extra: rx.sig_extra || "", quantity: rx.quantity ?? "",
  quantity_unit: rx.quantity_unit || "", days_supply: rx.days_supply ?? "", refills: rx.refills ?? 0,
  dispense_as_written: !!rx.dispense_as_written, note_to_pharmacist: rx.note_to_pharmacist || "", prescriber: rx.prescriber || "",
  pharmacy: rx.pharmacy ? pharmacies.find((p) => p.id === rx.pharmacy) || { id: rx.pharmacy, name: rx.pharmacy_name } : null,
  dx: rx.indication_code ? [{ code: rx.indication_code, description: rx.indication_text || "" }] : [],
});

/**
 * Write or edit a draft prescription. Nothing is signed or sent from here: the prescribing doctor signs it
 * from the prescription, then it is printed or faxed. Controlled substances can't be chosen.
 */
export default function PrescriptionFormDialog({ open, onClose, onSaved, patient, prescription = null, defaults = null, meta, me }) {
  const [form, setForm] = useState(BLANK);
  const [pharmacies, setPharmacies] = useState([]);
  const [drugOptions, setDrugOptions] = useState([]);
  const [drugText, setDrugText] = useState("");
  const [addPharmacy, setAddPharmacy] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const hadPreferred = useRef(false);
  const editing = !!prescription;
  const isDoctor = me?.role === "doctor";

  useEffect(() => {
    if (!open) return undefined;
    setError("");
    setDrugOptions([]);
    let cancelled = false;
    (async () => {
      let list = [];
      let preferred = null;
      try {
        const headers = await authHeader();
        const res = await api.get(apiEndpoints.pharmacies, { headers });
        list = res.data?.results || [];
        if (!prescription && patient?.id) {
          const pref = await api.get(apiEndpoints.patientPharmacy(patient.id), { headers });
          preferred = pref.data?.pharmacy ? list.find((p) => p.id === pref.data.pharmacy.id) || pref.data.pharmacy : null;
          hadPreferred.current = !!preferred;
        }
      } catch (err) {
        /* the form still works without a directory */
      }
      if (cancelled) return;
      setPharmacies(list);
      if (prescription) setForm(fromRx(prescription, list));
      else {
        // `defaults` prefill a new prescription (from a home medication, a favorite, or a renewal); the amounts come with them
        const start = defaults ? fromRx(defaults, list) : BLANK;
        setForm({ ...start, prescriber: isDoctor ? me.id : "", pharmacy: preferred || start.pharmacy });
      }
      setDrugText(prescription ? prescription.drug_name : defaults?.drug_name || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, prescription, defaults, patient, isDoctor, me]);

  useEffect(() => {
    const term = drugText.trim();
    if (!open || term.length < 2 || term === form.drug_name) return undefined;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(apiEndpoints.prescriptionDrugs, { headers: await authHeader(), params: { q: term } });
        if (mine === seq.current) setDrugOptions(res.data?.results || []);
      } catch (err) {
        if (mine === seq.current) setDrugOptions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [drugText, open, form.drug_name]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const num = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value.replace(/[^\d.]/g, "") }));

  const pickDrug = (_, value) => {
    if (value && typeof value === "object") {
      setForm((f) => ({ ...f, drug_name: value.display, code_system: value.system || "", code: value.code || "" }));
    } else {
      setForm((f) => ({ ...f, drug_name: value || "", code_system: "", code: "" }));
    }
  };

  // start from a favorite: its drug, directions and amounts replace the form; the doctor and pharmacy stay as chosen
  const useFavorite = (fav) => {
    setForm((f) => ({ ...fromRx(fav, pharmacies), prescriber: f.prescriber, pharmacy: f.pharmacy }));
    setDrugText(fav.drug_name || "");
    setShowFavorites(false);
  };

  const body = () => {
    const dx = form.dx[0];
    return {
      drug_name: (form.drug_name || drugText).trim(), code_system: form.code_system, code: form.code, strength: form.strength, form: form.form,
      dose: form.dose, route: form.route, frequency: form.frequency, duration_days: form.duration_days === "" ? null : Number(form.duration_days),
      prn: form.prn, prn_reason: form.prn_reason, sig_extra: form.sig_extra,
      quantity: form.quantity === "" ? null : form.quantity, quantity_unit: form.quantity_unit,
      days_supply: form.days_supply === "" ? null : Number(form.days_supply), refills: Number(form.refills) || 0,
      dispense_as_written: form.dispense_as_written, note_to_pharmacist: form.note_to_pharmacist,
      indication_code: dx ? dx.code : "", indication_text: dx ? dx.description || "" : "",
    };
  };

  const saveAsFavorite = async () => {
    setError("");
    if (!body().drug_name) return setError("Choose the drug first.");
    try {
      await saveFavorite(body());
      toast.success("Saved to your favorites.");
    } catch (err) {
      setError(errorText(err, "Could not save the favorite."));
    }
  };

  const save = async () => {
    setError("");
    const drug = (form.drug_name || drugText).trim();
    if (!drug) return setError("Choose the drug.");
    if (!editing && !form.prescriber) return setError("Choose the prescribing doctor.");
    const payload = { ...body(), drug_name: drug, pharmacy: form.pharmacy ? form.pharmacy.id : null };
    if (form.prescriber) payload.prescriber = form.prescriber;
    setBusy(true);
    try {
      const headers = await authHeader();
      const res = editing
        ? await api.patch(apiEndpoints.prescription(prescription.id), payload, { headers })
        : await api.post(apiEndpoints.prescriptions, { ...payload, patient: patient.id }, { headers });
      if (!editing && form.pharmacy && !hadPreferred.current) {
        // the first pharmacy chosen for a patient becomes their preferred one
        try {
          await api.put(apiEndpoints.patientPharmacy(patient.id), { pharmacy: form.pharmacy.id }, { headers });
        } catch (err) {
          /* the prescription is saved; the preference is a convenience */
        }
      }
      toast.success(editing ? "Draft saved." : "Draft created. Review it, then sign.");
      onSaved(res.data);
    } catch (err) {
      setError(errorText(err, "Could not save the prescription."));
    } finally {
      setBusy(false);
    }
  };

  const doctors = meta?.doctors || [];
  const frequencies = meta?.frequencies || [];
  const routes = meta?.routes || [];
  const forms = meta?.forms || [];
  const preview = form.dose || form.frequency ? buildSig(form) : "";
  const controlledNow = !!form.drug_name && drugOptions.some((o) => o.display === form.drug_name && o.controlled);

  return (
    <>
      <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md" data-testid="rx-form">
        <DialogTitle>
          {editing ? "Edit draft prescription" : "New prescription"}
          {patient?.name ? ` — ${patient.name}` : editing ? ` — ${prescription.patient_name}` : ""}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {error && <Alert severity="error" data-testid="rx-form-error">{error}</Alert>}
            <Alert severity="info" icon={false} sx={{ py: 0 }}>
              {meta?.controlled_message || "Controlled substances (Schedule II-V) can't be written here."}
            </Alert>
            <Autocomplete
              freeSolo
              options={drugOptions}
              value={form.drug_name || null}
              inputValue={drugText}
              onInputChange={(_, v) => setDrugText(v)}
              onChange={pickDrug}
              filterOptions={(o) => o}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.display)}
              getOptionDisabled={(o) => typeof o !== "string" && !!o.controlled}
              renderOption={(props, o) => {
                const { key, ...rest } = props;
                return (
                  <li key={key} {...rest}>
                    {o.display}
                    {o.controlled && <Chip size="small" color="warning" label="Controlled - not available" sx={{ ml: 1 }} />}
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField {...params} size="small" label="Drug" inputProps={{ ...params.inputProps, "data-testid": "rx-drug" }} helperText="Type at least two letters to search, or type the name." />
              )}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" fullWidth label="Strength" placeholder="500 mg" value={form.strength} onChange={set("strength")} inputProps={{ "data-testid": "rx-strength" }} />
              <TextField select size="small" fullWidth label="Form" value={form.form} onChange={set("form")} inputProps={{ "data-testid": "rx-form-type" }}>
                <MenuItem value="">&nbsp;</MenuItem>
                {forms.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
              </TextField>
            </Stack>
            <Typography variant="subtitle2">Directions</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" fullWidth label="Dose" placeholder="1 tablet" value={form.dose} onChange={set("dose")} inputProps={{ "data-testid": "rx-dose" }} />
              <TextField select size="small" fullWidth label="Route" value={form.route} onChange={set("route")} inputProps={{ "data-testid": "rx-route" }}>
                {routes.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </TextField>
              <TextField select size="small" fullWidth label="How often" value={form.frequency} onChange={set("frequency")} inputProps={{ "data-testid": "rx-frequency" }}>
                {frequencies.map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
              </TextField>
              <TextField size="small" fullWidth label="For (days)" value={form.duration_days} onChange={num("duration_days")} inputProps={{ "data-testid": "rx-duration" }} />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
              <FormControlLabel
                control={<Checkbox size="small" checked={form.prn} onChange={(e) => setForm((f) => ({ ...f, prn: e.target.checked }))} inputProps={{ "data-testid": "rx-prn" }} />}
                label="As needed"
              />
              {(form.prn || form.frequency === "prn") && (
                <TextField size="small" fullWidth label="As needed for" placeholder="pain" value={form.prn_reason} onChange={set("prn_reason")} inputProps={{ "data-testid": "rx-prn-reason" }} />
              )}
              <TextField size="small" fullWidth label="Extra directions (optional)" placeholder="with food" value={form.sig_extra} onChange={set("sig_extra")} inputProps={{ "data-testid": "rx-sig-extra" }} />
            </Stack>
            {preview && (
              <Box sx={{ bgcolor: "action.hover", borderRadius: 1, px: 1.5, py: 1 }} data-testid="rx-sig-preview">
                <Typography variant="caption" color="text.secondary">Directions as they will print</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{preview}</Typography>
              </Box>
            )}
            <Typography variant="subtitle2">How much</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" fullWidth label="Quantity" value={form.quantity} onChange={num("quantity")} inputProps={{ "data-testid": "rx-quantity" }} />
              <TextField size="small" fullWidth label="Unit" placeholder="tablets" value={form.quantity_unit} onChange={set("quantity_unit")} inputProps={{ "data-testid": "rx-unit" }} />
              <TextField size="small" fullWidth label="Days' supply" value={form.days_supply} onChange={num("days_supply")} inputProps={{ "data-testid": "rx-days-supply" }} />
              <TextField
                select size="small" fullWidth label="Refills" value={form.refills} onChange={set("refills")} inputProps={{ "data-testid": "rx-refills" }}
              >
                {Array.from({ length: (meta?.max_refills ?? 11) + 1 }, (_, i) => <MenuItem key={i} value={i}>{i}</MenuItem>)}
              </TextField>
            </Stack>
            <FormControlLabel
              control={<Checkbox size="small" checked={form.dispense_as_written} onChange={(e) => setForm((f) => ({ ...f, dispense_as_written: e.target.checked }))} inputProps={{ "data-testid": "rx-daw" }} />}
              label="Dispense as written (brand medically necessary)"
            />
            <Box>
              <IcdCodePicker value={form.dx} onChange={(list) => setForm((f) => ({ ...f, dx: list.slice(-1) }))} label="Indication (ICD-10, optional)" />
              {form.dx[0] && <Typography variant="caption" color="text.secondary">{dxLabel(form.dx[0])}</Typography>}
            </Box>
            <TextField size="small" label="Note to the pharmacist (optional)" value={form.note_to_pharmacist} onChange={set("note_to_pharmacist")} inputProps={{ "data-testid": "rx-note" }} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Autocomplete
                fullWidth
                options={pharmacies}
                value={form.pharmacy}
                getOptionLabel={(o) => pharmacyLine(o)}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                onChange={(_, v) => setForm((f) => ({ ...f, pharmacy: v }))}
                renderInput={(params) => <TextField {...params} size="small" label="Pharmacy" inputProps={{ ...params.inputProps, "data-testid": "rx-pharmacy" }} />}
              />
              <Button size="small" onClick={() => setAddPharmacy(true)} sx={{ whiteSpace: "nowrap" }} data-testid="rx-add-pharmacy">Add pharmacy</Button>
            </Stack>
            <TextField
              select size="small" label="Prescribing doctor" value={form.prescriber} onChange={set("prescriber")}
              disabled={isDoctor && !editing} inputProps={{ "data-testid": "rx-prescriber" }}
              helperText={!isDoctor ? "Only this doctor can sign it." : ""}
            >
              {doctors.map((d) => (
                <MenuItem key={d.id} value={d.id}>{d.name}{d.ready ? "" : " (details incomplete)"}</MenuItem>
              ))}
            </TextField>
            {controlledNow && <Alert severity="warning">That is a controlled substance and can't be prescribed here.</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          {!editing && <Button onClick={() => setShowFavorites(true)} disabled={busy} sx={{ mr: "auto" }} data-testid="rx-open-favorites">Favorites</Button>}
          <Button onClick={saveAsFavorite} disabled={busy} data-testid="rx-save-favorite">Save as favorite</Button>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={busy} data-testid="rx-form-save">
            {busy ? <CircularProgress size={18} /> : editing ? "Save draft" : "Create draft"}
          </Button>
        </DialogActions>
      </Dialog>
      <FavoritesDialog open={showFavorites} onClose={() => setShowFavorites(false)} onUse={useFavorite} />
      <PharmacyDialog
        open={addPharmacy}
        onClose={() => setAddPharmacy(false)}
        onSaved={(p) => {
          setPharmacies((list) => [...list, p]);
          setForm((f) => ({ ...f, pharmacy: p }));
          setAddPharmacy(false);
        }}
      />
    </>
  );
}
