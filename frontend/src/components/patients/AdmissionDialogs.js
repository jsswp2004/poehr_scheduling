import { useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "../patientHeader/headerApi";
import LocationPicker, { useLocationTree } from "../locations/LocationPicker";

const EMPTY_PLACE = { facility: "", unit: "", room: "", bed: "" };
const toNull = (v) => (v === "" || v == null ? null : v);

/** Local "now" in the form a datetime-local input wants. */
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Keep only the units that pass `keep`, and drop clinics left with none. */
const onlyUnits = (tree, keep) =>
  (tree || [])
    .map((f) => ({ ...f, units: f.units.filter(keep) }))
    .filter((f) => f.units.length > 0);

function useAction(onDone, onClose) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const run = async (url, body, okMessage) => {
    setBusy(true);
    setProblem("");
    try {
      const headers = await authHeader();
      await api.post(url, body, { headers });
      toast.success(okMessage);
      if (onDone) await onDone();
      onClose();
    } catch (err) {
      setProblem(errorText(err, "That did not work."));
    } finally {
      setBusy(false);
    }
  };
  return { busy, problem, run };
}

/** Admit a patient to an inpatient unit (and a bed). `patient` is a row from the patient list. */
export function AdmitDialog({ patient, providers = [], onClose, onDone }) {
  const tree = useLocationTree();
  const inpatientTree = useMemo(() => (tree === null ? null : onlyUnits(tree, (u) => u.care_type === "inpatient")), [tree]);
  const [place, setPlace] = useState(EMPTY_PLACE);
  const [attending, setAttending] = useState("");
  const { busy, problem, run } = useAction(onDone, onClose);
  if (!patient) return null;

  // an ED visit still open is the one being admitted; anything else starts a new inpatient visit
  const visit = patient.current_visit;
  const edVisit = visit && !visit.discharge_datetime && visit.care_setting === "emergency" ? visit.id : null;

  const submit = () =>
    run(
      apiEndpoints.admissionAdmit,
      {
        patient: patient.id,
        registration: edVisit,
        unit: toNull(place.unit),
        room: toNull(place.room),
        bed: toNull(place.bed),
        attending_provider: toNull(attending),
      },
      `${patient.full_name} admitted`
    );

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Admit {patient.full_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {edVisit && (
            <Typography variant="body2" color="text.secondary">
              This admits the patient from their emergency visit {visit.visit_number}.
            </Typography>
          )}
          {inpatientTree && inpatientTree.length === 0 ? (
            <Typography variant="body2" color="error" data-testid="no-inpatient-units">
              There are no inpatient units yet. An admin can add one in the Location Manager.
            </Typography>
          ) : (
            <LocationPicker tree={inpatientTree} value={place} onChange={(loc) => setPlace(loc)} />
          )}
          <FormControl size="small" fullWidth>
            <InputLabel id="admit-attending">Attending provider</InputLabel>
            <Select labelId="admit-attending" label="Attending provider" value={attending} onChange={(e) => setAttending(e.target.value)} inputProps={{ "data-testid": "admit-attending" }}>
              <MenuItem value="">Not specified</MenuItem>
              {providers.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  Dr. {d.first_name} {d.last_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {problem && (
            <Typography color="error" variant="body2" role="alert">
              {problem}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy || !place.unit}>
          Admit
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Move an admitted patient to another unit, room or bed. */
export function TransferDialog({ patient, onClose, onDone }) {
  const tree = useLocationTree();
  const [place, setPlace] = useState(EMPTY_PLACE);
  const { busy, problem, run } = useAction(onDone, onClose);
  if (!patient || !patient.current_visit) return null;
  const visit = patient.current_visit;

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Transfer {patient.full_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Now in: {visit.location || "no location"}
          </Typography>
          <LocationPicker tree={tree} value={place} onChange={(loc) => setPlace(loc)} />
          {problem && (
            <Typography color="error" variant="body2" role="alert">
              {problem}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={busy || !place.unit}
          onClick={() =>
            run(
              apiEndpoints.admissionTransfer(visit.id),
              { unit: toNull(place.unit), room: toNull(place.room), bed: toNull(place.bed) },
              `${patient.full_name} transferred`
            )
          }
        >
          Transfer
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Discharge: ends the visit and frees the bed. */
export function DischargeDialog({ patient, onClose, onDone }) {
  const [when, setWhen] = useState(nowLocal);
  const { busy, problem, run } = useAction(onDone, onClose);
  if (!patient || !patient.current_visit) return null;
  const visit = patient.current_visit;

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Discharge {patient.full_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {visit.location ? `This frees ${visit.location}.` : "This ends the visit."}
          </Typography>
          <TextField
            label="Discharge time"
            type="datetime-local"
            size="small"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ "data-testid": "discharge-time" }}
          />
          {problem && (
            <Typography color="error" variant="body2" role="alert">
              {problem}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          disabled={busy || !when}
          onClick={() =>
            run(
              apiEndpoints.admissionDischarge(visit.id),
              { discharge_datetime: new Date(when).toISOString() },
              `${patient.full_name} discharged`
            )
          }
        >
          Discharge
        </Button>
      </DialogActions>
    </Dialog>
  );
}
