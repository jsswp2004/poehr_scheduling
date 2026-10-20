import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, Switch,
  Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText, fmtDay } from "../prescriptions/rxShared";

const W = 800, H = 440, M = { l: 58, r: 56, t: 14, b: 50 };
const INK = "#0B1F33", GRID = "#D8DEE5", MUTED = "#52606D", BLUE = "#0B5CAD", FLAG = "#B42318";
export const ADULT_MONTHS = 240;

/** True when a growth chart applies: a known age under 20 years. */
export function isUnder20(ageMonths) {
  return typeof ageMonths === "number" && ageMonths >= 0 && ageMonths < ADULT_MONTHS;
}

export function fmtMonths(m) {
  if (m === null || m === undefined) return "";
  if (m < 24) return `${Number(m).toFixed(1).replace(/\.0$/, "")} mo`;
  const years = Math.floor(m / 12);
  const rest = Math.round(m - years * 12);
  return rest ? `${years} y ${rest} mo` : `${years} y`;
}

function GrowthChart({ chart, svgId }) {
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  const sx = (v) => M.l + ((v - chart.x.min) / (chart.x.max - chart.x.min)) * pw;
  const sy = (v) => M.t + ph - ((v - chart.y.min) / (chart.y.max - chart.y.min)) * ph;
  const path = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  const inside = chart.points.filter((p) => p.x >= chart.x.min && p.x <= chart.x.max);
  return (
    <svg id={svgId} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title} style={{ width: "100%", height: "auto", background: "#fff" }}
      fontFamily="Inter, system-ui, sans-serif" data-testid={`gc-svg-${chart.key}`}>
      {chart.y.ticks.map(([v, label]) => (
        <g key={`y${v}`}>
          <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke={GRID} strokeWidth="1" />
          <text x={M.l - 8} y={sy(v) + 4} fontSize="12" fill={MUTED} textAnchor="end">{label}</text>
        </g>
      ))}
      {chart.x.ticks.map(([v, label]) => (
        <g key={`x${v}`}>
          <line x1={sx(v)} x2={sx(v)} y1={M.t} y2={H - M.b} stroke={GRID} strokeWidth="1" />
          <text x={sx(v)} y={H - M.b + 18} fontSize="12" fill={MUTED} textAnchor="middle">{label}</text>
        </g>
      ))}
      <rect x={M.l} y={M.t} width={pw} height={ph} fill="none" stroke="#9AA7B4" />
      <text x={M.l + pw / 2} y={H - 8} fontSize="13" fill={INK} textAnchor="middle" fontWeight="600">{chart.x.label}</text>
      <text transform={`translate(14 ${M.t + ph / 2}) rotate(-90)`} fontSize="13" fill={INK} textAnchor="middle" fontWeight="600">{chart.y.label}</text>
      {chart.curves.map((c, i) => {
        const median = c.z === 0;
        const edge = i === 0 || i === chart.curves.length - 1;
        const last = c.points[c.points.length - 1];
        return (
          <g key={c.label}>
            <path d={path(c.points)} fill="none" stroke={median ? INK : edge ? "#7B8794" : "#B8C2CC"} strokeWidth={median ? 2 : 1.5} strokeDasharray={edge && !median ? "6 4" : undefined} />
            {last && <text x={sx(last[0]) + 5} y={sy(last[1]) + 4} fontSize="11" fill={MUTED}>{c.label}</text>}
          </g>
        );
      })}
      {inside.length > 1 && <path d={path(inside.map((p) => [p.x, p.value]))} fill="none" stroke={BLUE} strokeWidth="2" />}
      {inside.map((p, i) => {
        const cx = sx(p.x), cy = sy(p.value);
        const label = `${fmtDay(p.date)}: ${p.value} ${chart.y.unit}, ${p.percentile_label} percentile. ${p.status_label}`;
        return p.flag ? (
          <g key={i} data-testid="gc-point-flag">
            <title>{label}</title>
            <path d={`M${cx},${cy - 8} L${cx + 8},${cy} L${cx},${cy + 8} L${cx - 8},${cy} Z`} fill={FLAG} stroke="#fff" strokeWidth="1.5" />
          </g>
        ) : (
          <g key={i} data-testid="gc-point"><title>{label}</title><circle cx={cx} cy={cy} r="5.5" fill={BLUE} stroke="#fff" strokeWidth="1.5" /></g>
        );
      })}
    </svg>
  );
}

function printChart(chart, body) {
  const svg = document.getElementById("gc-svg-live");
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w || !svg) return;
  const p = body.patient;
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rows = chart.points.map((pt) => `<tr><td>${esc(fmtDay(pt.date))}</td><td>${esc(fmtMonths(pt.chrono_months))}</td><td>${esc(pt.value)} ${esc(chart.y.unit)}</td><td>${esc(pt.percentile_label)}</td><td>${esc(pt.status_label)}</td></tr>`).join("");
  w.document.write(`<!doctype html><title>${esc(chart.title)}</title><body style="font-family:Arial,sans-serif;margin:24px;color:#0B1F33">
    <h2 style="margin:0">${esc(p.name)}</h2><div>DOB ${esc(fmtDay(p.date_of_birth))} &middot; ${esc(p.sex)} &middot; printed ${esc(fmtDay(body.as_of))}</div>
    <h3>${esc(chart.title)} <small>(${esc(chart.standard)})</small></h3>${svg.outerHTML}
    <table border="1" cellpadding="6" style="border-collapse:collapse;margin-top:12px;font-size:13px"><tr><th>Date</th><th>Age</th><th>Value</th><th>Percentile</th><th>Status</th></tr>${rows}</table>
    <p style="font-size:12px;color:#52606D">Flags are prompts for clinical review, not diagnoses.</p></body>`);
  w.document.close();
  w.focus();
  w.print();
}

export function GrowthChartModal({ patientId, onClose }) {
  const [body, setBody] = useState(null);
  const [error, setError] = useState("");
  const [corrected, setCorrected] = useState(true);
  const [tab, setTab] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await api.get(`${apiEndpoints.growthChartPatient(patientId)}?corrected=${corrected ? 1 : 0}`, { headers: await authHeader() });
      setBody(res.data);
    } catch (e) {
      setError(errorText(e, "Could not load the growth chart."));
    }
  }, [patientId, corrected]);
  useEffect(() => { load(); }, [load]);

  const charts = body?.charts || [];
  const chart = charts[Math.min(tab, Math.max(charts.length - 1, 0))];
  const flagged = useMemo(() => charts.filter((c) => c.flagged), [charts]);
  const info = body?.info;

  return (
    <Dialog open fullWidth maxWidth="lg" onClose={onClose} aria-labelledby="gc-title">
      <DialogTitle id="gc-title">
        Growth chart{body?.patient?.name ? `: ${body.patient.name}` : ""}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" data-testid="gc-error">{error}</Alert>}
        {!body && !error && <Box sx={{ p: 3 }}><CircularProgress size={22} aria-label="Loading growth chart" /></Box>}
        {body?.problem && <Alert severity="warning" data-testid="gc-problem">{body.problem_text}</Alert>}
        {body && !body.problem && info && (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap" alignItems="center">
              <Box><Typography variant="caption" color="text.secondary">Age / DOB</Typography>
                <Typography sx={{ fontWeight: 600 }}>{fmtMonths(body.patient.age_months)} ({fmtDay(body.patient.date_of_birth)})</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Sex</Typography>
                <Typography sx={{ fontWeight: 600 }}>{body.patient.sex === "male" ? "Male" : "Female"}</Typography></Box>
              {info.preterm && (
                <Box><Typography variant="caption" color="text.secondary">Born at</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{body.patient.gestational_age_weeks} wk{body.patient.gestational_age_days ? ` ${body.patient.gestational_age_days} d` : ""}</Typography></Box>
              )}
              {body.patient.birth_weight_g ? (
                <Box><Typography variant="caption" color="text.secondary">Birth weight</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{body.patient.birth_weight_g} g</Typography></Box>
              ) : null}
              {info.preterm && info.chrono_months < 24 && (
                <FormControlLabel sx={{ ml: "auto" }}
                  control={<Switch checked={corrected} onChange={(e) => setCorrected(e.target.checked)} inputProps={{ "data-testid": "gc-corrected" }} />}
                  label={`Plot by corrected age (${info.correction_weeks} weeks early)`} />
              )}
            </Stack>
            {info.preterm && info.corrected_applied && (
              <Alert severity="info" data-testid="gc-corrected-note">
                Plotted by corrected age ({fmtMonths(info.plot_months)}), actual age {fmtMonths(info.chrono_months)}. Correction applies until 24 months.
              </Alert>
            )}
            {!info.gestational_age_known && body.patient.age_months < 24 && (
              <Typography variant="body2" color="text.secondary" data-testid="gc-term-note">
                Gestational age is not recorded, so the chart assumes a term birth. Add it under Birth details in Patient Info for a premature baby.
              </Typography>
            )}
            {body.skipped > 0 && (
              <Alert severity="warning" data-testid="gc-skipped">{body.skipped} measurement{body.skipped === 1 ? "" : "s"} left off the chart because the value is not plausible. Check the flowsheet.</Alert>
            )}
            {flagged.length > 0 && (
              <Alert severity="warning" data-testid="gc-flags">
                <strong>For clinical review:</strong>{" "}
                {flagged.map((c) => `${c.label}: ${c.latest.status_label} (${c.latest.percentile_label} percentile)`).join("; ")}.
                {" "}These are prompts, not diagnoses.
              </Alert>
            )}

            <Tabs value={Math.min(tab, charts.length - 1)} onChange={(_e, v) => setTab(v)} variant="scrollable" aria-label="Growth charts">
              {charts.map((c) => <Tab key={c.key} label={c.label} data-testid={`gc-tab-${c.key}`} />)}
            </Tabs>

            {chart && (
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
                <Paper variant="outlined" sx={{ flex: 1, p: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, px: 1 }}>{chart.title}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>{chart.standard}</Typography>
                  <GrowthChart chart={chart} svgId="gc-svg-live" />
                </Paper>
                <Paper variant="outlined" sx={{ width: { xs: "100%", md: 260 }, p: 1.5 }} data-testid="gc-latest">
                  <Typography variant="caption" color="text.secondary">Latest</Typography>
                  {chart.latest ? (
                    <>
                      <Typography sx={{ fontWeight: 700, fontSize: "1.4rem" }}>{chart.latest.value} {chart.y.unit}</Typography>
                      <Typography>{chart.latest.percentile_label} percentile</Typography>
                      <Typography variant="body2" color="text.secondary">z-score {chart.latest.z}</Typography>
                      <Typography variant="body2" sx={{ mt: 1, fontWeight: 600, color: chart.latest.flag ? FLAG : "inherit" }}>{chart.latest.status_label}</Typography>
                      <Typography variant="caption" color="text.secondary">{fmtDay(chart.latest.date)}</Typography>
                    </>
                  ) : (
                    <Typography variant="body2" sx={{ mt: 0.5 }} data-testid="gc-empty">
                      No {chart.label.toLowerCase()} measurements yet. Enter them in the Vital Signs flowsheet and they appear here.
                    </Typography>
                  )}
                </Paper>
              </Stack>
            )}

            {chart && chart.points.length > 0 && (
              <Table size="small" aria-label="Measurements">
                <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Age</TableCell><TableCell>Value</TableCell><TableCell>Percentile</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                <TableBody>
                  {[...chart.points].reverse().map((p) => (
                    <TableRow key={p.date}>
                      <TableCell>{fmtDay(p.date)}</TableCell><TableCell>{fmtMonths(p.chrono_months)}</TableCell>
                      <TableCell>{p.value} {chart.y.unit}</TableCell><TableCell>{p.percentile_label}</TableCell><TableCell>{p.status_label}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {chart && !body.problem && <Button onClick={() => printChart(chart, body)} data-testid="gc-print">Print this chart</Button>}
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/** The button for the patient header and the Vaccines tab. Shows only for patients under 20 years. */
export default function GrowthChartButton({ patientId, ageMonths, size = "medium" }) {
  const [open, setOpen] = useState(false);
  if (!patientId || !isUnder20(ageMonths)) return null;
  return (
    <>
      <Button variant="outlined" size={size} onClick={() => setOpen(true)} data-testid="growth-chart-button"
        startIcon={<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 17 L2 3 M2 17 L18 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /><path d="M4 14 C7 13 8 9 11 8 C13 7.5 15 5 17 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>}>
        Growth chart
      </Button>
      {open && <GrowthChartModal patientId={patientId} onClose={() => setOpen(false)} />}
    </>
  );
}
