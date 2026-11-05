import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, FormControlLabel, Paper, Stack, Switch, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import axios from "axios";
import { apiEndpoints } from "../../config/api";
import { BuilderSplit, BuilderToolbar, BuilderListHeader } from "../builders/BuilderShell";
import RichTextEditor from "./RichTextEditor";
import AnnouncementCard from "./AnnouncementCard";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".doc", ".docx", ".txt"];

export const STATUS_LABEL = { live: "Showing now", scheduled: "Scheduled", ended: "Ended", off: "Off" };
const STATUS_COLOR = { live: "success", scheduled: "warning", ended: "default", off: "default" };
const AUDIENCE_LABEL = { patients: "Patients", staff: "Staff", everyone: "Everyone" };

const blank = () => ({
  id: null, title: "", body: "", audience: "patients", start_date: "", end_date: "", is_active: true,
  attachments: [], pendingFiles: [], removeIds: [],
});

const fromServer = (a) => ({
  id: a.id, title: a.title, body: a.body, audience: a.audience, start_date: a.start_date || "",
  end_date: a.end_date || "", is_active: a.is_active, attachments: a.attachments || [], pendingFiles: [], removeIds: [],
});

export function describeSchedule(a) {
  if (a.status === "scheduled" && a.start_date) return `Starts ${a.start_date}`;
  if (a.status === "ended" && a.end_date) return `Ended ${a.end_date}`;
  return STATUS_LABEL[a.status] || "";
}

const errorText = (err, fallback) => {
  const d = err?.response?.data;
  if (typeof d === "string") return fallback;
  if (d?.detail) return d.detail;
  if (d && typeof d === "object") {
    const first = Object.values(d)[0];
    return Array.isArray(first) ? first[0] : String(first);
  }
  return fallback;
};

export default function AnnouncementsManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null); // "new" for an unsaved one
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { severity, text }
  const [resetKey, setResetKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(apiEndpoints.communicatorAnnouncements);
      setItems(res.data);
      return res.data;
    } catch (err) {
      setMessage({ severity: "error", text: errorText(err, "Could not load announcements.") });
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().then((rows) => {
      if (rows.length) open(rows[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(a) {
    setSelectedId(a.id);
    setDraft(fromServer(a));
    setDirty(false);
    setMessage(null);
    setResetKey((k) => k + 1);
  }

  const guard = (fn) => () => {
    if (dirty) {
      setMessage({ severity: "warning", text: "You have unsaved changes. Save or discard them first." });
      return;
    }
    fn();
  };

  const startNew = guard(() => {
    setSelectedId("new");
    setDraft(blank());
    setDirty(false);
    setMessage(null);
    setResetKey((k) => k + 1);
  });

  const edit = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const addFiles = (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    const kept = draft.attachments.filter((a) => !draft.removeIds.includes(a.id)).length;
    let room = MAX_FILES - kept - draft.pendingFiles.length;
    const accepted = [];
    const problems = [];
    picked.forEach((f) => {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) problems.push(`${f.name}: that file type is not allowed.`);
      else if (f.size > MAX_BYTES) problems.push(`${f.name}: larger than 10 MB.`);
      else if (room <= 0) problems.push(`${f.name}: up to ${MAX_FILES} files per announcement.`);
      else {
        accepted.push(f);
        room -= 1;
      }
    });
    if (problems.length) setMessage({ severity: "warning", text: problems.join(" ") });
    if (accepted.length) edit({ pendingFiles: [...draft.pendingFiles, ...accepted] });
  };

  const save = async () => {
    if (!draft.title.trim()) {
      setMessage({ severity: "warning", text: "Give the announcement a title." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        title: draft.title, body: draft.body, audience: draft.audience, is_active: draft.is_active,
        start_date: draft.start_date || null, end_date: draft.end_date || null,
      };
      const res = draft.id
        ? await axios.patch(`${apiEndpoints.communicatorAnnouncements}${draft.id}/`, payload)
        : await axios.post(apiEndpoints.communicatorAnnouncements, payload);
      const id = res.data.id;
      const failures = [];
      for (const attId of draft.removeIds) {
        try {
          await axios.delete(`${apiEndpoints.communicatorAnnouncements}${id}/attachments/${attId}/`);
        } catch (err) {
          failures.push(errorText(err, "A file could not be removed."));
        }
      }
      for (const file of draft.pendingFiles) {
        const form = new FormData();
        form.append("file", file);
        try {
          await axios.post(`${apiEndpoints.communicatorAnnouncements}${id}/attachments/`, form);
        } catch (err) {
          failures.push(`${file.name}: ${errorText(err, "could not be attached.")}`);
        }
      }
      const rows = await load();
      const saved = rows.find((r) => r.id === id);
      if (saved) open(saved);
      setMessage(
        failures.length
          ? { severity: "warning", text: `Saved, but: ${failures.join(" ")}` }
          : { severity: "success", text: "Saved." }
      );
    } catch (err) {
      setMessage({ severity: "error", text: errorText(err, "Could not save the announcement.") });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (selectedId === "new") {
      setSelectedId(null);
      setDraft(null);
      setDirty(false);
      if (items.length) open(items[0]);
      return;
    }
    const original = items.find((a) => a.id === selectedId);
    if (original) open(original);
  };

  const remove = async () => {
    if (!draft?.id) return;
    try {
      await axios.delete(`${apiEndpoints.communicatorAnnouncements}${draft.id}/`);
      const rows = await load();
      setDirty(false);
      if (rows.length) open(rows[0]);
      else {
        setSelectedId(null);
        setDraft(null);
      }
      setMessage({ severity: "success", text: "Announcement deleted." });
    } catch (err) {
      setMessage({ severity: "error", text: errorText(err, "Could not delete the announcement.") });
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setConfirmDelete(false), [selectedId]);

  const previewData = useMemo(
    () =>
      draft && {
        title: draft.title,
        body: draft.body,
        attachments: [
          ...draft.attachments.filter((a) => !draft.removeIds.includes(a.id)),
          ...draft.pendingFiles.map((f, i) => ({ id: `new-${i}`, name: f.name, url: "", pending: true })),
        ],
      },
    [draft]
  );

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  const list = (
    <>
      <BuilderListHeader>
        <Button variant="contained" startIcon={<AddIcon />} onClick={startNew}>
          New announcement
        </Button>
      </BuilderListHeader>
      <Stack spacing={1} sx={{ p: 1 }}>
        {selectedId === "new" && (
          <Paper variant="outlined" sx={{ p: 1.25, borderColor: "primary.main" }}>
            <Typography variant="subtitle2">{draft?.title || "New announcement"}</Typography>
            <Chip size="small" label="Not saved yet" sx={{ mt: 0.5 }} />
          </Paper>
        )}
        {items.length === 0 && selectedId !== "new" && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            No announcements yet. Choose New announcement to write the first one.
          </Typography>
        )}
        {items.map((a) => (
          <Paper
            key={a.id}
            variant="outlined"
            onClick={guard(() => open(a))}
            sx={{ p: 1.25, cursor: "pointer", borderColor: a.id === selectedId ? "primary.main" : "divider", "&:hover": { borderColor: "primary.light" } }}
          >
            <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>{a.title}</Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, flexWrap: "wrap" }} useFlexGap>
              <Chip size="small" color={STATUS_COLOR[a.status]} variant={a.status === "live" ? "filled" : "outlined"} label={describeSchedule(a)} />
              <Typography variant="caption" color="text.secondary">{AUDIENCE_LABEL[a.audience]}</Typography>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </>
  );

  return (
    <>
      {draft && (
        <BuilderToolbar>
          {message && <Typography variant="body2" color={message.severity === "success" ? "success.main" : "text.secondary"}>{message.severity === "success" ? message.text : ""}</Typography>}
          <Box sx={{ flex: 1 }} />
          {draft.id && !confirmDelete && (
            <Button color="error" onClick={() => setConfirmDelete(true)}>Delete</Button>
          )}
          {draft.id && confirmDelete && (
            <>
              <Typography variant="body2">Delete this announcement?</Typography>
              <Button color="error" variant="contained" onClick={remove}>Yes, delete</Button>
              <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
            </>
          )}
          <Button onClick={discard} disabled={!dirty && selectedId !== "new"}>Discard</Button>
          <Button variant="contained" onClick={save} disabled={saving || (!dirty && selectedId !== "new")}>
            {saving ? <CircularProgress size={22} /> : "Save"}
          </Button>
        </BuilderToolbar>
      )}

      <BuilderSplit list={list}>
        {message && message.severity !== "success" && (
          <Alert severity={message.severity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>
        )}
        {!draft ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
            Choose an announcement from the list, or create a new one.
          </Paper>
        ) : (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Content</Typography>
              <TextField label="Title" fullWidth value={draft.title} onChange={(e) => edit({ title: e.target.value })} inputProps={{ maxLength: 200 }} sx={{ mb: 2 }} />
              <RichTextEditor value={draft.body} resetKey={resetKey} onChange={(html) => edit({ body: html })} />
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5, flexWrap: "wrap" }} useFlexGap>
                <Button variant="outlined" size="small" startIcon={<AttachFileIcon />} component="label">
                  Add file
                  <input type="file" multiple hidden accept="image/*,.pdf,.doc,.docx,.txt" onChange={addFiles} />
                </Button>
                <Typography variant="caption" color="text.secondary">Images, PDF, Word or text. Up to {MAX_FILES} files, 10 MB each.</Typography>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }} useFlexGap>
                {draft.attachments.filter((a) => !draft.removeIds.includes(a.id)).map((a) => (
                  <Chip key={a.id} size="small" label={a.name} onDelete={() => edit({ removeIds: [...draft.removeIds, a.id] })} />
                ))}
                {draft.pendingFiles.map((f, i) => (
                  <Chip key={`${f.name}-${i}`} size="small" variant="outlined" label={`${f.name} (will upload on save)`}
                    onDelete={() => edit({ pendingFiles: draft.pendingFiles.filter((_, j) => j !== i) })} />
                ))}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Who sees it, and when</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
                <ToggleButtonGroup exclusive size="small" color="primary" value={draft.audience} aria-label="Audience"
                  onChange={(_, v) => v && edit({ audience: v })}>
                  <ToggleButton value="patients">Patients</ToggleButton>
                  <ToggleButton value="staff">Staff</ToggleButton>
                  <ToggleButton value="everyone">Everyone</ToggleButton>
                </ToggleButtonGroup>
                <TextField size="small" type="date" label="Show from" InputLabelProps={{ shrink: true }} value={draft.start_date} onChange={(e) => edit({ start_date: e.target.value })} helperText="Blank: right away" />
                <TextField size="small" type="date" label="Hide after" InputLabelProps={{ shrink: true }} value={draft.end_date} onChange={(e) => edit({ end_date: e.target.value })} helperText="Blank: never" />
                <FormControlLabel control={<Switch checked={draft.is_active} onChange={(e) => edit({ is_active: e.target.checked })} />} label={draft.is_active ? "On" : "Off"} />
              </Stack>
            </Paper>

            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Preview: how it looks on the dashboard
              </Typography>
              <Box sx={{ maxWidth: 360 }}>
                <AnnouncementCard announcement={previewData} />
              </Box>
            </Box>
          </Stack>
        )}
      </BuilderSplit>
    </>
  );
}
