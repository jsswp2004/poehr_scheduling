import { useEffect, useState } from "react";
import { Box, Dialog, DialogContent, IconButton, Skeleton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { secure } from "./secureApi";

/** Fetch a protected picture (it needs the sign-in header, so it cannot be a plain <img src>). */
function usePicture(id, thumb, enabled = true) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    let made = "";
    setFailed(false);
    secure
      .picture(id, thumb)
      .then((blob) => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, thumb, enabled]);
  return { url, failed };
}

export default function MessageImage({ attachment }) {
  const [open, setOpen] = useState(false);
  const thumb = usePicture(attachment.id, true);
  const full = usePicture(attachment.id, false, open);
  const label = attachment.name ? `Picture ${attachment.name}` : "Picture";
  return (
    <>
      <Box sx={{ mt: 0.5 }}>
        {thumb.failed ? (
          <Box sx={{ p: 1, fontSize: 12, color: "text.secondary" }}>Picture unavailable</Box>
        ) : thumb.url ? (
          <Box
            component="img"
            src={thumb.url}
            alt={label}
            onClick={() => setOpen(true)}
            data-testid="message-image"
            sx={{ maxWidth: 240, maxHeight: 200, borderRadius: 1, cursor: "zoom-in", display: "block" }}
          />
        ) : (
          <Skeleton variant="rounded" width={160} height={110} />
        )}
      </Box>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="lg" data-testid="image-dialog">
        <DialogContent sx={{ p: 1, position: "relative", bgcolor: "#111" }}>
          <IconButton aria-label="Close picture" onClick={() => setOpen(false)} sx={{ position: "absolute", top: 4, right: 4, color: "white", bgcolor: "rgba(0,0,0,0.4)" }}>
            <CloseIcon />
          </IconButton>
          {full.url ? (
            <Box component="img" src={full.url} alt={label} sx={{ maxWidth: "100%", maxHeight: "85vh", display: "block", mx: "auto" }} />
          ) : full.failed ? (
            <Box sx={{ p: 3, color: "white" }}>Picture unavailable</Box>
          ) : (
            <Skeleton variant="rectangular" width={400} height={300} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
