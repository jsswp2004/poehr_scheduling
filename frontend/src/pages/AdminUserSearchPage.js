import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import {
  TextField,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import Pagination from "@mui/material/Pagination";
import BackButton from "../components/BackButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faTrash,
  faSort,
  faSortUp,
  faSortDown,
} from "@fortawesome/free-solid-svg-icons";

function AdminUserSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Sortable columns: which field the table is currently sorted by, and
  // which direction. Defaults to newest-first by date, matching the old
  // hardcoded behavior, but the user can click any column header to
  // re-sort by it instead.
  const [sortField, setSortField] = useState("appointment_datetime");
  const [sortDirection, setSortDirection] = useState("desc");
  const token = localStorage.getItem("access_token");
  const navigate = useNavigate();
  const rowsPerPage = 10;

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      navigate("/login");
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || "";
      if (role !== "admin" && role !== "system_admin" && role !== "registrar") {
        navigate("/");
      }
    } catch (err) {
      navigate("/login");
    }
  }, [navigate]);

  // Guards against a slow, stale request clobbering a newer one's results.
  // Both the mount-time load and every click on Search call fetchAppointments
  // -- without this, whichever request happens to finish LAST wins, even if
  // it was issued first with an empty/different search term. Now only the
  // response to the most recently issued request is ever applied.
  const latestRequestId = useRef(0);

  // The backend now does the filtering (?search=...) -- see
  // AppointmentViewSet.get_queryset() in appointments/views.py. This used to
  // fetch every appointment in the organization and filter it in the
  // browser with Array.filter(), which meant every search re-downloaded the
  // entire appointments table (hundreds of KB and growing) through a single
  // slow backend worker. Now only matching rows ever come back, so search is
  // both correct (no more stale-response races from slow full-table fetches)
  // and fast regardless of how large the appointments table gets.
  const fetchAppointments = async (searchText = "") => {
    const requestId = ++latestRequestId.current;
    try {
      const res = await axios.get(`${API_BASE_URL}/api/appointments/`, {
        headers: { Authorization: `Bearer ${token}` },
        // No search text: ask the backend for just the most recent 50
        // appointments (?limit=50) instead of the entire org's table --
        // this is what runs on initial page load. A real search still
        // asks for every matching row.
        params: searchText.trim()
          ? { search: searchText.trim() }
          : { limit: 50 },
      });
      if (requestId !== latestRequestId.current) {
        // A newer search/fetch was issued while this one was in flight --
        // this response is stale, ignore it.
        return;
      }
      setResults(res.data);
    } catch (err) {
      if (requestId === latestRequestId.current) {
        console.error("Fetch failed", err);
      }
    }
  };

  useEffect(() => {
    fetchAppointments(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on component mount, search is handled separately

  const handleSearch = async (e) => {
    e.preventDefault();
    fetchAppointments(query);
  };

  // Pulls the value to compare for a given column out of an appointment,
  // matching whatever the corresponding table cell actually displays (see
  // the patient/provider fallback logic in the row rendering below).
  const getSortValue = (appt, field) => {
    switch (field) {
      case "title":
        return (appt.title || "").toLowerCase();
      case "patient":
        return (
          appt.patient_name ||
          (appt.patient &&
            `${appt.patient.first_name || ""} ${appt.patient.last_name || ""}`) ||
          ""
        )
          .toString()
          .toLowerCase();
      case "provider":
        return (
          appt.provider_name ||
          (appt.provider &&
            `${appt.provider.first_name || ""} ${appt.provider.last_name || ""}`) ||
          ""
        )
          .toString()
          .toLowerCase();
      case "appointment_datetime":
        return appt.appointment_datetime
          ? new Date(appt.appointment_datetime).getTime()
          : 0;
      case "description":
        return (appt.description || "").toLowerCase();
      case "duration_minutes":
        return Number(appt.duration_minutes) || 0;
      case "status":
        return (appt.status || "").toLowerCase();
      default:
        return "";
    }
  };

  // Clicking a column header sorts by it; clicking the same header again
  // flips the direction instead of doing nothing.
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return <FontAwesomeIcon icon={faSort} style={{ opacity: 0.35 }} />;
    }
    return (
      <FontAwesomeIcon icon={sortDirection === "asc" ? faSortUp : faSortDown} />
    );
  };

  const sortedResults = [...results].sort((a, b) => {
    const aVal = getSortValue(a, sortField);
    const bVal = getSortValue(b, sortField);
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });
  const paginatedResults = sortedResults.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  return (
    <Box sx={{ width: "100%", mt: 0, px: 3 }}>
      {/* Header with title and back button */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 3,
        }}
      >
        <Typography variant="h5" fontWeight={600}>
          Search Appointments
        </Typography>
        <BackButton to="/admin" />
      </Box>

      {/* Search form */}
      <Box
        component="form"
        onSubmit={handleSearch}
        sx={{ display: "flex", alignItems: "center", mb: 3, gap: 2 }}
      >
        <TextField
          type="text"
          label="Search by patient, provider or clinic event"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          size="small"
        />
        <Button variant="contained" color="primary" type="submit">
          Search
        </Button>
      </Box>

      <TableContainer
        component={Paper}
        sx={{ borderRadius: 2, boxShadow: 2, minWidth: 900 }}
      >
        <Table
          size="small"
          sx={{ "& tbody tr:nth-of-type(odd)": { backgroundColor: "#f7fafc" } }}
        >
          <TableHead sx={{ bgcolor: "#e3f2fd" }}>
            <TableRow>
              <TableCell
                onClick={() => handleSort("title")}
                sx={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
              >
                <b>Clinic Event</b> {renderSortIcon("title")}
              </TableCell>
              <TableCell
                onClick={() => handleSort("patient")}
                sx={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
              >
                <b>Patient</b> {renderSortIcon("patient")}
              </TableCell>
              <TableCell
                onClick={() => handleSort("provider")}
                sx={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
              >
                <b>Provider</b> {renderSortIcon("provider")}
              </TableCell>
              <TableCell
                onClick={() => handleSort("appointment_datetime")}
                sx={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
              >
                <b>Date & Time</b> {renderSortIcon("appointment_datetime")}
              </TableCell>
              <TableCell
                onClick={() => handleSort("description")}
                sx={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
              >
                <b>Description</b> {renderSortIcon("description")}
              </TableCell>
              <TableCell
                onClick={() => handleSort("duration_minutes")}
                sx={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
              >
                <b>Duration (min)</b> {renderSortIcon("duration_minutes")}
              </TableCell>
              <TableCell
                onClick={() => handleSort("status")}
                sx={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
              >
                <b>Status</b> {renderSortIcon("status")}
              </TableCell>
              <TableCell>
                <b>Actions</b>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedResults.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  align="center"
                  sx={{ color: "text.secondary", py: 3 }}
                >
                  No appointments found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedResults.map((appt) => (
                <TableRow key={appt.id} hover>
                  <TableCell>{appt.title || "-"}</TableCell>
                  <TableCell>
                    {appt.patient_name ||
                      (appt.patient &&
                        `${appt.patient.first_name} ${appt.patient.last_name}`) ||
                      "-"}
                  </TableCell>
                  <TableCell>
                    {appt.provider_name ||
                      (appt.provider &&
                      (appt.provider.first_name || appt.provider.last_name)
                        ? `Dr. ${appt.provider.first_name || ""} ${
                            appt.provider.last_name || ""
                          }`.trim()
                        : "-")}
                  </TableCell>
                  <TableCell>
                    {appt.appointment_datetime
                      ? new Date(appt.appointment_datetime).toLocaleString()
                      : "-"}
                  </TableCell>
                  <TableCell>{appt.description || "-"}</TableCell>
                  <TableCell>{appt.duration_minutes || "-"}</TableCell>
                  <TableCell>{appt.status || "-"}</TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Tooltip title="View Appointment Details">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => {
                            setSelectedAppointment(appt);
                            setDetailsOpen(true);
                          }}
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Appointment">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (
                              window.confirm(
                                "Are you sure you want to delete this appointment?"
                              )
                            ) {
                              try {
                                await axios.delete(
                                  `${API_BASE_URL}/api/appointments/${appt.id}/`,
                                  {
                                    headers: {
                                      Authorization: `Bearer ${token}`,
                                    },
                                  }
                                );
                                fetchAppointments(query);
                              } catch (err) {
                                alert("Failed to delete appointment.");
                              }
                            }
                          }}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination - simplified */}
      {results.length > rowsPerPage && (
        <Pagination
          count={Math.ceil(results.length / rowsPerPage)}
          page={page}
          onChange={(_, value) => setPage(value)}
          color="primary"
          shape="rounded"
          sx={{ display: "flex", justifyContent: "center", mt: 2 }}
        />
      )}

      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Appointment Details</DialogTitle>
        <DialogContent
          dividers
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {selectedAppointment && (
            <>
              <Typography>
                <b>Patient:</b>{" "}
                {selectedAppointment.patient_name ||
                  (selectedAppointment.patient
                    ? `${selectedAppointment.patient.first_name} ${selectedAppointment.patient.last_name}`
                    : "-")}
              </Typography>
              <Typography>
                <b>Provider:</b>{" "}
                {selectedAppointment.provider_name ||
                  (selectedAppointment.provider
                    ? `Dr. ${selectedAppointment.provider.first_name || ""} ${
                        selectedAppointment.provider.last_name || ""
                      }`.trim()
                    : "-")}
              </Typography>
              <Typography>
                <b>Date & Time:</b>{" "}
                {selectedAppointment.appointment_datetime
                  ? new Date(
                      selectedAppointment.appointment_datetime
                    ).toLocaleString()
                  : "-"}
              </Typography>
              <Typography>
                <b>Description:</b> {selectedAppointment.description || "-"}
              </Typography>
              <Typography>
                <b>Duration (min):</b>{" "}
                {selectedAppointment.duration_minutes || "-"}
              </Typography>
              <Typography>
                <b>Status:</b> {selectedAppointment.status || "-"}
              </Typography>
              <Typography>
                <b>Clinic Event:</b> {selectedAppointment.title || "-"}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)} color="primary">
            Close
          </Button>
          <Button
            color="secondary"
            variant="contained"
            onClick={() => {
              setDetailsOpen(false);
              navigate(`/appointments/${selectedAppointment.id}/edit`);
            }}
          >
            Edit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default AdminUserSearchPage;
