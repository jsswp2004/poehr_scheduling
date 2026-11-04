import { useEffect, useState } from "react";
import { Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";
import StatusChip from "./StatusChip";
import { CASE_TYPES, hoursMinutes, toInputValue, usDateTime } from "./surgeryUtils";

const formFrom = (row) => ({
  planned_start: toInputValue(row.header.planned_start),
  scheduled_delay_reason: row.header.scheduled_delay_reason || "",
  planned_delay_reason: row.header.planned_delay_reason || "",
  requires_review: !!row.header.requires_review,
  review_reason: row.header.review_reason || "",
  room: row.room ? String(row.room.id) : "",
  case_type: row.case_type,
  anesthesia_type: row.anesthesia_type || "",
  physical_status: row.header.physical_status || "",
  block_id: row.header.block_id || "",
  comments: row.comments || "",
  booking_comments_2: row.header.booking_comments_2 || "",
  procedure_notes: row.header.procedure_notes || "",
  provider_notes: row.header.provider_notes || "",
});

// What a closed case still lets people write.
const NOTE_KEYS = ["comments", "booking_comments_2", "procedure_notes", "provider_notes"];

const Section = ({ title, children }) => (
  <Paper variant="outlined" sx={{ p: 1.5 }}>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>
      {title}
    </Typography>
    {children}
  </Paper>
);

/** Options for a select that also keeps a saved value which is no longer in the list. */
const withCurrent = (options, current) => (current && !options.includes(current) ? [current, ...options] : options);

/** The Case Header tab: schedule and delay, who/where, review flag, and the four note boxes. */
export default function CaseHeaderPanel({ row, lookups, rooms, canEdit, onSaved, onEditBooking }) {
  const [form, setForm] = useState(() => formFrom(row));
  const [busy, setBusy] = useState(false);
  const closed = row.next_statuses.length === 0;
  const locked = !canEdit || closed;
  const notesLocked = !canEdit;
  const h = row.header;

  useEffect(() => setForm(formFrom(row)), [row]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    const body = {};
    NOTE_KEYS.forEach((k) => {
      body[k] = form[k];
    });
    if (!locked) {
      Object.assign(body, {
        planned_start: form.planned_start || null,
        scheduled_delay_reason: form.scheduled_delay_reason,
        planned_delay_reason: form.planned_delay_reason,
        requires_review: form.requires_review,
        review_reason: form.requires_review ? form.review_reason : "",
        room: form.room ? Number(form.room) : null,
        case_type: form.case_type,
        anesthesia_type: form.anesthesia_type,
        physical_status: form.physical_status,
        block_id: form.block_id,
      });
    }
    setBusy(true);
    try {
      const saved = await surgeryApi.updateCase(row.id, body);
      (saved.warnings || []).forEach((w) => toast.warning(w));
      toast.success("Case header saved");
      onSaved(saved);
    } catch (err) {
      toast.error(errorText(err, "The case header was not saved."));
    } finally {
      setBusy(false);
    }
  };

  const reasons = lookups?.delay_reasons || [];
  const delayField = (label, minutes, key) => (
    <>
      <TextField size="small" label="Delayed" value={hoursMinutes(minutes) || "0:00"} InputProps={{ readOnly: true }} sx={{ width: 90 }} />
      <TextField
        size="small"
        select
        label={`${label} delay reason`}
        value={form[key]}
        onChange={set(key)}
        disabled={locked}
        sx={{ flex: 1, minWidth: 220 }}
      >
        <MenuItem value="">
          <em>None</em>
        </MenuItem>
        {withCurrent(reasons, form[key]).map((r) => (
          <MenuItem key={r} value={r}>
            {r}
          </MenuItem>
        ))}
      </TextField>
    </>
  );

  return (
    <Stack spacing={1.5}>
      <Section title={`Case Information (Case ID: ${row.case_number})`}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "3fr 2fr" }, gap: 3 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <TextField size="small" label="Scheduled start" value={usDateTime(row.scheduled_start)} InputProps={{ readOnly: true }} sx={{ width: 190 }} />
              {delayField("Scheduled", h.scheduled_delay_minutes, "scheduled_delay_reason")}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <TextField
                size="small"
                type="datetime-local"
                label="Planned start"
                value={form.planned_start}
                onChange={set("planned_start")}
                disabled={locked}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 220 }}
              />
              {delayField("Planned", h.planned_delay_minutes, "planned_delay_reason")}
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <TextField size="small" label="Actual start" value={usDateTime(h.actual_start)} InputProps={{ readOnly: true }} sx={{ width: 190 }} />
              <TextField size="small" label="Actual end" value={usDateTime(h.actual_end)} InputProps={{ readOnly: true }} sx={{ width: 190 }} />
              <TextField size="small" label="Actual duration" value={hoursMinutes(h.actual_minutes)} InputProps={{ readOnly: true }} sx={{ width: 130 }} />
            </Stack>
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.requires_review}
                  disabled={locked}
                  onChange={(e) => setForm((f) => ({ ...f, requires_review: e.target.checked }))}
                />
              }
              label="Requires review"
            />
            <TextField
              size="small"
              label="Review reason"
              multiline
              minRows={3}
              value={form.review_reason}
              onChange={set("review_reason")}
              disabled={locked || !form.requires_review}
            />
          </Stack>

          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ width: 130 }}>
                Status
              </Typography>
              <StatusChip status={row.status} label={row.status_label} />
            </Stack>
            <TextField size="small" select label="Location" value={form.room} onChange={set("room")} disabled={locked}>
              <MenuItem value="">
                <em>Unassigned</em>
              </MenuItem>
              {rooms.map((r) => (
                <MenuItem key={r.id} value={String(r.id)}>
                  {r.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" select label="Case type" value={form.case_type} onChange={set("case_type")} disabled={locked}>
              {CASE_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" select label="Anesthesia type" value={form.anesthesia_type} onChange={set("anesthesia_type")} disabled={locked}>
              <MenuItem value="">
                <em>None selected</em>
              </MenuItem>
              {withCurrent(lookups?.anesthesia_types || [], form.anesthesia_type).map((a) => (
                <MenuItem key={a} value={a}>
                  {a}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" select label="Physical status" value={form.physical_status} onChange={set("physical_status")} disabled={locked}>
              <MenuItem value="">
                <em>None selected</em>
              </MenuItem>
              {withCurrent(lookups?.physical_statuses || [], form.physical_status).map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" label="Block ID" value={form.block_id} onChange={set("block_id")} disabled={locked} />
            <Typography variant="caption" color="text.secondary">
              Last status modification:{" "}
              {h.last_status_change ? `${h.last_status_change.user} ${usDateTime(h.last_status_change.at)}` : "none yet"}
            </Typography>
          </Stack>
        </Box>
      </Section>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
        {[
          ["comments", "Booking comments 1"],
          ["booking_comments_2", "Booking comments 2"],
          ["procedure_notes", "Procedure notes"],
          ["provider_notes", "Provider notes"],
        ].map(([key, label]) => (
          <Section key={key} title={label}>
            <TextField
              fullWidth
              multiline
              minRows={4}
              value={form[key]}
              onChange={set(key)}
              disabled={notesLocked}
              inputProps={{ "aria-label": label }}
            />
          </Section>
        ))}
      </Box>

      <Stack direction="row" spacing={1}>
        {canEdit && (
          <Button variant="contained" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        )}
        {canEdit && !closed && onEditBooking && (
          <Button variant="outlined" onClick={() => onEditBooking(row.id)}>
            Edit Booking
          </Button>
        )}
        {closed && (
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
            This case is {row.status_label}; only the comments and notes can change.
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}
