import { useState, useEffect } from "react";
import {
  Box,
  Stack,
  Typography,
  Button,
  Alert,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Checkbox,
  Tabs,
  Tab,
  CircularProgress,
} from "@mui/material";
import axios from "axios";
import { API_BASE_URL } from '../config/api';
import HolidaysTab from "./HolidaysPage";
import OrganizationManagement from "../components/OrganizationManagement";
import ClinicEventsManagement from "../components/ClinicEventsManagement";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { getValidToken } from "../utils/auth";
import { applyToFacilities, useFacilityScope } from "../utils/facilityScope";
import SingleFacilityOnly from "../components/facility/SingleFacilityOnly";

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

  return (
    <Box
      sx={{
        mt: 0,
        bgcolor: "background.paper",
        height: "calc(100vh - 220px)", // Adjust for header height
      }}
    >
      <Tabs
        value={tabKey}
        onChange={(e, newValue) => setTabKey(newValue)}
        sx={{
          mb: 3,
          minHeight: 48,
          "& .MuiTabs-indicator": {
            height: 2,
            bgcolor: "primary.main",
          },
          "& .MuiTab-root": {
            fontWeight: 400,
            fontSize: "1rem",
            color: "text.secondary",
            minHeight: 48,
            textTransform: "none",
            transition: "color 0.2s",
            "&.Mui-selected": {
              color: "primary.main",
            },
            "&:hover": {
              color: "primary.main",
            },
          },
        }}
      >
        <Tab label="Default Blocked Days" value="blocked-days" />
        <Tab label="Clinic Events" value="clinic-events" />
        <Tab label="Holidays" value="holidays" />
        <Tab label="Organization" value="organization" />
      </Tabs>

      {tabKey === "blocked-days" && (
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Organization Default Blocked Days
          </Typography>
          <Table
            size="small"
            stickyHeader
            sx={{ bgcolor: "#f5faff", borderRadius: 2 }}
          >
            <TableHead>
              <TableRow sx={{ bgcolor: "#e3f2fd" }}>
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
              <TableRow sx={{ "&:nth-of-type(odd)": { bgcolor: "#f0f4ff" } }}>
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
          <Stack direction="row" spacing={2} sx={{ mt: 2 }} alignItems="center">
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving || loading}
            >
              {saving ? <CircularProgress size={24} /> : "Save Settings"}
            </Button>
            {status && (
              <Alert
                severity={status === "Saved!" ? "success" : "error"}
                sx={{ flex: 1 }}
              >
                {status}
              </Alert>
            )}
          </Stack>
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
        <Box sx={{
          p: 2,
          height: "600px",
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
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

      {tabKey === "organization" && (
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Organization Management
          </Typography>
          <OrganizationManagement />
        </Box>
      )}
    </Box>
  );
}

export default EnvironmentProfilePage;
