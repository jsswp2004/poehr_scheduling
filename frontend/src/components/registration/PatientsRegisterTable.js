import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import { toast } from "react-toastify";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";
import { patientSearchParams, showDob, visitStatus } from "./registerHelpers";

// Roles allowed to delete a patient record from this table. Mirrors the "patients.delete" right's
// default grant in users/rights.py; the backend is the real enforcement point.
const CAN_DELETE_ROLES = ["admin", "system_admin", "registrar"];

const PAGE_SIZE = 25;
const FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open visit" },
  { value: "none", label: "No visit" },
];

// Right pane of the Register page: find a patient, see whether they have an open visit, and open or
// start one. Search covers name, MRN, email, phone and date of birth (MM/DD/YYYY).
// `refreshKey` changes whenever a patient is registered, so the list reloads.
function PatientsRegisterTable({ userRole, onEdit, refreshKey = 0 }) {
  const [patients, setPatients] = useState([]);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const latest = useRef(0);

  const canDelete = CAN_DELETE_ROLES.includes(userRole);

  const fetchPage = useCallback(async (text, page) => {
    const token = await getValidToken();
    if (!token) return null;
    const res = await axios.get(apiEndpoints.patients, {
      headers: { Authorization: `Bearer ${token}` },
      params: { page_size: PAGE_SIZE, page, ...patientSearchParams(text) },
    });
    const data = res.data || {};
    const rows = Array.isArray(data) ? data : data.results || [];
    return { rows, count: Array.isArray(data) ? rows.length : data.count ?? rows.length, hasNext: !Array.isArray(data) && !!data.next };
  }, []);

  const load = useCallback(
    async (text) => {
      const id = ++latest.current;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchPage(text, 1);
        if (!result || id !== latest.current) return;
        setPatients(result.rows);
        setTotal(result.count);
        setNextPage(result.hasNext ? 2 : null);
      } catch (err) {
        if (id !== latest.current) return;
        console.error("Failed to load patients:", err);
        setError("Could not load patients.");
      } finally {
        if (id === latest.current) setLoading(false);
      }
    },
    [fetchPage]
  );

  // First load, a new search, or a newly registered patient.
  useEffect(() => {
    const t = setTimeout(() => load(search), search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, refreshKey]);

  const loadMore = async () => {
    if (!nextPage) return;
    const id = latest.current;
    setLoadingMore(true);
    try {
      const result = await fetchPage(search, nextPage);
      if (!result || id !== latest.current) return;
      setPatients((prev) => [...prev, ...result.rows.filter((r) => !prev.some((p) => p.id === r.id))]);
      setNextPage(result.hasNext ? nextPage + 1 : null);
    } catch (err) {
      console.error("Failed to load more patients:", err);
      toast.error("Could not load more patients.");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDelete = async (patient) => {
    const fullName = `${patient.first_name} ${patient.last_name}`.trim();
    if (!window.confirm(`Delete ${fullName || "this patient"}? This cannot be undone.`)) return;
    setDeletingId(patient.id);
    try {
      const token = await getValidToken();
      await axios.delete(apiEndpoints.patient(patient.id), { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`${fullName || "Patient"} deleted.`);
      setPatients((prev) => prev.filter((p) => p.id !== patient.id));
      setTotal((n) => Math.max(0, n - 1));
    } catch (err) {
      console.error("Failed to delete patient:", err);
      const detail =
        err?.response?.data?.detail ||
        (err?.response?.status === 403 ? "You don't have permission to delete patients." : "Failed to delete patient.");
      toast.error(detail);
    } finally {
      setDeletingId(null);
    }
  };

  const shown = patients.filter((p) => {
    if (filter === "all") return true;
    const open = visitStatus(p).open;
    return filter === "open" ? open : !open;
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1.5 }}>
        <Typography variant="h6" fontWeight={700}>
          Patients
        </Typography>
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" onClick={() => load(search)} disabled={loading} aria-label="Refresh patient list">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
          A to Z by last name
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
        <TextField
          size="small"
          placeholder="Search by name, MRN, DOB or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: "1 1 220px" }}
          inputProps={{ "aria-label": "Search patients" }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Box sx={{ display: "flex", gap: 0.75 }}>
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              size="small"
              label={f.label}
              clickable
              color={filter === f.value ? "primary" : "default"}
              variant={filter === f.value ? "filled" : "outlined"}
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
            />
          ))}
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : shown.length === 0 ? (
        <Typography color="text.secondary">
          {patients.length === 0 ? "No patients found." : "No loaded patients match this filter. Load more or choose All."}
        </Typography>
      ) : (
        <TableContainer sx={{ flex: 1, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
          <Table size="small" stickyHeader sx={{ tableLayout: "fixed", minWidth: 560 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 96, fontWeight: 700 }}>MRN</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ width: 100, fontWeight: 700 }}>DOB</TableCell>
                <TableCell sx={{ width: 120, fontWeight: 700 }}>Provider</TableCell>
                <TableCell sx={{ width: 112, fontWeight: 700 }}>Visit</TableCell>
                <TableCell sx={{ width: canDelete ? 132 : 100 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((p) => {
                const visit = visitStatus(p);
                return (
                  <TableRow key={p.id} hover>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }} noWrap>
                      {p.mrn || "--"}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      <Box component="span" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${p.last_name}, ${p.first_name}`}>
                        {p.last_name}, {p.first_name}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{showDob(p.date_of_birth)}</TableCell>
                    <TableCell noWrap sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.provider_name || "--"}
                    </TableCell>
                    <TableCell>
                      <Tooltip title={visit.detail || ""}>
                        <Chip
                          size="small"
                          label={visit.open ? `${visit.label} visit` : visit.label}
                          color={visit.open ? "success" : "default"}
                          variant={visit.open ? "filled" : "outlined"}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end", alignItems: "center" }}>
                        <Button size="small" variant="outlined" sx={{ textTransform: "none" }} onClick={() => onEdit && onEdit(p)}>
                          {visit.open ? "Open" : "Start visit"}
                        </Button>
                        {canDelete && (
                          <Tooltip title="Delete patient">
                            <span>
                              <IconButton size="small" color="error" disabled={deletingId === p.id} onClick={() => handleDelete(p)} aria-label={`Delete ${p.first_name} ${p.last_name}`}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {!loading && !error && patients.length > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, pt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {filter === "all" ? `Showing ${patients.length} of ${total.toLocaleString()}` : `${shown.length} of ${patients.length} loaded match`}
          </Typography>
          {nextPage && (
            <Button size="small" onClick={loadMore} disabled={loadingMore} sx={{ textTransform: "none" }}>
              {loadingMore ? "Loading..." : "Load more"}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

export default PatientsRegisterTable;
