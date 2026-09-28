import { useState, useEffect } from "react";
import { Box, Tabs, Tab, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import BackButton from "../components/BackButton";
import { getAccessToken } from "../utils/tokenManager";
import StaffingCalendarTab from "./StaffingCalendarTab";
import StaffingUploadTab from "./StaffingUploadTab";
import StaffingAssignTab from "./StaffingAssignTab";
import StaffingRosterTab from "./StaffingRosterTab";

const ADMIN_ROLES = ["admin", "system_admin"];
const ALLOWED_ROLES = ["admin", "system_admin", "doctor", "nurse", "registrar"];

function StaffingPage() {
  const [tab, setTab] = useState("calendar");
  const [role, setRole] = useState("");
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

  const isAdmin = ADMIN_ROLES.includes(role);

  return (
    <Box sx={{ height: "100%", p: 2, bgcolor: "background.paper", borderRadius: 2 }}>
      <BackButton to="/solutions" />
      <Typography variant="h5" sx={{ mb: 2, mt: 1 }}>
        Staffing
      </Typography>

      <Tabs
        value={tab}
        onChange={(e, val) => setTab(val)}
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab value="calendar" label="Calendar" />
        <Tab value="roster" label="Roster" />
        {isAdmin && <Tab value="upload" label="Upload CSV" />}
        {isAdmin && <Tab value="assign" label="Assign Schedule" />}
      </Tabs>

      {tab === "calendar" && <StaffingCalendarTab isAdmin={isAdmin} />}
      {tab === "roster" && <StaffingRosterTab />}
      {tab === "upload" && isAdmin && <StaffingUploadTab />}
      {tab === "assign" && isAdmin && <StaffingAssignTab />}
    </Box>
  );
}

export default StaffingPage;
