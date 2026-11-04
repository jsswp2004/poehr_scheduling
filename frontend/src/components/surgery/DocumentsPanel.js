import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";
import { DOC_EXTENSIONS, documentProblem, fileSize, usDateTime } from "./surgeryUtils";

/** The Documents tab: scans and files on the case (consent, H&P, operative note...). */
export default function DocumentsPanel({ caseId, lookups, canEdit }) {
  const [docs, setDocs] = useState([]);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const load = useCallback(
    () => surgeryApi.documents(caseId).then(setDocs).catch((e) => toast.error(errorText(e, "Could not load the documents."))),
    [caseId]
  );
  useEffect(() => {
    load();
  }, [load]);

  const choose = (e) => {
    const picked = e.target.files?.[0] || null;
    setFile(picked);
    setProblem(picked ? documentProblem(picked) : "");
  };

  const upload = async () => {
    const why = documentProblem(file);
    if (why) {
      setProblem(why);
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    if (title.trim()) form.append("title", title.trim());
    setBusy(true);
    try {
      const added = await surgeryApi.uploadDocument(caseId, form);
      setDocs((d) => [added, ...d]);
      setFile(null);
      setTitle("");
      setProblem("");
      if (input.current) input.current.value = "";
      toast.success("Document uploaded");
    } catch (err) {
      setProblem(errorText(err, "The document was not uploaded."));
    } finally {
      setBusy(false);
    }
  };

  const download = async (doc) => {
    try {
      const blob = await surgeryApi.downloadDocument(caseId, doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorText(err, "The document could not be downloaded."));
    }
  };

  const remove = async (doc) => {
    try {
      await surgeryApi.removeDocument(caseId, doc.id);
      setDocs((d) => d.filter((x) => x.id !== doc.id));
    } catch (err) {
      toast.error(errorText(err, "The document was not removed."));
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Documents
      </Typography>
      {canEdit && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          <TextField select size="small" label="Document type" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 190 }}>
            {(lookups?.document_categories || [{ value: "other", label: "Other" }]).map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} inputProps={{ maxLength: 160 }} sx={{ minWidth: 220 }} />
          <Button component="label" size="small" variant="outlined">
            {file ? file.name : "Choose file"}
            <input ref={input} hidden type="file" accept={DOC_EXTENSIONS.join(",")} onChange={choose} aria-label="Choose file" />
          </Button>
          <Button size="small" variant="contained" onClick={upload} disabled={busy || !file}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </Stack>
      )}
      {problem && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {problem}
        </Alert>
      )}
      <Table size="small" aria-label="Case documents">
        <TableHead>
          <TableRow>
            {["Title", "Type", "File", "Size", "Uploaded"].map((h) => (
              <TableCell key={h}>{h}</TableCell>
            ))}
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {docs.map((d) => (
            <TableRow key={d.id}>
              <TableCell>{d.title}</TableCell>
              <TableCell>{d.category_label}</TableCell>
              <TableCell>{d.filename}</TableCell>
              <TableCell>{fileSize(d.size)}</TableCell>
              <TableCell>
                {usDateTime(d.uploaded_at)} · {d.uploaded_by}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                <IconButton size="small" aria-label={`Download ${d.title}`} onClick={() => download(d)}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
                {d.can_delete && (
                  <IconButton size="small" aria-label={`Remove ${d.title}`} onClick={() => remove(d)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          ))}
          {docs.length === 0 && (
            <TableRow>
              <TableCell colSpan={6}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  No documents on this case.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Paper>
  );
}
