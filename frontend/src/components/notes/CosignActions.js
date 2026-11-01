import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { getValidToken } from "../../utils/auth";
import { toast } from "../SimpleToast";
import SignDialog from "./SignDialog";
import { cosignChip, cosignLine } from "./cosignHelpers";

async function headers() {
  const token = await getValidToken();
  return token ? { Authorization: `Bearer ${token.access_token || token}` } : {};
}

// Co-signature status of a signed note plus what the signed-in person can do about it: the author
// requests or cancels, the co-signer co-signs or returns with comments.
export default function CosignActions({ note, userId, userRole, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [comment, setComment] = useState("");
  if (!note || note.status !== "signed") return null;

  const cosign = note.cosign || { status: "none" };
  const chip = cosignChip(cosign);
  const isAuthor = userId != null && note.author === userId;
  const isAdmin = userRole === "admin" || userRole === "system_admin";
  const isCosigner = userId != null && cosign.cosigner === userId;
  const canAsk = (isAuthor || isAdmin) && (cosign.status === "none" || cosign.status === "returned");

  const call = async (url, body, done) => {
    setBusy(true);
    try {
      await api.post(url, body || {}, { headers: await headers() });
      toast.success(done);
      onChanged && (await onChanged());
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "That did not go through.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async (payload) => {
    if (await call(apiEndpoints.clinicalNoteRequestCosign(note.id), payload, "Co-signature requested.")) {
      setAskOpen(false);
    }
  };
  const sendReturn = async () => {
    if (await call(apiEndpoints.clinicalNoteReturnCosign(note.id), { comment }, "Note returned with comments.")) {
      setReturnOpen(false);
      setComment("");
    }
  };

  if (!chip && !canAsk) return null;
  return (
    <Box sx={{ mt: 1.5 }} data-testid="cosign-actions">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        {chip && <Chip size="small" label={chip.label} color={chip.color} />}
        {chip && (
          <Typography variant="body2" color="text.secondary">
            {cosignLine(cosign)}
          </Typography>
        )}
      </Stack>
      {cosign.status === "awaiting" && cosign.message && (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          “{cosign.message}” — {cosign.requested_by_name}
        </Typography>
      )}
      {cosign.status === "returned" && cosign.comment && (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          Comment: {cosign.comment}. Add an addendum, then request again.
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        {cosign.status === "awaiting" && isCosigner && (
          <>
            <Button size="small" variant="contained" color="success" disabled={busy} onClick={() => call(apiEndpoints.clinicalNoteCosign(note.id), null, "Note co-signed.")}>
              Co-sign
            </Button>
            <Button size="small" variant="outlined" disabled={busy} onClick={() => setReturnOpen(true)}>
              Return with comments
            </Button>
          </>
        )}
        {cosign.status === "awaiting" && (isAuthor || isAdmin) && (
          <Button size="small" disabled={busy} onClick={() => call(apiEndpoints.clinicalNoteCancelCosign(note.id), null, "Request cancelled.")}>
            Cancel request
          </Button>
        )}
        {canAsk && (
          <Button size="small" variant="outlined" disabled={busy} onClick={() => setAskOpen(true)}>
            Request co-signature
          </Button>
        )}
      </Stack>

      <SignDialog open={askOpen} requestOnly onClose={() => setAskOpen(false)} onConfirm={sendRequest} saving={busy} />
      <Dialog open={returnOpen} onClose={() => (busy ? null : setReturnOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle>Return with comments</DialogTitle>
        <DialogContent>
          <TextField
            label="What needs to change"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            required
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={sendReturn} disabled={busy || !comment.trim()}>
            Return note
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
