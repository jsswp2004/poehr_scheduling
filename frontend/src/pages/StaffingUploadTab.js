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

const TEMPLATE_HEADER =
  "first_name,last_name,profession,email,phone_number,shift,days,start,end\n";
const TEMPLATE_EXAMPLE =
  "Jane,Doe,Nurse,jane.doe@example.com,555-0100,day,\"mon,wed,fri\",07:00,15:00\n" +
  "John,Smith,Physician,john.smith@example.com,555-0101,night,\"tue,thu,sat,sun\",19:00,07:00\n" +
  "Pat,Lee,CNA,,,,,,\n";

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
        Required columns: <strong>first_name, last_name, profession</strong>.
        Profession is free text -- Nurse, Physician, CNA, Tech, or whatever
        roles your organization schedules. Optional: <strong>email</strong>,{" "}
        <strong>phone_number</strong>. Re-uploading the same names updates
        their record rather than creating duplicates.
      </Typography>
      <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>
        To also assign a recurring schedule while uploading, fill in all
        four of: <strong>shift</strong> (day, evening, night, or custom),{" "}
        <strong>days</strong> (e.g. "mon,wed,fri" -- mon/tue/wed/thu/fri/sat/sun,
        full day names also work), <strong>start</strong> and{" "}
        <strong>end</strong> (24-hour time, e.g. 19:00). The schedule shows
        up on the calendar immediately after upload. Leave all four blank
        to just add the person to the roster with no schedule. Optional{" "}
        <strong>start_date</strong>/<strong>end_date</strong> columns
        (YYYY-MM-DD) can also be added -- start_date defaults to today,
        and a blank end_date means an ongoing schedule.
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
          {(status.schedules_created > 0 || status.schedules_updated > 0) && (
            <> Schedules created {status.schedules_created || 0}, updated{" "}
            {status.schedules_updated || 0}.</>
          )}
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
