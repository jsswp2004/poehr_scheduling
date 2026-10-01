import { useState, useEffect } from "react";
import { Alert, Badge, Box, Button, Tabs, Tab, Typography } from "@mui/material";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import BackButton from "../components/BackButton";
import { getAccessToken } from "../utils/tokenManager";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import StaffingCalendarTab from "./StaffingCalendarTab";
import StaffingUploadTab from "./StaffingUploadTab";
import StaffingAssignTab from "./StaffingAssignTab";
import StaffingRosterTab from "./StaffingRosterTab";
import StaffingReportsTab from "./StaffingReportsTab";
import StaffingUnitsTab from "./StaffingUnitsTab";
import StaffingTimeOffTab from "./StaffingTimeOffTab";

const ADMIN_ROLES = ["admin", "system_admin"];
const ALLOWED_ROLES = ["admin", "system_admin", "doctor", "nurse", "registrar"];

function StaffingPage() {
  const [tab, setTab] = useState("calendar");
  const [role, setRole] = useState("");
  const [timeOffCounts, setTimeOffCounts] = useState({ open_emergencies: 0, pending_requests: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      navigate("/login?redirect=staffing");
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const userRole = decoded.role || "";
      if (!ALLOWED_ROLES.includes(userRole)) {
        navigate("/dashboard");
        return;
      }
      setRole(userRole);
    } catch (err) {
      navigate("/login?redirect=staffing");
    }
  }, [navigate]);

  // Light poll so an open emergency call-out is visible from any tab.
  useEffect(() => {
    if (!role) return undefined;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await axios.get(apiEndpoints.staffingTimeOff, {
          headers: getAuthHeaders(getAccessToken()),
          params: { status: "open,pending" },
        });
        if (!cancelled) {
          setTimeOffCounts({
            open_emergencies: res.data.open_emergencies || 0,
            pending_requests: res.data.pending_requests || 0,
          });
        }
      } catch (err) {
        // The badge is a convenience; ignore failures.
      }
    };
    check();
    const t = setInterval(check, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [role]);

  const isAdmin = ADMIN_ROLES.includes(role);

  return (
    <Box sx={{ height: "100%", p: 2, bgcolor: "background.paper", borderRadius: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <BackButton to="/solutions" sx={{ mb: 0 }} />
        <Typography variant="h5">Staffing</Typography>
      </Box>

      {timeOffCounts.open_emergencies > 0 && tab !== "timeoff" && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => setTab("timeoff")}>
              Find cover
            </Button>
          }
        >
          {timeOffCounts.open_emergencies} emergency call-out
          {timeOffCounts.open_emergencies === 1 ? "" : "s"} waiting for cover.
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={(e, val) => setTab(val)}
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab value="calendar" label="Calendar" />
        <Tab value="roster" label="Roster" />
        <Tab value="units" label="Units & Census" />
        <Tab
          value="timeoff"
          label={
            <Badge
              color={timeOffCounts.open_emergencies > 0 ? "error" : "warning"}
              badgeContent={timeOffCounts.open_emergencies + timeOffCounts.pending_requests}
              sx={{ "& .MuiBadge-badge": { right: -14, top: 2 } }}
            >
              Time Off
            </Badge>
          }
        />
        {isAdmin && <Tab value="upload" label="Upload CSV" />}
        {isAdmin && <Tab value="assign" label="Assign Schedule" />}
        <Tab value="reports" label="Reports" />
      </Tabs>

      {tab === "calendar" && <StaffingCalendarTab isAdmin={isAdmin} />}
      {tab === "roster" && <StaffingRosterTab isAdmin={isAdmin} />}
      {tab === "units" && <StaffingUnitsTab isAdmin={isAdmin} />}
      {tab === "timeoff" && <StaffingTimeOffTab isAdmin={isAdmin} />}
      {tab === "upload" && isAdmin && <StaffingUploadTab />}
      {tab === "assign" && isAdmin && <StaffingAssignTab />}
      {tab === "reports" && <StaffingReportsTab />}
    </Box>
  );
}

export default StaffingPage;
