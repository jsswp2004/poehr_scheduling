import { Box } from "@mui/material";
import { useLocation } from "react-router-dom";
import { followsActingOrg, isNeutralPath, useActingOrg } from "../utils/actingOrg";

/** Shown under the header while a system administrator is working in another organization. */
export default function ViewingOrgStrip() {
  const acting = useActingOrg();
  const { pathname } = useLocation();
  if (!acting) return null;
  const follows = followsActingOrg(pathname);
  return (
    <Box role="status" sx={{ bgcolor: "#fff3d6", color: "#8a5a00", px: 2, py: 0.75, fontSize: 14, fontWeight: 600, borderBottom: "1px solid #e8d9a8" }}>
      Viewing {acting.name}. Not your own organization.
      {!follows && !isNeutralPath(pathname) && ` This page still shows your own organization${acting.ownName ? ` (${acting.ownName})` : ""}, not ${acting.name}.`}
    </Box>
  );
}
