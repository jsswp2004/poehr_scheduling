import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { MODULE_COLORS } from "./reportUtils";

// Where each thing sits on the map (x, y of its top-left corner). The links come from the server's catalog,
// so the map always shows what the engine can really join.
const POS = {
  msg: [30, 60],
  pat: [370, 170],
  visit: [370, 290],
  appt: [720, 50],
  note: [720, 170],
  nurse: [120, 370],
  doc: [640, 370],
  shift: [370, 410],
};
const W = 150;
const H = 54;

const center = (k) => [POS[k][0] + W / 2, POS[k][1] + H / 2];

export default function ReportRelationshipMap({ catalog }) {
  const theme = useTheme();
  if (!catalog) return null;
  const byKey = Object.fromEntries(catalog.objects.map((o) => [o.key, o]));
  const links = catalog.links.filter((l) => POS[l.a] && POS[l.b]);
  const text = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const warn = theme.palette.warning.main;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        These are the things you can combine in a report and how each one connects to the next. Anything joined by a line can go on the same canvas.
      </Typography>
      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1, overflowX: "auto", bgcolor: "background.paper" }}>
        <svg viewBox="0 0 900 490" role="img" aria-label="How messages, patients, visits, notes and staff connect" style={{ display: "block", minWidth: 760, width: "100%", height: "auto" }}>
          {links.map((l) => {
            const [x1, y1] = center(l.a);
            const [x2, y2] = center(l.b);
            return (
              <g key={`${l.a}-${l.b}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={l.fuzzy ? warn : muted} strokeWidth="1.6" strokeDasharray={l.fuzzy ? "6 4" : undefined} />
                <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 - 4} fontSize="11" fill={l.fuzzy ? warn : muted}>
                  {l.label}
                </text>
              </g>
            );
          })}
          {Object.keys(POS).map((k) => {
            const o = byKey[k];
            if (!o) return null;
            const [x, y] = POS[k];
            const color = MODULE_COLORS[o.module_label] || muted;
            return (
              <g key={k} opacity={o.allowed ? 1 : 0.5}>
                <rect x={x} y={y} width={W} height={H} rx="8" fill={theme.palette.background.paper} stroke={color} strokeWidth={k === "pat" ? 2.6 : 1.6} />
                <text x={x + 14} y={y + 24} fontSize="13" fontWeight="600" fill={text}>
                  {o.label}
                </text>
                <text x={x + 14} y={y + 41} fontSize="10.5" fill={muted}>
                  {o.allowed ? o.module_label : `${o.module_label} · locked`}
                </text>
              </g>
            );
          })}
        </svg>
        <Box sx={{ display: "flex", gap: 2.5, flexWrap: "wrap", px: 1, pb: 0.5, color: "text.secondary", fontSize: 12 }}>
          <span>Solid line: an exact link (a stored ID)</span>
          <span style={{ color: warn }}>Dashed line: matched by phone number, not a stored ID</span>
          <span>Faded: you do not have access</span>
        </Box>
      </Box>
      <Typography variant="body2" sx={{ mt: 1.5, p: 1.25, borderRadius: 1, bgcolor: "action.hover" }}>
        A text goes to a number, not a person. Family members who share a number, or a patient with no number on the chart, can match the wrong
        person or no one, so reports using that link say so.
      </Typography>
    </Box>
  );
}
