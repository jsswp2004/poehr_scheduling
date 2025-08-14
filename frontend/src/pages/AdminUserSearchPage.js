import { useState, useEffect } from "react";
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
import { faEye, faTrash } from "@fortawesome/free-solid-svg-icons";

function AdminUserSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  const fetchAppointments = async (searchText = "") => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/appointments/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const lowerQuery = searchText.trim().toLowerCase();
      const filtered = res.data.filter((appt) => {
        const patientName =
          appt.patient_name ||
          (appt.patient
            ? `${appt.patient.first_name} ${appt.patient.last_name}`
            : "");
        const providerName =
          appt.provider_name ||
          (appt.provider
            ? `Dr. ${appt.provider.first_name || ""} ${
                appt.provider.last_name || ""
              }`.trim()
            : "");
        const dateTime = appt.appointment_datetime
          ? new Date(appt.appointment_datetime).toLocaleString()
          : "";
        const description = appt.description || "";
        const duration = appt.duration_minutes
          ? appt.duration_minutes.toString()
          : "";
        const status = appt.status || "";
        const combined =
          `${patientName} ${providerName} ${dateTime} ${description} ${duration} ${status}`.toLowerCase();
        return combined.includes(lowerQuery);
      });
      setResults(filtered);
    } catch (err) {
      console.error("Fetch failed", err);
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

  const sortedResults = [...results].sort(
    (a, b) =>
      new Date(b.appointment_datetime) - new Date(a.appointment_datetime)
  );
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
          label="Search by patient, provider, date or description"
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
              <TableCell>
                <b>Clinic Event</b>
              </TableCell>
              <TableCell>
                <b>Patient</b>
              </TableCell>
              <TableCell>
                <b>Provider</b>
              </TableCell>
              <TableCell>
                <b>Date & Time</b>
              </TableCell>
              <TableCell>
                <b>Description</b>
              </TableCell>
              <TableCell>
                <b>Duration (min)</b>
              </TableCell>
              <TableCell>
                <b>Status</b>
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
