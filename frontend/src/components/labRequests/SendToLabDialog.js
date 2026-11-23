import { useEffect, useMemo, useState } from "react";
import {
  Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, List, ListItem, ListItemIcon,
  ListItemText, MenuItem, Radio, RadioGroup, Stack, Switch, TextField, Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { COLLECTION_OPTIONS, authHeader, errorText } from "../labPortal/labShared";

/** Signed lab orders that can still go to an outside lab (not already sent by the interface or the portal). */
export const sendableLabOrders = (orders = []) =>
  orders.filter((o) => o.orderable_category === "laboratory" && ["active", "in_progress"].includes(o.status) && (o.interface_status || "not_sent") === "not_sent");

/**
 * Send signed lab orders to a partner lab on the POWER Lab Portal (or let the patient choose any partner lab).
 * One request per test by default, or all tests on one request. Inpatients: where the specimen is collected.
 * The lab gets a portal notice and one text; an outpatient gets a text with the code to show at the lab.
 */
export default function SendToLabDialog({ open, orders = [], preselect = [], onClose, onSent }) {
  const sendable = useMemo(() => sendableLabOrders(orders), [orders]);
  const [labs, setLabs] = useState([]);
  const [chosen, setChosen] = useState([]);
  const [labId, setLabId] = useState("");
  const [combine, setCombine] = useState(false);
  const [care, setCare] = useState("outpatient");
  const [collection, setCollection] = useState("at_lab");
  const [location, setLocation] = useState("");
  const [priority, setPriority] = useState("");
  const [fasting, setFasting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChosen(preselect.length ? preselect.filter((id) => sendable.some((o) => o.id === id)) : sendable.map((o) => o.id));
    setCombine(false);
    setCare("outpatient");
    setCollection("at_lab");
    setLocation("");
    setPriority("");
    setFasting(false);
    setNote("");
    setError("");
    (async () => {
      try {
        const res = await api.get(apiEndpoints.clinicLabs, { headers: await authHeader() });
        const portal = (res.data.results || []).filter((l) => l.mode === "partner_portal" && l.partner);
        setLabs(portal);
        const def = portal.find((l) => l.is_default && !l.partner.problem);
        setLabId(def ? String(def.id) : portal.length ? String(portal[0].id) : "");
      } catch (err) {
        setLabs([]);
        setError(errorText(err, "Could not load your lab directory."));
      }
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const lab = labs.find((l) => String(l.id) === labId);
  const inpatient = care === "inpatient";
  const collectionOk = (value) => {
    if (!lab) return value === "at_lab";
    if (value === "lab_at_bedside") return lab.partner.offers_bedside;
    if (value === "hospital_collects") return lab.partner.offers_courier;
    return true;
  };

  const toggle = (id) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post(apiEndpoints.labRequests, {
        orders: chosen, clinic_lab: labId || "", combine, care_setting: care, collection: inpatient ? collection : "at_lab",
        location: inpatient ? location : "", priority, fasting_required: fasting, note_to_lab: note,
      }, { headers: await authHeader() });
      const list = res.data || [];
      toast.success(`${list.length === 1 ? `Lab request ${list[0].number}` : `${list.length} lab requests`} sent${lab ? ` to ${lab.partner.name}` : ""}.`);
      onSent && onSent(list);
    } catch (err) {
      setError(errorText(err, "Could not send the orders to the lab."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth data-testid="send-to-lab-dialog">
      <DialogTitle>Send to an outside lab</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error" data-testid="send-to-lab-error">{error}</Alert>}
          {sendable.length === 0 ? (
            <Alert severity="info">No signed lab orders are waiting to be sent. Sign the lab orders first.</Alert>
          ) : (
            <List dense disablePadding>
              {sendable.map((o) => (
                <ListItem key={o.id} disableGutters onClick={() => toggle(o.id)} sx={{ cursor: "pointer" }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox edge="start" size="small" checked={chosen.includes(o.id)} tabIndex={-1} inputProps={{ "data-testid": `send-order-${o.id}` }} />
                  </ListItemIcon>
                  <ListItemText primary={o.orderable_name} secondary={`${o.placer_order_number || ""}${o.priority_display ? ` · ${o.priority_display}` : ""}`} />
                </ListItem>
              ))}
            </List>
          )}

          <TextField select size="small" label="Lab" value={labId} onChange={(e) => { setLabId(e.target.value); setCollection("at_lab"); }}
            SelectProps={{ displayEmpty: true, "data-testid": "send-lab" }} InputLabelProps={{ shrink: true }} helperText={labs.length === 0 ? "Your clinic's lab directory has no POWER Lab Portal labs yet. An administrator adds them under Partner Labs." : ""}>
            {labs.map((l) => (
              <MenuItem key={l.id} value={String(l.id)} disabled={!!l.partner.problem}>
                {l.name}{l.partner.hours ? ` · ${l.partner.hours}` : ""}{l.partner.problem ? " (not receiving requests)" : ""}
              </MenuItem>
            ))}
            {!inpatient && <MenuItem value="">Patient chooses any POWER partner lab</MenuItem>}
          </TextField>

          <RadioGroup row value={care} onChange={(e) => { setCare(e.target.value); setCollection("at_lab"); if (e.target.value === "inpatient" && !labId && labs[0]) setLabId(String(labs[0].id)); }}>
            <FormControlLabel value="outpatient" control={<Radio size="small" />} label="Outpatient" />
            <FormControlLabel value="inpatient" control={<Radio size="small" />} label="Inpatient (outsourced lab)" data-testid="send-inpatient" />
          </RadioGroup>

          {inpatient && (
            <Stack spacing={1.5}>
              <TextField select size="small" label="Specimen collection" value={collection} onChange={(e) => setCollection(e.target.value)}>
                {COLLECTION_OPTIONS.map((c) => (
                  <MenuItem key={c.value} value={c.value} disabled={!collectionOk(c.value)}>
                    {c.label}{collectionOk(c.value) ? "" : " (this lab doesn't offer it)"}
                  </MenuItem>
                ))}
              </TextField>
              <TextField size="small" label="Ward / room / bed" value={location} onChange={(e) => setLocation(e.target.value)} inputProps={{ "data-testid": "send-location" }} />
            </Stack>
          )}

          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField select size="small" label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="">From the orders</MenuItem>
              <MenuItem value="routine">Routine</MenuItem>
              <MenuItem value="urgent">Urgent</MenuItem>
              <MenuItem value="stat">STAT</MenuItem>
            </TextField>
            <FormControlLabel control={<Checkbox size="small" checked={fasting} onChange={(e) => setFasting(e.target.checked)} />} label="Fasting required" />
          </Stack>
          <FormControlLabel
            control={<Switch checked={combine} onChange={(e) => setCombine(e.target.checked)} disabled={chosen.length < 2} inputProps={{ "data-testid": "send-combine" }} />}
            label={combine ? "All tests on one request" : "One request per test"}
          />
          <TextField size="small" label="Note to the lab (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
          <Typography variant="caption" color="text.secondary">
            The lab gets a portal notice and a text. {inpatient ? "" : "The patient gets a text with the code to show at the lab. "}
            Texts never include the patient's name, the tests or any values.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || chosen.length === 0 || (inpatient && !labId)} onClick={send} data-testid="send-to-lab-submit">Send</Button>
      </DialogActions>
    </Dialog>
  );
}
