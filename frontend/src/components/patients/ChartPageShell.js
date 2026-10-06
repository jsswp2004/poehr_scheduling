import { Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import CareSettingSidebar, { storedCareSetting, rememberCareSetting } from "./CareSettingSidebar";

/**
 * Wraps a patient's standalone chart page (Orders, Notes, Flowsheet, Patient detail) so the
 * care-setting sidebar stays on screen, folded to its icon strip. Picking a care setting
 * remembers it and returns to the Patients list filtered to that setting.
 */
function ChartPageShell({ children }) {
  const navigate = useNavigate();
  return (
    <Box sx={{ display: "flex", alignItems: "stretch" }}>
      <CareSettingSidebar
        compact
        value={storedCareSetting()}
        onChange={(value) => {
          rememberCareSetting(value);
          navigate("/patients");
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

export default ChartPageShell;
