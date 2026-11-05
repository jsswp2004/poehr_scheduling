import { useMemo, useState } from "react";
import { Box, Typography, Button, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { MODULE_COLORS } from "./reportUtils";

// Centre of each box on a 1000 x 620 canvas. Patient and Visit sit in the middle; the rest are grouped
// in lanes around them. The links come from the server's catalog, so the map shows what the engine can really join.
const POS = {
  msg: [110, 200],
  pat: [500, 200],
  visit: [500, 350],
  allergy: [320, 60],
  vaccine: [500, 60],
  referral: [680, 60],
  nurse: [110, 350],
  shift: [110, 500],
  doc: [500, 520],
  appt: [890, 120],
  note: [890, 235],
  order: [890, 350],
  lab: [890, 465],
  docs: [890, 580],
};
const LANES = [
  ["Reach patients", 110, 150],
  ["Clinical record", 500, 20],
  ["Care team", 110, 305],
  ["Scheduling and chart", 890, 70],
];
const W = 156;
const H = 48;

// A gentle curve so parallel lines do not sit on top of each other.
function geom(a, b, i) {
  const [ax, ay] = POS[a];
  const [bx, by] = POS[b];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const off = (i % 2 ? 1 : -1) * Math.min(46, len * 0.1);
  const mx = (ax + bx) / 2 - (dy / len) * off;
  const my = (ay + by) / 2 + (dx / len) * off;
  return {
    d: `M${ax},${ay} Q${mx},${my} ${bx},${by}`,
    lx: 0.25 * ax + 0.5 * mx + 0.25 * bx,
    ly: 0.25 * ay + 0.5 * my + 0.25 * by,
  };
}

export default function ReportRelationshipMap({ catalog }) {
  const theme = useTheme();
  const [focus, setFocus] = useState(null);
  const [pairA, setPairA] = useState("msg");
  const [pairB, setPairB] = useState("nurse");

  const byKey = useMemo(() => Object.fromEntries((catalog?.objects || []).map((o) => [o.key, o])), [catalog]);
  const links = useMemo(
    () => (catalog?.links || []).filter((l) => POS[l.a] && POS[l.b] && byKey[l.a] && byKey[l.b]),
    [catalog, byKey]
  );
  const keys = useMemo(() => Object.keys(POS).filter((k) => byKey[k]), [byKey]);

  if (!catalog) return null;

  const text = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const warn = theme.palette.warning.main;
  const strong = theme.palette.mode === "dark" ? "#9fb0cc" : "#44546f";
  const paper = theme.palette.background.paper;
  const colorOf = (k) => MODULE_COLORS[byKey[k]?.module_label] || muted;
  const locked = (k) => !byKey[k]?.allowed;
  const name = (k) => byKey[k]?.label || k;

  const linksOf = (k) =>
    links.map((l, i) => ({ l, i })).filter((x) => x.l.a === k || x.l.b === k);
  const other = (l, k) => (l.a === k ? l.b : l.a);

  // Shortest chain of real links between two things.
  const pathBetween = (a, b) => {
    const queue = [[a]];
    const seen = new Set([a]);
    while (queue.length) {
      const p = queue.shift();
      const last = p[p.length - 1];
      if (last === b) return p;
      linksOf(last).forEach((x) => {
        const o = other(x.l, last);
        if (!seen.has(o)) {
          seen.add(o);
          queue.push([...p, o]);
        }
      });
    }
    return null;
  };

  // What the picture lights up: one thing's links, or a chain found by the check.
  const mine = focus ? linksOf(focus) : [];
  const chain = !focus && pairA !== pairB && !locked(pairA) && !locked(pairB) ? pathBetween(pairA, pairB) : null;
  const chainKeys = new Set(chain || []);
  const edgeOn = (l) => {
    if (focus) return l.a === focus || l.b === focus;
    if (chain) {
      const ia = chain.indexOf(l.a);
      const ib = chain.indexOf(l.b);
      return ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1;
    }
    return false;
  };
  const dimmed = !!focus || !!chain;
  const nodeOn = (k) => {
    if (focus) return k === focus || mine.some((x) => x.l.a === k || x.l.b === k);
    if (chain) return chainKeys.has(k);
    return true;
  };

  const verdict = () => {
    if (pairA === pairB) return { tone: "bad", msg: "Pick two different things." };
    const blocked = [pairA, pairB].find(locked);
    if (blocked) return { tone: "bad", msg: `${name(blocked)} is locked for your role, so it cannot go on your canvas.` };
    const direct = links.find((l) => (l.a === pairA && l.b === pairB) || (l.a === pairB && l.b === pairA));
    if (direct) {
      return {
        tone: direct.fuzzy ? "mid" : "good",
        msg: `${name(pairA)} and ${name(pairB)} connect directly through "${direct.label}". ${
          direct.fuzzy ? "It is matched by phone number, so treat the counts as estimates." : "It is an exact link."
        }`,
      };
    }
    if (!chain) return { tone: "bad", msg: `${name(pairA)} and ${name(pairB)} have no route between them.` };
    const mid = chain.slice(1, -1).map(name);
    return { tone: "mid", msg: `${name(pairA)} and ${name(pairB)} are not linked directly. Add ${mid.join(" and ")} to the canvas to connect them.` };
  };
  const v = verdict();
  const toneColor = { good: theme.palette.success.main, mid: warn, bad: muted }[v.tone];

  const pick = (k) => setFocus((f) => (f === k ? null : k));
  const select = (setter) => (e) => {
    setter(e.target.value);
    setFocus(null);
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        These are the things you can combine in a report. Click one to see what it connects to, or use the check to find out whether two things can go
        on the same canvas.
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1fr) 320px" }, gap: 1.5, alignItems: "start" }}>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1, overflowX: "auto", bgcolor: "background.paper" }}>
          <svg viewBox="0 0 1000 620" role="group" aria-label="How the things you can put in a linked report connect" style={{ display: "block", minWidth: 720, width: "100%", height: "auto" }}>
            {LANES.map(([t, x, y]) => (
              <text key={t} x={x} y={y} textAnchor="middle" fontSize="11" letterSpacing="1" fill={muted}>
                {t.toUpperCase()}
              </text>
            ))}
            {links.map((l, i) => {
              const g = geom(l.a, l.b, i);
              const on = edgeOn(l);
              return (
                <path
                  key={`${l.a}-${l.b}`}
                  d={g.d}
                  fill="none"
                  stroke={on ? (l.fuzzy ? warn : strong) : theme.palette.divider}
                  strokeWidth={on ? 2.4 : 1.4}
                  strokeDasharray={l.fuzzy ? "6 4" : undefined}
                  opacity={dimmed && !on ? 0.25 : 1}
                />
              );
            })}
            {keys.map((k) => {
              const [x, y] = POS[k];
              const sel = k === focus;
              return (
                <g
                  key={k}
                  tabIndex={0}
                  role="button"
                  aria-label={`${name(k)}, ${byKey[k].module_label}`}
                  aria-pressed={sel}
                  style={{ cursor: "pointer", outline: "none" }}
                  opacity={locked(k) ? 0.45 : dimmed && !nodeOn(k) ? 0.28 : 1}
                  onClick={() => pick(k)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      pick(k);
                    }
                  }}
                >
                  <rect
                    x={x - W / 2}
                    y={y - H / 2}
                    width={W}
                    height={H}
                    rx="10"
                    fill={paper}
                    stroke={colorOf(k)}
                    strokeWidth={sel ? 3.5 : 2}
                    strokeDasharray={locked(k) ? "4 3" : undefined}
                  />
                  <text x={x} y={y - 4} textAnchor="middle" fontSize="14" fontWeight="600" fill={text}>
                    {name(k)}
                  </text>
                  <text x={x} y={y + 13} textAnchor="middle" fontSize="11" fill={muted}>
                    {locked(k) ? `${byKey[k].module_label} · locked` : byKey[k].module_label}
                  </text>
                </g>
              );
            })}
            {/* Labels only for the picked thing, on a solid pill that sits on top of the line. */}
            {focus &&
              mine.map(({ l, i }) => {
                const g = geom(l.a, l.b, i);
                const w = l.label.length * 6.4 + 16;
                return (
                  <g key={`pill-${l.a}-${l.b}`} pointerEvents="none">
                    <rect x={g.lx - w / 2} y={g.ly - 11} width={w} height={22} rx="11" fill={paper} stroke={l.fuzzy ? warn : strong} />
                    <text x={g.lx} y={g.ly} textAnchor="middle" dominantBaseline="central" fontSize="11" fill={text}>
                      {l.label}
                    </text>
                  </g>
                );
              })}
          </svg>
          <Box sx={{ display: "flex", gap: 2.5, flexWrap: "wrap", px: 1, pb: 0.5, color: "text.secondary", fontSize: 12 }}>
            <span>Solid line: an exact link (a stored ID)</span>
            <span style={{ color: warn }}>Dashed line: matched by phone number, not a stored ID</span>
            <span>Faded and dashed box: your role does not include it</span>
          </Box>
        </Box>

        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.75, bgcolor: "background.paper" }} aria-live="polite">
          {!focus ? (
            <Box>
              <Typography variant="subtitle2">Pick a thing</Typography>
              <Typography variant="body2" color="text.secondary">
                Click a box to see every way it connects. Patient and Visit sit in the middle because most reports start from one of them.
              </Typography>
            </Box>
          ) : (
            <Box>
              <Typography variant="subtitle2" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: colorOf(focus), display: "inline-block" }} />
                {name(focus)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {byKey[focus].module_label} · connects to {mine.length} other {mine.length === 1 ? "thing" : "things"}
              </Typography>
              {locked(focus) && (
                <Typography variant="caption" sx={{ color: warn, display: "block", mb: 1 }}>
                  Your role does not include this.
                </Typography>
              )}
              <Stack spacing={0.75}>
                {mine.map(({ l }) => {
                  const o = other(l, focus);
                  return (
                    <Box key={`${l.a}-${l.b}`} sx={{ bgcolor: "action.hover", borderRadius: 1, px: 1.1, py: 0.8, fontSize: 13 }}>
                      <Button size="small" onClick={() => setFocus(o)} sx={{ p: 0, minWidth: 0, textTransform: "none", fontWeight: 600, verticalAlign: "baseline" }}>
                        {name(o)}
                      </Button>{" "}
                      <span style={{ color: muted }}>through "{l.label}"</span>
                      {l.fuzzy && (
                        <Typography variant="caption" sx={{ color: warn, display: "block" }}>
                          Matched by phone number. Family members who share a number can match the wrong person.
                        </Typography>
                      )}
                      {locked(o) && (
                        <Typography variant="caption" sx={{ color: warn, display: "block" }}>
                          Locked for your role.
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}

          <Box sx={{ borderTop: "1px solid", borderColor: "divider", mt: 2, pt: 1.5 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Can these go together?
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
              <Box component="select" aria-label="First thing" value={pairA} onChange={select(setPairA)} sx={selectSx}>
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {name(k)}
                  </option>
                ))}
              </Box>
              <Typography variant="body2" color="text.secondary">
                and
              </Typography>
              <Box component="select" aria-label="Second thing" value={pairB} onChange={select(setPairB)} sx={selectSx}>
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {name(k)}
                  </option>
                ))}
              </Box>
            </Box>
            <Typography variant="body2" sx={{ borderLeft: `3px solid ${toneColor}`, bgcolor: "action.hover", borderRadius: 1, px: 1.25, py: 0.9 }}>
              {v.msg}
            </Typography>
          </Box>
        </Box>
      </Box>
      <Typography variant="body2" sx={{ mt: 1.5, p: 1.25, borderRadius: 1, bgcolor: "action.hover" }}>
        A text goes to a number, not a person. Family members who share a number, or a patient with no number on the chart, can match the wrong
        person or no one, so reports using that link say so.
      </Typography>
    </Box>
  );
}

const selectSx = {
  font: "inherit",
  fontSize: 13,
  p: "6px 8px",
  borderRadius: 1,
  border: "1px solid",
  borderColor: "divider",
  bgcolor: "background.default",
  color: "text.primary",
  minWidth: 0,
};
