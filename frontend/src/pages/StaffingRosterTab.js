import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";

function StaffingRosterTab() {
  const token = localStorage.getItem("access_token");
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(apiEndpoints.staffingStaff, {
        headers: getAuthHeaders(token),
      });
      setStaff(res.data.results || res.data || []);
    } catch (err) {
      console.error("Failed to load staff roster", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleDeactivate = async (id) => {
    try {
      await axios.delete(apiEndpoints.staffingStaffDetail(id), {
        headers: getAuthHeaders(token),
      });
      fetchStaff();
    } catch (err) {
      console.error("Failed to remove staff member", err);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Staff Roster ({staff.length})
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Profession</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Phone</TableCell>
            <TableCell>Status</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {staff.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{s.full_name}</TableCell>
              <TableCell>{s.profession_display || s.profession}</TableCell>
              <TableCell>{s.email || "—"}</TableCell>
              <TableCell>{s.phone_number || "—"}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={s.is_active ? "Active" : "Inactive"}
                  color={s.is_active ? "success" : "default"}
                />
              </TableCell>
              <TableCell>
                <Tooltip title="Remove from roster">
                  <IconButton size="small" color="error" onClick={() => handleDeactivate(s.id)}>
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default StaffingRosterTab;
