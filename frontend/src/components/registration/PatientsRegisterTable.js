import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { toast } from "react-toastify";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

// Roles allowed to delete a patient record from this table. Mirrors the
// "patients.delete" right's default grant in users/rights.py (admin,
// system_admin, registrar) -- the backend is the real enforcement point
// (PatientMobileView.get_permissions gates DELETE with that right), this
// is just so the icon isn't dangled in front of someone who'd get a 403.
const CAN_DELETE_ROLES = ["admin", "system_admin", "registrar"];

// Right pane of the Register tab: a simple snapshot of registered patients
// with quick Edit/Delete actions. Capped at 50 rows -- this is an
// at-a-glance list, not the full searchable Patients tab, so there's no
// pagination here.
function PatientsRegisterTable({ userRole, onEdit }) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const canDelete = CAN_DELETE_ROLES.includes(userRole);

  const fetchPatients = async (searchTerm) => {
    setLoading(true);
    setError(null);
    try {
      const token = await getValidToken();
      if (!token) return;
      const res = await axios.get(apiEndpoints.patients, {
        headers: { Authorization: `Bearer ${token}` },
        params: { page_size: 50, ...(searchTerm ? { search: searchTerm } : {}) },
      });
      setPatients(res.data.results || res.data || []);
    } catch (err) {
      console.error("Failed to load patients:", err);
      setError("Could not load patients.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchPatients(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleDelete = async (patient) => {
    const fullName = `${patient.first_name} ${patient.last_name}`.trim();
    if (!window.confirm(`Delete ${fullName || "this patient"}? This cannot be undone.`)) {
      return;
    }
    setDeletingId(patient.id);
    try {
      const token = await getValidToken();
      await axios.delete(apiEndpoints.patient(patient.id), {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(`${fullName || "Patient"} deleted.`);
      setPatients((prev) => prev.filter((p) => p.id !== patient.id));
    } catch (err) {
      console.error("Failed to delete patient:", err);
      const detail =
        err?.response?.data?.detail ||
        (err?.response?.status === 403
          ? "You don't have permission to delete patients."
          : "Failed to delete patient.");
      toast.error(detail);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="h5" fontWeight={700}>
            Registered Patients
          </Typography>
          <Tooltip title="Refresh">
            <span>
              <IconButton
                size="small"
                onClick={() => fetchPatients(search)}
                disabled={loading}
                aria-label="Refresh patient list"
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
        <Chip size="small" label={`Showing up to 50${patients.length ? ` (${patients.length})` : ""}`} />
      </Box>

      <TextField
        size="small"
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fullWidth
        sx={{ mb: 2 }}
      />

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : patients.length === 0 ? (
        <Typography color="text.secondary">No patients found.</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, overflow: "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: "bold" }}>MRN</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Name</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Date of Birth</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Phone</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Provider</TableCell>
                <TableCell sx={{ fontWeight: "bold", textAlign: "center" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>{p.mrn || "--"}</TableCell>
                  <TableCell>
                    {p.first_name} {p.last_name}
                  </TableCell>
                  <TableCell>{p.date_of_birth || "--"}</TableCell>
                  <TableCell>{p.phone_number || "--"}</TableCell>
                  <TableCell>{p.provider_name || "--"}</TableCell>
                  <TableCell sx={{ textAlign: "center" }}>
                    <Box sx={{ display: "flex", gap: 0.5, justifyContent: "center" }}>
                      <Tooltip title="Edit in Registration tab">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => onEdit && onEdit(p)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {canDelete && (
                        <Tooltip title="Delete Patient">
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              disabled={deletingId === p.id}
                              onClick={() => handleDelete(p)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

export default PatientsRegisterTable;
