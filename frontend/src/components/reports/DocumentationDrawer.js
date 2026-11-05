import { useEffect, useState } from "react";
import axios from "axios";
import { Alert, Box, Chip, CircularProgress, Divider, Drawer, IconButton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { apiEndpoints } from "../../config/api";
import { errorText, headers } from "./reportUtils";

/**
 * The whole note (or flowsheet time point) behind a Documentation report row: who and when, then every
 * answer under its section, with free text in full and calculated scores beside their meaning.
 * `hide` replaces the patient's name, MRN and typed text, like Hide PHI in the report itself.
 */
export default function DocumentationDrawer({ reference, hide, onClose }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!reference) return undefined;
    let cancelled = false;
    setDoc(null);
    setError("");
    setLoading(true);
    axios
      .get(apiEndpoints.staffingCustomReportDocumentationDocument, {
        headers: headers(),
        params: { ref: reference, hide_phi: hide ? "true" : "false" },
      })
      .then((res) => {
        if (!cancelled) setDoc(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, "Could not open this document."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reference, hide]);

  return (
    <Drawer anchor="right" open={!!reference} onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 480 }, p: 2 } }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {doc ? doc.title : "Document"}
        </Typography>
        {doc && <Chip size="small" label={doc.status} color={doc.status === "Draft" ? "warning" : "default"} />}
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      {loading && <CircularProgress size={24} sx={{ m: 2 }} />}
      {error && <Alert severity="error">{error}</Alert>}
      {doc && (
        <Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 1, mb: 1.5 }}>
            {doc.header.map((h) => (
              <Box key={h.label}>
                <Typography variant="caption" color="text.secondary">
                  {h.label}
                </Typography>
                <Typography variant="body2">{h.value}</Typography>
              </Box>
            ))}
          </Box>
          {doc.sections.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Nothing was recorded in this document.
            </Typography>
          )}
          {doc.sections.map((sec, i) => (
            <Box key={`${sec.label}-${i}`} sx={{ mb: 1.5 }}>
              <Divider sx={{ mb: 1 }} />
              {sec.label && (
                <Typography variant="overline" color="text.secondary">
                  {sec.label}
                </Typography>
              )}
              {sec.items.map((it, j) => (
                <Box key={`${it.label}-${j}`} sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {it.label}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {it.value}
                    {it.meaning && <Chip size="small" label={it.meaning} sx={{ ml: 1 }} />}
                  </Typography>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Drawer>
  );
}
