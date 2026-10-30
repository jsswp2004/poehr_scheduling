import { Box } from "@mui/material";
import { useLocation } from "react-router-dom";
import { followsActingOrg, isNeutralPath, useActingOrg } from "../utils/actingOrg";

/**
 * Shown under the header only on pages that do NOT follow the organization chosen in the header, so a
 * system administrator is never misled into thinking that page shows the organization they picked.
 * Pages that follow the choice (and the menu pages) show nothing; the header name already says where you are.
 */
export default function ViewingOrgStrip() {
  const acting = useActingOrg();
  const { pathname } = useLocation();
  if (!acting || followsActingOrg(pathname) || isNeutralPath(pathname)) return null;
  return (
    <Box role="status" sx={{ bgcolor: "#fff3d6", color: "#8a5a00", px: 2, py: 0.75, fontSize: 14, fontWeight: 600, borderBottom: "1px solid #e8d9a8" }}>
      This page still shows your own organization{acting.ownName ? ` (${acting.ownName})` : ""}, not {acting.name}.
    </Box>
  );
}
