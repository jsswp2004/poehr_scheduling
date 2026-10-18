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
  Checkbox,
  Divider,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
} from "@mui/material";
import axios from "axios";
import { apiEndpoints, getAuthHeaders, getAuthHeadersForUpload } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import { MONTH_NAMES } from "../utils/masterSchedule";

const TEMPLATE_HEADER =
  "first_name,last_name,profession,nursing_role,email,phone_number,shift,days,start,end\n";
const TEMPLATE_EXAMPLE =
  "Jane,Doe,Nurse,rn,jane.doe@example.com,555-0100,day,\"mon,wed,fri\",07:00,15:00\n" +
  "John,Smith,Physician,other,john.smith@example.com,555-0101,night,\"tue,thu,sat,sun\",19:00,07:00\n" +
  "Pat,Lee,CNA,cna,,,,,,\n";

// Download the month's sheet, fill it in, upload it: fills the Master Schedule tab.
function MasterScheduleCsvUpload() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [file, setFile] = useState(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { ok, ...summary } | { ok: false, message }
  const token = getAccessToken();
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2];
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const errMessage = async (err, fallback) => {
    let data = err.response?.data;
    if (data instanceof Blob) {
      try {
        data = JSON.parse(await data.text());
      } catch (e) {
        data = null;
      }
    }
    return data?.error || data?.message || err.message || fallback;
  };

  const handleDownload = async () => {
    setStatus(null);
    try {
      const res = await axios.get(apiEndpoints.staffingMasterScheduleCsv, {
        headers: getAuthHeaders(token),
        params: { month: monthKey },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `master_schedule_${monthKey}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setStatus({ ok: false, message: await errMessage(err, "Could not download the template.") });
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus({ ok: false, message: "Please select a CSV file to upload." });
      return;
    }
    if (replace && !window.confirm("Replace the whole Master Schedule with this file? Every existing row and day entry will be deleted first.")) {
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("replace", replace ? "true" : "false");
    setBusy(true);
    try {
      const res = await axios.post(apiEndpoints.staffingMasterScheduleUploadCsv, formData, {
        headers: getAuthHeadersForUpload(token),
      });
      setStatus({ ok: true, ...res.data });
    } catch (err) {
      setStatus({ ok: false, message: await errMessage(err, "Upload failed.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Master Schedule CSV Upload
      </Typography>
      <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>
        Download the sheet for a month, fill it in, and upload it to fill the Master Schedule tab. The sheet lists
        every section (and anyone already on the schedule) with one column per day of that month's grid. Columns:{" "}
        <strong>section, first_name, last_name, unit, hp, status</strong>, then the days. Put a schedule code in a day:{" "}
        <strong>7, 7A, 7P, 7p, 3, 11, "3 11", R</strong> or <strong>x</strong>.
      </Typography>
      <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>
        People are matched to the roster by first and last name, so upload the roster first; anyone not on the roster
        is reported and skipped. <strong>section</strong> must name a section on the Master Schedule tab (leave it
        blank to stay in the section of the row above; a new name adds a section). <strong>unit</strong> is a care unit
        (Unit 2, Unit 3, Unit 1A/1B...) and decides where that person's calendar shifts go when you click Create
        schedule. Rows with no name are skipped. A blank cell never changes what is already there, so the same file can
        be uploaded again safely; tick the box below to start from scratch instead.
      </Typography>

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ my: 1 }} flexWrap="wrap" useFlexGap>
        <TextField select size="small" label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))} sx={{ minWidth: 140 }}>
          {MONTH_NAMES.map((m, i) => (
            <MenuItem key={m} value={i}>
              {m}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} sx={{ minWidth: 100 }}>
          {years.map((y) => (
            <MenuItem key={y} value={y}>
              {y}
            </MenuItem>
          ))}
        </TextField>
        <Tooltip title={`Download the ${MONTH_NAMES[month]} ${year} sheet`}>
          <IconButton color="primary" onClick={handleDownload} aria-label="Download Master Schedule template">
            <FontAwesomeIcon icon={faDownload} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ my: 1 }}>
        <TextField
          type="file"
          inputProps={{ accept: ".csv" }}
          onChange={(e) => setFile(e.target.files[0])}
          size="small"
          sx={{ minWidth: 220 }}
        />
        <Tooltip title="Upload CSV">
          <span>
            <IconButton color="success" onClick={handleUpload} disabled={busy} aria-label="Upload Master Schedule CSV">
              <FontAwesomeIcon icon={faUpload} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <FormControlLabel
        control={<Checkbox size="small" checked={replace} onChange={(e) => setReplace(e.target.checked)} />}
        label="Replace the existing Master Schedule first (deletes every current row and day entry)"
      />

      {status && status.ok && (
        <Alert severity={status.errors && status.errors.length ? "warning" : "success"} sx={{ mt: 1 }}>
          {status.replaced ? "Replaced the Master Schedule. " : ""}
          Added {status.rows_created} {status.rows_created === 1 ? "row" : "rows"}, updated {status.rows_updated}
          {status.rows_moved > 0 ? ` (${status.rows_moved} moved to another section)` : ""}, set {status.cells_set} day
          {status.cells_set === 1 ? "" : "s"}.
          {status.skipped_blank > 0 && <> {status.skipped_blank} blank {status.skipped_blank === 1 ? "line" : "lines"} skipped.</>}
          {status.sections_added && status.sections_added.length > 0 && (
            <> New section{status.sections_added.length === 1 ? "" : "s"}: {status.sections_added.join(", ")}.</>
          )}
          {status.ignored_columns && status.ignored_columns.length > 0 && (
            <> Ignored column{status.ignored_columns.length === 1 ? "" : "s"}: {status.ignored_columns.join(", ")}.</>
          )}
          {status.errors && status.errors.length > 0 && (
            <List dense>
              {status.errors.slice(0, 50).map((err, idx) => (
                <ListItem key={idx} sx={{ py: 0 }}>
                  <ListItemText primary={err} />
                </ListItem>
              ))}
              {status.errors.length > 50 && (
                <ListItem sx={{ py: 0 }}>
                  <ListItemText primary={`...and ${status.errors.length - 50} more.`} />
                </ListItem>
              )}
            </List>
          )}
        </Alert>
      )}
      {status && !status.ok && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {status.message}
        </Alert>
      )}
    </Box>
  );
}

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
    <>
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
        <strong>nursing_role</strong> (optional) is what the staffing
        compliance checks count: <strong>rn</strong>, <strong>lpn</strong>,{" "}
        <strong>cna</strong> (CNA / GNA / nursing assistant), or{" "}
        <strong>other</strong>. Only RN, LPN and CNA count toward care hours,
        the staff ratio and the RN requirement. Profession is just a label
        and is never used for this. Leave nursing_role blank to keep a
        person's current role; new people with a blank role start as Other
        and can be changed on the Roster tab.
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

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ my: 1 }}>
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
        <Alert severity={(status.errors && status.errors.length) || status.not_counted > 0 ? "warning" : "success"} sx={{ mt: 1 }}>
          Created {status.created}, updated {status.updated}.
          {status.not_counted > 0 && (
            <> {status.not_counted} of these {status.not_counted === 1 ? "person has" : "people have"} the
            role Other, which does not count toward staffing compliance until
            a Nursing Role (RN, LPN or CNA) is set.</>
          )}
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
        <Alert severity="error" sx={{ mt: 1 }}>
          {status.message}
        </Alert>
      )}
    </Box>
    <Divider sx={{ my: 3, maxWidth: 720 }} />
    <MasterScheduleCsvUpload />
    </>
  );
}

export default StaffingUploadTab;
