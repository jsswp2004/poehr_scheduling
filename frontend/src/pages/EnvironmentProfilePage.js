import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Chip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Checkbox,
  CircularProgress,
} from "@mui/material";
import axios from "axios";
import { API_BASE_URL } from '../config/api';
import HolidaysTab from "./HolidaysPage";
import ClinicEventsManagement from "../components/ClinicEventsManagement";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { getValidToken } from "../utils/auth";
import { applyToFacilities, useFacilityScope } from "../utils/facilityScope";
import SingleFacilityOnly from "../components/facility/SingleFacilityOnly";
import SettingsToolbarPortal from "../components/settings/SettingsToolbarSlot";

const DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];

function EnvironmentProfilePage() {
  const [blockedDays, setBlockedDays] = useState([0, 6]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [tabKey, setTabKey] = useState("blocked-days");
  const [userRole, setUserRole] = useState("");
  const facility = useFacilityScope(); // system administrators: which facility the picker above has chosen
  const navigate = useNavigate();

  useEffect(() => {
    // Role-based access control for admin and system_admin only
    (async () => {
      const token = await getValidToken();
      if (!token) {
        navigate("/login");
        return;
      }
      try {
        const decoded = jwtDecode(token);
        const role = decoded.role || "";
        setUserRole(role);
        if (role !== "admin" && role !== "system_admin") {
          navigate("/");
        }
      } catch (err) {
        navigate("/login");
      }
    })();
  }, [navigate]);

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const token = await getValidToken();
        if (!token) throw new Error("Not authenticated");
        const res = await axios.get(
          `${API_BASE_URL}/api/settings/environment/`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        setBlockedDays(res.data.blocked_days || []);
        setStatus(""); // Clear any previous error status
      } catch (err) {
        console.error("Failed to load settings error:", err);
        console.error("Error response:", err.response?.data);
        console.error("Error status:", err.response?.status);
        setStatus("Failed to load settings.");
      }
      setLoading(false);
    }

    // a system administrator picks the facility above first; the request then carries it
    if (userRole && (userRole !== "system_admin" || facility.choice)) {
      fetchSettings();
    }
  }, [userRole, facility.choice]);

  const handleCheckbox = (dayValue) => {
    setBlockedDays((prev) =>
      prev.includes(dayValue)
        ? prev.filter((d) => d !== dayValue)
        : [...prev, dayValue]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus("");
    try {
      const token = await getValidToken();
      if (!token) throw new Error("Not authenticated");
      const payload = { blocked_days: blockedDays };
      // one facility, or (All facilities) the same save for each facility in turn
      await applyToFacilities(() =>
        axios.post(`${API_BASE_URL}/api/settings/environment/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      setStatus("Saved!");
    } catch (e) {
      setStatus(e.partial ? e.message : "Failed to save.");
      console.error(e);
    }
    setSaving(false);
  };

  const ENV_TABS = [
    { value: "blocked-days", label: "Default Blocked Days" },
    { value: "clinic-events", label: "Clinic Events" },
    { value: "holidays", label: "Holidays" },
  ];

  return (
    <Box sx={{ bgcolor: "background.paper" }}>
      <SettingsToolbarPortal>
        {ENV_TABS.map((t) => (
          <Chip
            key={t.value}
            size="small"
            clickable
            color={tabKey === t.value ? "primary" : "default"}
            variant={tabKey === t.value ? "filled" : "outlined"}
            label={t.label}
            onClick={() => setTabKey(t.value)}
            sx={{ order: 0 }}
            data-testid={`env-tab-${t.value}`}
          />
        ))}
        {tabKey === "blocked-days" && (
          <>
            <Box sx={{ flex: 1, order: 1 }} />
            {status && (
              <Chip size="small" sx={{ order: 1 }} color={status === "Saved!" ? "success" : "error"} label={status} />
            )}
            <Button size="small" sx={{ order: 1 }} variant="contained" onClick={handleSave} disabled={saving || loading}>
              {saving ? <CircularProgress size={18} /> : "Save settings"}
            </Button>
          </>
        )}
      </SettingsToolbarPortal>
      {tabKey === "blocked-days" && (
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 600 }}>
            Organization Default Blocked Days
          </Typography>
          <Table
            size="small"
            stickyHeader
            sx={{ bgcolor: "#eff6ff", borderRadius: 2 }}
          >
            <TableHead>
              <TableRow sx={{ bgcolor: "#dbeafe" }}>
                <TableCell
                  sx={{ fontWeight: "bold", width: 180, fontSize: "1rem" }}
                >
                  Setting
                </TableCell>
                {DAYS.map((d) => (
                  <TableCell
                    key={d.value}
                    sx={{
                      fontWeight: "bold",
                      width: 80,
                      textAlign: "center",
                      fontSize: "1rem",
                    }}
                  >
                    {d.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow sx={{ "&:nth-of-type(odd)": { bgcolor: "#eff6ff" } }}>
                <TableCell className="text-start">
                  <b>Organization Blocked Days</b>
                </TableCell>
                {DAYS.map((d) => (
                  <TableCell key={d.value} sx={{ textAlign: "center" }}>
                    <Checkbox
                      checked={blockedDays.includes(d.value)}
                      onChange={() => handleCheckbox(d.value)}
                      disabled={loading || saving}
                    />
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            <b>Organization-wide setting:</b> Select which days are blocked by default for
            {userRole === "system_admin" && facility.choice
              ? facility.choice === "all"
                ? " every facility's"
                : ` ${facility.facilities.find((f) => String(f.id) === facility.choice)?.name || "this facility"}'s`
              : " your organization's"} scheduling.
            This affects all clinic appointments and is separate from individual provider availability.
          </Typography>
        </Box>
      )}

      {tabKey === "clinic-events" && (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
          <SingleFacilityOnly what="Clinic events">
            <ClinicEventsManagement />
          </SingleFacilityOnly>
        </Box>
      )}

      {tabKey === "holidays" && (
        <SingleFacilityOnly what="Holidays">
          <HolidaysTab />
        </SingleFacilityOnly>
      )}

    </Box>
  );
}

export default EnvironmentProfilePage;
