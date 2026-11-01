import { useCallback, useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { fmtDateTime, visitLabel, visitType } from "./PatientInfoPanel";

export const STRIP_SECONDS = 10;

/**
 * Shown while the chart is on a visit that is not the current one. The orange strip stays for
 * STRIP_SECONDS (a thin line drains along its bottom), then folds to a small tab on the right
 * edge of the window; clicking the tab brings the strip back for another STRIP_SECONDS.
 */
export default function PastVisitStrip({ visit, onBack }) {
  const [shown, setShown] = useState(true);
  const [run, setRun] = useState(0); // bumps each time the strip is brought back, to restart the line

  // a different visit opened: show the strip again
  useEffect(() => {
    setShown(true);
    setRun((n) => n + 1);
  }, [visit.id]);

  useEffect(() => {
    if (!shown) return undefined;
    const t = setTimeout(() => setShown(false), STRIP_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [shown, run]);

  const bringBack = useCallback(() => {
    setShown(true);
    setRun((n) => n + 1);
  }, []);

  const discharged = visit.discharge ? `, discharged ${fmtDateTime(visit.discharge)}` : "";
  const type = visitType(visit);

  if (!shown) {
    return (
      <Box
        component="button"
        type="button"
        onClick={bringBack}
        aria-label="Past visit open. Show details"
        data-testid="past-visit-tab"
        sx={{
          position: "fixed",
          right: 0,
          top: "40%",
          zIndex: 1200,
          border: 0,
          cursor: "pointer",
          bgcolor: "warning.main",
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.75rem",
          px: 0.5,
          py: 1.25,
          borderRadius: "6px 0 0 6px",
          writingMode: "vertical-rl",
          boxShadow: 2,
        }}
      >
        Past visit open
      </Box>
    );
  }

  return (
    <Box
      role="status"
      data-testid="past-visit-strip"
      sx={{ position: "relative", flexShrink: 0, bgcolor: "#fff4e5", color: "#7a4100", borderBottom: 1, borderColor: "warning.main", px: 1.5, py: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
    >
      <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>
        <strong>Working in a past visit:</strong> {visitLabel(visit)}
        {type ? ` · ${type}` : ""} · {fmtDateTime(visit.admit)}
        {discharged}
      </Typography>
      <Button size="small" variant="contained" color="warning" onClick={onBack} data-testid="past-visit-back">
        Back to current visit
      </Button>
      <Button size="small" onClick={() => setShown(false)} sx={{ color: "inherit" }} data-testid="past-visit-fold">
        Fold now
      </Button>
      <Box
        key={run}
        aria-hidden
        sx={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 2,
          bgcolor: "warning.main",
          width: "100%",
          animation: `pvDrain ${STRIP_SECONDS}s linear forwards`,
          "@keyframes pvDrain": { from: { width: "100%" }, to: { width: "0%" } },
        }}
      />
    </Box>
  );
}
