import { Box, Chip, Stack, Typography } from "@mui/material";

/**
 * Fishbone lab diagrams: the BMP and CBC drawn the way clinicians sketch them, plus a row of other labs.
 * Each value shows its flag as an arrow (not colour alone), and hovering a value shows the details.
 * The server sends the cells in a fixed order with gaps included, so this only has to draw them.
 */

const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString() : "");

const FLAG_WORDS = { L: "low", H: "high", LL: "critically low", HH: "critically high", A: "abnormal" };

/** "↑" / "↓" for a high or low value, "‼" added when it is critical. */
export function flagMark(flag) {
  if (!flag) return "";
  const arrow = flag.startsWith("H") ? "↑" : flag.startsWith("L") ? "↓" : "!";
  return flag.length === 2 ? `${arrow}‼` : arrow;
}

const TREND_WORDS = { up: "up from", down: "down from", same: "unchanged from" };

/** The sentence a hover (and a screen reader) gets for one value. */
export function cellDescription(cell) {
  if (cell.value === null || cell.value === undefined) return `${cell.label}: no result`;
  const parts = [`${cell.label} ${cell.value}${cell.units ? ` ${cell.units}` : ""}`];
  if (cell.flag) parts.push(FLAG_WORDS[cell.flag] || "abnormal");
  if (cell.reference) parts.push(`reference ${cell.reference}`);
  if (cell.at) parts.push(fmtWhen(cell.at));
  if (cell.previous) parts.push(`${TREND_WORDS[cell.trend] || "previously"} ${cell.previous.value}`);
  return parts.join(", ");
}

const colorFor = (cell) => (cell.critical ? "#b71c1c" : cell.flag ? "#c62828" : "#1a1a1a");

/** One value inside the diagram: the number sits on baseline `y`, the small name on baseline `ly`. */
function Value({ cell, x, y, ly }) {
  const empty = cell.value === null || cell.value === undefined;
  return (
    <g role="img" aria-label={cellDescription(cell)} data-testid={`fish-${cell.key}`}>
      <title>{cellDescription(cell)}</title>
      <text x={x} y={ly} textAnchor="middle" fontSize="10" fill="#6b6b6b">
        {cell.label}
      </text>
      <text
        x={x}
        y={y}
        textAnchor="middle"
        fontSize="16"
        fontWeight={cell.flag ? 700 : 500}
        fill={empty ? "#9e9e9e" : colorFor(cell)}
        textDecoration={cell.critical ? "underline" : undefined}
      >
        {empty ? "–" : `${cell.value}${flagMark(cell.flag)}`}
      </text>
    </g>
  );
}

const byKey = (panel) => Object.fromEntries(panel.cells.map((c) => [c.key, c]));

/** Na Cl BUN across the top, K CO2 Cr across the bottom, glucose at the tail. */
export function BmpFishbone({ panel }) {
  const c = byKey(panel);
  return (
    <svg viewBox="0 0 340 124" width="100%" style={{ maxWidth: 380 }} role="group" aria-label="Basic metabolic panel" data-testid="fishbone-bmp">
      <g stroke="#546e7a" strokeWidth="1.6" fill="none">
        <line x1="6" y1="62" x2="270" y2="62" />
        <line x1="90" y1="12" x2="90" y2="112" />
        <line x1="172" y1="12" x2="172" y2="112" />
        <line x1="236" y1="14" x2="270" y2="62" />
        <line x1="236" y1="110" x2="270" y2="62" />
      </g>
      <Value cell={c.na} x={48} y={40} ly={14} />
      <Value cell={c.cl} x={131} y={40} ly={14} />
      <Value cell={c.bun} x={211} y={40} ly={14} />
      <Value cell={c.k} x={48} y={100} ly={118} />
      <Value cell={c.co2} x={131} y={100} ly={118} />
      <Value cell={c.cr} x={211} y={100} ly={118} />
      <Value cell={c.glu} x={304} y={76} ly={52} />
    </svg>
  );
}

/** WBC on the left, platelets on the right, haemoglobin over haematocrit in the cross. */
export function CbcFishbone({ panel }) {
  const c = byKey(panel);
  return (
    <svg viewBox="0 0 300 124" width="100%" style={{ maxWidth: 340 }} role="group" aria-label="Complete blood count" data-testid="fishbone-cbc">
      <g stroke="#546e7a" strokeWidth="1.6" fill="none">
        <line x1="92" y1="18" x2="208" y2="106" />
        <line x1="208" y1="18" x2="92" y2="106" />
      </g>
      <Value cell={c.wbc} x={44} y={76} ly={52} />
      <Value cell={c.hgb} x={150} y={42} ly={14} />
      <Value cell={c.hct} x={150} y={100} ly={118} />
      <Value cell={c.plt} x={256} y={76} ly={52} />
    </svg>
  );
}

/** The labs with no diagram of their own, as small chips. Labs with no result are left out. */
export function OtherLabs({ panel }) {
  const shown = panel.cells.filter((cell) => cell.value !== null && cell.value !== undefined);
  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" data-testid="other-labs">
      {shown.map((cell) => (
        <Chip
          key={cell.key}
          size="small"
          variant="outlined"
          title={cellDescription(cell)}
          aria-label={cellDescription(cell)}
          data-testid={`fish-${cell.key}`}
          label={`${cell.label} ${cell.value}${flagMark(cell.flag)}`}
          sx={{ color: colorFor(cell), borderColor: cell.flag ? colorFor(cell) : undefined, fontWeight: cell.flag ? 700 : 400 }}
        />
      ))}
    </Stack>
  );
}

/** Every panel the patient has results for, each with when it was collected. */
export default function FishbonePanels({ panels }) {
  if (!panels || panels.length === 0) return null;
  return (
    <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap" alignItems="flex-start" data-testid="fishbone-panels">
      {panels.map((panel) => (
        <Box key={panel.key} sx={{ minWidth: 220, flex: panel.key === "other" ? "1 1 100%" : "0 1 auto" }} data-testid={`panel-${panel.key}`}>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 600 }}>
            {panel.title} · {fmtWhen(panel.at)}
          </Typography>
          {panel.key === "bmp" && <BmpFishbone panel={panel} />}
          {panel.key === "cbc" && <CbcFishbone panel={panel} />}
          {panel.key === "other" && <OtherLabs panel={panel} />}
        </Box>
      ))}
    </Stack>
  );
}
