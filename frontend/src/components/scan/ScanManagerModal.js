import { Box, Dialog, DialogTitle, IconButton, Tab, Tabs, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import DocumentScannerIcon from "@mui/icons-material/DocumentScanner";
import ScanFileTab from "./ScanFileTab";

/**
 * The "Upload scan" dialog of the Results tab: two tabs, "Attach file" (choose a file from the
 * computer) and "Scan file" (scan with the scanner on this computer). The Attach tab's own
 * content and buttons come in as `attach` (a DialogContent + DialogActions pair); the Scan tab is
 * ScanFileTab.
 */
export default function ScanManagerModal({
  open,
  onClose,
  busy = false,
  tab,
  onTabChange,
  attach,
  patientId,
  patientLabel = "",
  defaultVisitId = null,
  onFiled,
}) {
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="md" aria-labelledby="scan-manager-title">
      <DialogTitle sx={{ pr: 7 }} id="scan-manager-title">
        Upload scan
        {patientLabel && (
          <Typography variant="body2" color="text.secondary" component="div">
            {patientLabel}
          </Typography>
        )}
        <IconButton aria-label="Close" onClick={() => !busy && onClose()} sx={{ position: "absolute", right: 12, top: 12 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Box sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}>
        <Tabs value={tab} onChange={(_e, v) => onTabChange(v)} aria-label="How to add the document">
          <Tab value="attach" icon={<AttachFileIcon fontSize="small" />} iconPosition="start" label="Attach file" disabled={busy} />
          <Tab value="scan" icon={<DocumentScannerIcon fontSize="small" />} iconPosition="start" label="Scan file" disabled={busy} />
        </Tabs>
      </Box>
      {tab === "attach" && attach}
      {tab === "scan" && (
        <ScanFileTab patientId={patientId} defaultVisitId={defaultVisitId} onFiled={onFiled} onClose={onClose} />
      )}
    </Dialog>
  );
}
