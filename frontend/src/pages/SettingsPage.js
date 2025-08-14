import { useState } from "react";
import MaintenancePage from "./MaintenancePage";
import EnvironmentProfilePage from "./EnvironmentProfilePage";
import UploadTab from "../components/UploadTab";
import BackButton from "../components/BackButton";
import { Box, Typography, Tabs, Tab } from "@mui/material";

function SettingsPage() {
  const [tab, setTab] = useState("maintenance");

  return (
    <div style={{ textAlign: "left", width: "100%" }}>
      <Box
        sx={{
          mt: 0,
          boxShadow: 0,
          borderRadius: 2,
          bgcolor: "background.paper",
          p: 0,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            mb: -1, // Negative margin to pull content up and connect to tabs
            borderRadius: 2,
            bgcolor: "#f5faff",
            boxShadow: 0,
            minHeight: 48,
            p: 0,
          }}
        >
          <Tabs
            value={tab}
            onChange={(_, val) => setTab(val)}
            sx={{
              flex: 1,
              minHeight: 40,
              "& .MuiTabs-indicator": {
                height: 4,
                borderRadius: 2,
                bgcolor: "primary.main",
              },
              "& .MuiTab-root": {
                fontWeight: 500,
                fontSize: "1rem",
                color: "primary.main",
                minHeight: 40,
                textTransform: "none",
                borderRadius: 2,
                mx: 0.5,
                transition: "background 0.2s",
                "&.Mui-selected": {
                  bgcolor: "primary.light",
                  color: "primary.dark",
                  boxShadow: 2,
                },
                "&:hover": {
                  bgcolor: "primary.lighter",
                  color: "primary.dark",
                },
              },
            }}
          >
            <Tab label="Schedule Maintenance" value="maintenance" />
            <Tab label="Environment Profile" value="env" />
            <Tab label="Uploads / Downloads" value="uploads" />
          </Tabs>
          <Box sx={{ ml: 1 }}>
            <BackButton />
          </Box>
        </Box>

        {tab === "maintenance" && (
          <Box
            sx={{
              boxShadow: 2,
              borderRadius: "0 0 8px 8px",
              bgcolor: "background.paper",
              p: 3,
            }}
          >
            <MaintenancePage />
          </Box>
        )}
        {tab === "env" && (
          <Box
            sx={{
              boxShadow: 2,
              borderRadius: "0 0 8px 8px",
              bgcolor: "background.paper",
              p: 3,
            }}
          >
            {/*<Typography variant="h6" sx={{ mb: 2 }}>Environment Profile</Typography>*/}
            <EnvironmentProfilePage />
          </Box>
        )}
        {tab === "uploads" && (
          <Box
            sx={{
              boxShadow: 2,
              borderRadius: "0 0 8px 8px",
              bgcolor: "background.paper",
              p: 3,
            }}
          >
            {}
            <UploadTab />
          </Box>
        )}
      </Box>
    </div>
  );
}

export default SettingsPage;
