import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faUpload } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Typography,
  Stack,
  TextField,
  IconButton,
  Tooltip,
  Alert,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import axios from "axios";
import { apiEndpoints, getAuthHeadersForUpload } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

const TEMPLATE_HEADER = "first_name,last_name,profession,email,phone_number\n";
const TEMPLATE_EXAMPLE =
  "Jane,Doe,nurse,jane.doe@example.com,555-0100\nJohn,Smith,physician,john.smith@example.com,555-0101\n";

function StaffingUploadTab() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // { ok, created, updated, errors }
  const token = getAccessToken();

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_HEADER + TEMPLATE_EXAMPLE], {
      type: "text/csv",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "staffing_roster_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus({ ok: false, message: "Please select a CSV file to upload." });
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await axios.post(apiEndpoints.staffingStaffUploadCsv, formData, {
        headers: getAuthHeadersForUpload(token),
      });
      setStatus({ ok: true, ...res.data });
    } catch (err) {
      setStatus({
        ok: false,
        message:
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          "Upload failed.",
      });
    }
  };

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Staff Roster CSV Upload
      </Typography>
      <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>
        Upload a CSV with columns: <strong>first_name, last_name, profession
        (nurse or physician), email</strong> (optional), <strong>phone_number</strong>{" "}
        (optional). Re-uploading the same names updates their record rather
        than creating duplicates.
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ my: 2 }}>
        <Tooltip title="Download Template">
          <IconButton color="primary" onClick={handleDownloadTemplate}>
            <FontAwesomeIcon icon={faDownload} />
          </IconButton>
        </Tooltip>
        <TextField
          type="file"
          inputProps={{ accept: ".csv" }}
          onChange={(e) => setFile(e.target.files[0])}
          size="small"
          sx={{ minWidth: 220 }}
        />
        <Tooltip title="Upload CSV">
          <IconButton color="success" onClick={handleUpload}>
            <FontAwesomeIcon icon={faUpload} />
          </IconButton>
        </Tooltip>
      </Stack>

      {status && status.ok && (
        <Alert severity={status.errors && status.errors.length ? "warning" : "success"} sx={{ mt: 2 }}>
          Created {status.created}, updated {status.updated}.
          {status.errors && status.errors.length > 0 && (
            <List dense>
              {status.errors.map((err, idx) => (
                <ListItem key={idx} sx={{ py: 0 }}>
                  <ListItemText primary={err} />
                </ListItem>
              ))}
            </List>
          )}
        </Alert>
      )}
      {status && !status.ok && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {status.message}
        </Alert>
      )}
    </Box>
  );
}

export default StaffingUploadTab;
