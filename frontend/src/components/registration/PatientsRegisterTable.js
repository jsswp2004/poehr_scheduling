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
} from "@mui/material";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

// Right pane of the Register tab: a simple, read-only snapshot of
// registered patients. Capped at 50 rows -- this is an at-a-glance list,
// not the full searchable Patients tab, so there's no pagination here.
function PatientsRegisterTable() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);

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

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Registered Patients
        </Typography>
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
