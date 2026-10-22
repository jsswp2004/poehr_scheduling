import { useEffect, useRef, useState } from "react";
import { Alert, Autocomplete, Box, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { loadScanVisits, searchScanPatients } from "./scanApi";

const patientLabel = (p) => (p ? `${p.mrn} · ${p.name}` : "");
const visitLabel = (v) => (v ? `${v.code} · ${v.date} · ${v.title}` : "");

/**
 * The MRN and Visit ID of a scan: two searchable lists that start on the open chart's patient
 * and visit. Picking another MRN loads that patient's visits; the Visit ID list always shows the
 * chosen patient's own visits only. A warning shows when the scan is going to someone other
 * than the open chart's patient.
 *
 * `value` is { patient, visit } (either may be null); `onChange` gets the same shape.
 * `context` is the open chart's { patient, visit } so the mismatch can be shown.
 */
export default function PatientVisitPicker({ value, onChange, context, disabled = false }) {
  const [patientOptions, setPatientOptions] = useState([]);
  const [patientInput, setPatientInput] = useState(patientLabel(value.patient));
  const [searching, setSearching] = useState(false);
  const [visits, setVisits] = useState([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const latest = useRef(0);

  // Typing in MRN searches by MRN or name once there are at least two characters.
  useEffect(() => {
    const text = patientInput.trim();
    if (value.patient && text === patientLabel(value.patient)) {
      setPatientOptions([value.patient]);
      return undefined;
    }
    if (text.length < 2) {
      setPatientOptions(value.patient ? [value.patient] : []);
      return undefined;
    }
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchScanPatients(text);
        if (ticket === latest.current) setPatientOptions(found);
      } catch (err) {
        if (ticket === latest.current) setPatientOptions([]);
      } finally {
        if (ticket === latest.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [patientInput, value.patient]);

  // The visits of the chosen patient.
  const patientId = value.patient?.id;
  useEffect(() => {
    if (!patientId) {
      setVisits([]);
      return undefined;
    }
    let alive = true;
    setVisitsLoading(true);
    loadScanVisits(patientId)
      .then((data) => alive && setVisits(data.visits))
      .catch(() => alive && setVisits([]))
      .finally(() => alive && setVisitsLoading(false));
    return () => {
      alive = false;
    };
  }, [patientId]);

  const mismatch = !!(value.patient && context?.patient && value.patient.id !== context.patient.id);

  const pickPatient = (_e, patient) => {
    if (!patient) {
      onChange({ patient: null, visit: null });
      return;
    }
    onChange({ patient, visit: null }); // the visit list reloads; the first visit is picked below
  };

  // When the visits arrive: keep the chosen one, else the open chart's visit, else the newest.
  useEffect(() => {
    if (!patientId || visitsLoading || !visits.length) return;
    if (value.visit && visits.some((v) => v.id === value.visit.id)) return;
    const wanted = context?.patient?.id === patientId && context.visit ? visits.find((v) => v.id === context.visit.id) : null;
    onChange({ patient: value.patient, visit: wanted || visits[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits, visitsLoading, patientId]);

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <Autocomplete
          size="small"
          fullWidth
          disabled={disabled}
          options={patientOptions}
          value={value.patient}
          inputValue={patientInput}
          onInputChange={(_e, text) => setPatientInput(text)}
          onChange={(e, p) => {
            pickPatient(e, p);
            setPatientInput(patientLabel(p));
          }}
          filterOptions={(x) => x}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          getOptionLabel={patientLabel}
          loading={searching}
          noOptionsText={patientInput.trim().length < 2 ? "Type an MRN or name" : "No patient matches that search"}
          renderOption={(props, p) => (
            <li {...props} key={p.id}>
              <Box>
                <Typography variant="body2" fontWeight={500}>
                  {p.mrn}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {p.name}
                  {p.date_of_birth ? ` · DOB ${p.date_of_birth}` : ""}
                </Typography>
              </Box>
            </li>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="MRN"
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {searching ? <CircularProgress color="inherit" size={16} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
        <Autocomplete
          size="small"
          fullWidth
          disabled={disabled || !value.patient}
          options={visits}
          value={value.visit}
          onChange={(_e, v) => onChange({ patient: value.patient, visit: v })}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          getOptionLabel={visitLabel}
          loading={visitsLoading}
          noOptionsText="This patient has no visits"
          renderOption={(props, v) => (
            <li {...props} key={v.id}>
              <Box>
                <Typography variant="body2" fontWeight={500}>
                  {v.code}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {v.date} · {v.title}
                </Typography>
              </Box>
            </li>
          )}
          renderInput={(params) => <TextField {...params} label="Visit ID" />}
        />
      </Stack>
      {mismatch && (
        <Alert severity="warning">
          <strong>Different patient.</strong> You have {context.patient.name}'s chart open, but this scan will be filed to{" "}
          <strong>
            {value.patient.name} ({value.patient.mrn})
          </strong>
          . Check the MRN before you scan.
        </Alert>
      )}
    </Stack>
  );
}
