import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, GlobalStyles, Grid, Link, Paper, Stack, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PrintIcon from "@mui/icons-material/Print";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import useMe from "../referrals/useMe";
import { RX_ROLES, authHeader, errorText, fmtDateTime, fmtDay } from "../prescriptions/rxShared";
import FishbonePanels from "./Fishbone";
import ProblemFormDialog from "./ProblemFormDialog";
import Sparkline from "./Sparkline";

const PRINT_STYLES = {
  "@media print": {
    "body *": { visibility: "hidden" },
    "#clinical-summary-print, #clinical-summary-print *": { visibility: "visible" },
    "#clinical-summary-print": { position: "absolute", left: 0, top: 0, width: "100%" },
    ".no-print": { display: "none !important" },
  },
};

const SECTION_ERROR = "Could not load this section.";
const num = (v) => (Number.isInteger(v) ? String(v) : Number(v).toFixed(1));

/** One card. `state` is the card's data from the server: if it carries an error, only that is shown. */
function Card({ title, testid, state, link, onLink, action, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, height: "100%" }} data-testid={testid}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography component="h3" sx={{ fontSize: "0.95rem", fontWeight: 600 }}>{title}</Typography>
        <Stack direction="row" spacing={1} alignItems="center" className="no-print">
          {action}
          {link && (
            <Link component="button" type="button" variant="caption" underline="hover" onClick={onLink} data-testid={`${testid}-link`}>
              {link}
            </Link>
          )}
        </Stack>
      </Stack>
      {state && state.error ? (
        <Typography variant="body2" color="error" data-testid={`${testid}-error`}>{SECTION_ERROR}</Typography>
      ) : (
        children
      )}
    </Paper>
  );
}

const Empty = ({ children }) => (
  <Typography variant="body2" color="text.secondary">{children}</Typography>
);

function HeaderStrip({ header }) {
  if (header.error) return <Alert severity="warning" sx={{ mb: 1 }}>{SECTION_ERROR}</Alert>;
  const a = header.allergies;
  const line = [header.age && header.sex ? `${header.age} · ${header.sex}` : header.age || header.sex, header.mrn && `MRN ${header.mrn}`, header.location, header.attending && `Attending ${header.attending}`, header.care_setting]
    .filter(Boolean)
    .join("  |  ");
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }} data-testid="cs-header">
      <Typography sx={{ fontWeight: 700, fontSize: "1.05rem" }}>{header.name}</Typography>
      <Typography variant="body2" color="text.secondary" data-testid="cs-header-line">{line}</Typography>
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.75 }} data-testid="cs-allergies">
        <Typography variant="caption" sx={{ fontWeight: 600 }}>Allergies:</Typography>
        {a.items.length > 0 ? (
          a.items.map((x) => (
            <Chip key={x.substance} size="small" color="error" variant="outlined"
              label={[x.substance, x.reaction, x.severity].filter(Boolean).join(" · ")} />
          ))
        ) : (
          <Chip size="small" variant="outlined" color={a.emphasis === "warn" ? "warning" : "default"} label={a.text} />
        )}
      </Stack>
    </Paper>
  );
}

function ProblemsCard({ data, canEdit, onAdd, onEdit, patient }) {
  const [resolved, setResolved] = useState(null); // null = hidden, [] = loaded
  const [loadingResolved, setLoadingResolved] = useState(false);

  const toggleResolved = async () => {
    if (resolved) return setResolved(null);
    setLoadingResolved(true);
    try {
      const res = await api.get(apiEndpoints.problemList, { headers: await authHeader(), params: { patient: patient.id, show: "resolved" } });
      setResolved(res.data?.results || []);
    } catch (err) {
      setResolved([]);
    } finally {
      setLoadingResolved(false);
    }
  };

  return (
    <Card
      title="Problems" testid="cs-problems" state={data}
      action={canEdit && <Button size="small" startIcon={<AddIcon />} onClick={() => onAdd(null)} data-testid="problem-add">Add</Button>}
    >
      {data.items && data.items.length === 0 && <Empty>No problems on the list.</Empty>}
      <Stack spacing={0.5}>
        {(data.items || []).map((p) => (
          <Box key={p.id} sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }} data-testid={`problem-${p.id}`}>
            <Chip size="small" label={p.status_label} color={p.status === "chronic" ? "default" : "primary"} variant="outlined" sx={{ height: 20 }} />
            <Link component="button" type="button" underline="hover" color="inherit" sx={{ textAlign: "left", fontSize: "0.875rem" }} disabled={!canEdit} onClick={() => canEdit && onEdit(p)}>
              {p.description}
            </Link>
            {p.code && <Typography variant="caption" color="text.secondary">{p.code}</Typography>}
            {p.onset_date && <Typography variant="caption" color="text.secondary">since {fmtDay(p.onset_date)}</Typography>}
          </Box>
        ))}
      </Stack>
      {data.history_text && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: "italic" }} data-testid="cs-history">
          History on file: {data.history_text}
        </Typography>
      )}
      {data.other_sources && data.other_sources.length > 0 && (
        <Box sx={{ mt: 1 }} data-testid="cs-other-dx">
          <Typography variant="caption" color="text.secondary">Seen elsewhere in the chart, not on the list:</Typography>
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.25 }}>
            {data.other_sources.map((o) => (
              <Tooltip key={o.code} title={`${o.description || o.code} — ${o.source}`}>
                <Chip
                  size="small" variant="outlined" label={`${o.code} · ${o.source}`}
                  onClick={canEdit ? () => onAdd({ code: o.code, description: o.description }) : undefined}
                  data-testid={`other-dx-${o.code}`}
                />
              </Tooltip>
            ))}
          </Stack>
        </Box>
      )}
      {data.resolved_count > 0 && (
        <Box className="no-print" sx={{ mt: 0.75 }}>
          <Link component="button" type="button" variant="caption" underline="hover" onClick={toggleResolved} data-testid="problem-resolved-toggle">
            {resolved ? "Hide resolved" : `Show resolved (${data.resolved_count})`}
          </Link>
          {loadingResolved && <CircularProgress size={12} sx={{ ml: 1 }} />}
          {resolved && resolved.map((p) => (
            <Typography key={p.id} variant="body2" color="text.secondary" data-testid={`resolved-${p.id}`}>
              {p.description}{p.code ? ` (${p.code})` : ""}{p.resolved_date ? ` · resolved ${fmtDay(p.resolved_date)}` : ""}
            </Typography>
          ))}
        </Box>
      )}
    </Card>
  );
}

function MedicationsCard({ data, onOpen }) {
  return (
    <Card title="Medications" testid="cs-meds" state={data} link="Open Prescriptions" onLink={() => onOpen("prescriptions")}>
      {data.needs_reconciliation && (
        <Chip size="small" color="warning" icon={<WarningAmberIcon />} label="Home medications not reconciled" sx={{ mb: 0.75 }} data-testid="cs-reconcile" />
      )}
      {data.renewals_due > 0 && (
        <Chip size="small" color="warning" variant="outlined" label={`${data.renewals_due} due for renewal`} sx={{ mb: 0.75, ml: data.needs_reconciliation ? 0.75 : 0 }} data-testid="cs-renewals" />
      )}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 600 }}>
        At home ({data.home_count})
      </Typography>
      {data.home && data.home.length === 0 && <Empty>None recorded.</Empty>}
      {(data.home || []).map((m) => (
        <Typography key={m.id} variant="body2" component="div" data-testid={`home-med-${m.id}`}>
          {m.drug_name}{m.strength ? ` ${m.strength}` : ""} <Typography component="span" variant="caption" color="text.secondary">{m.sig}</Typography>
          {m.allergy_alerts > 0 && <Chip size="small" color="error" label="Allergy alert" sx={{ ml: 0.75, height: 18 }} data-testid={`home-med-alert-${m.id}`} />}
        </Typography>
      ))}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 600, mt: 0.75 }}>
        Prescribed ({data.prescription_count})
      </Typography>
      {data.prescriptions && data.prescriptions.length === 0 && <Empty>No active prescriptions.</Empty>}
      {(data.prescriptions || []).map((rx) => (
        <Typography key={rx.id} variant="body2" component="div" data-testid={`cs-rx-${rx.id}`}>
          {rx.drug_name}{rx.strength ? ` ${rx.strength}` : ""} <Typography component="span" variant="caption" color="text.secondary">{rx.sig}</Typography>
          {rx.renewal_due && <Chip size="small" color="warning" label="Renewal due" sx={{ ml: 0.75, height: 18 }} />}
        </Typography>
      ))}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
        {data.last_review ? `Last reconciled ${fmtDateTime(data.last_review.at)}${data.last_review.by ? ` by ${data.last_review.by}` : ""}` : "Never reconciled"}
        {data.drafts > 0 ? ` · ${data.drafts} draft prescription${data.drafts === 1 ? "" : "s"}` : ""}
      </Typography>
    </Card>
  );
}

function ResultsCard({ data, onOpen }) {
  if (data.hidden) {
    return <Card title="Results" testid="cs-results"><Empty>You don't have access to lab results.</Empty></Card>;
  }
  return (
    <Card title="Results" testid="cs-results" state={data} link="Open Results" onLink={() => onOpen("results")}>
      {data.unreviewed > 0 && (
        <Chip size="small" color="warning" label={`${data.unreviewed} not yet reviewed`} sx={{ mb: 1 }} data-testid="cs-unreviewed" />
      )}
      {data.fishbone && data.fishbone.length > 0 ? (
        <Box sx={{ mb: 1 }}><FishbonePanels panels={data.fishbone} /></Box>
      ) : (
        <Empty>No BMP, CBC or other key lab values yet.</Empty>
      )}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 600, mt: 0.5 }}>Recent reports</Typography>
      {data.recent && data.recent.length === 0 && <Empty>No lab reports.</Empty>}
      {(data.recent || []).map((r) => (
        <Stack key={r.id} direction="row" spacing={0.75} alignItems="center" data-testid={`cs-report-${r.id}`}>
          <Typography variant="body2">{r.title}</Typography>
          <Typography variant="caption" color="text.secondary">{fmtDateTime(r.at)}</Typography>
          {r.critical > 0 && <Chip size="small" color="error" label={`${r.critical} critical`} sx={{ height: 18 }} />}
          {r.critical === 0 && r.abnormal > 0 && <Chip size="small" color="warning" variant="outlined" label={`${r.abnormal} abnormal`} sx={{ height: 18 }} />}
          {r.review_status === "unreviewed" && <Chip size="small" variant="outlined" label="Not reviewed" sx={{ height: 18 }} />}
        </Stack>
      ))}
    </Card>
  );
}

const VITAL_TILES = [
  { key: "bp", label: "BP", series: "sbp" },
  { key: "hr", label: "HR", series: "hr" },
  { key: "rr", label: "RR", series: "rr" },
  { key: "spo2", label: "SpO₂", series: "spo2" },
  { key: "temp", label: "Temp", series: "temp" },
  { key: "weight", label: "Weight", series: "weight" },
  { key: "pain", label: "Pain", series: "pain" },
];

function VitalsCard({ data, onOpen }) {
  const latest = data.latest || {};
  const tiles = VITAL_TILES.filter((t) => (t.key === "bp" ? latest.sbp && latest.dbp : latest[t.key]));
  return (
    <Card title="Vitals" testid="cs-vitals" state={data} link="Open Flowsheets" onLink={() => onOpen("flowsheets")}>
      {tiles.length === 0 && <Empty>No vital signs recorded.</Empty>}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {tiles.map((t) => {
          const v = t.key === "bp" ? latest.sbp : latest[t.key];
          const text = t.key === "bp" ? `${num(latest.sbp.value)}/${num(latest.dbp.value)}` : num(v.value);
          return (
            <Tooltip key={t.key} title={`${t.label} ${text} ${v.unit} — ${fmtDateTime(v.at)}`}>
              <Box sx={{ minWidth: 92, p: 0.75, border: 1, borderColor: "divider", borderRadius: 1 }} data-testid={`vital-${t.key}`}>
                <Typography variant="caption" color="text.secondary" component="div">{t.label}</Typography>
                <Typography sx={{ fontWeight: 600, lineHeight: 1.2 }}>{text} <Typography component="span" variant="caption" color="text.secondary">{v.unit}</Typography></Typography>
                <Sparkline points={(data.series || {})[t.series]} label={`${t.label} trend`} />
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
      {tiles.length > 0 && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }} data-testid="cs-vitals-when">
          Last taken {fmtDateTime(Object.values(latest).map((x) => x.at).sort().pop())}
        </Typography>
      )}
    </Card>
  );
}

function OrdersTasksCard({ orders, tasks, onOpen }) {
  // checked before any of the lists below is touched: a failed card carries only an error marker
  if ((orders && orders.error) || (tasks && tasks.error)) {
    return <Card title="Orders and tasks" testid="cs-orders" state={{ error: true }} />;
  }
  return (
    <Card title="Orders and tasks" testid="cs-orders">
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          Open orders{orders ? ` (${orders.count})` : ""}
        </Typography>
        <Link className="no-print" component="button" type="button" variant="caption" underline="hover" onClick={() => onOpen("orders")}>Open Orders</Link>
      </Stack>
      {orders === null && <Empty>You don't have access to orders.</Empty>}
      {orders && orders.items.length === 0 && <Empty>No open orders.</Empty>}
      {orders && orders.awaiting_cosign > 0 && <Chip size="small" color="warning" label={`${orders.awaiting_cosign} awaiting cosign`} sx={{ mb: 0.5 }} data-testid="cs-cosign" />}
      {orders && orders.items.map((o) => (
        <Typography key={o.id} variant="body2" data-testid={`cs-order-${o.id}`}>
          {o.name} <Typography component="span" variant="caption" color="text.secondary">{o.status_label}{o.priority && o.priority !== "routine" ? ` · ${o.priority}` : ""}</Typography>
        </Typography>
      ))}
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mt: 0.75 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          Tasks to do{tasks ? ` (${tasks.count})` : ""}
        </Typography>
        <Link className="no-print" component="button" type="button" variant="caption" underline="hover" onClick={() => onOpen("task_list")}>Open Task List</Link>
      </Stack>
      {tasks && tasks.overdue > 0 && <Chip size="small" color="error" label={`${tasks.overdue} overdue`} sx={{ mb: 0.5 }} data-testid="cs-overdue" />}
      {tasks && tasks.items.length === 0 && <Empty>Nothing to do.</Empty>}
      {tasks && tasks.items.map((t) => (
        <Typography key={t.id} variant="body2" color={t.overdue ? "error" : "text.primary"} data-testid={`cs-task-${t.id}`}>
          {t.title} <Typography component="span" variant="caption" color="text.secondary">{t.prn ? "as needed" : fmtDateTime(t.due_at)}</Typography>
        </Typography>
      ))}
    </Card>
  );
}

function NotesReferralsCard({ data, onOpen }) {
  return (
    <Card title="Notes and referrals" testid="cs-notes" state={data} link="Open Documents" onLink={() => onOpen("documents")}>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 600 }}>Recent notes</Typography>
      {data.notes && data.notes.length === 0 && <Empty>No notes.</Empty>}
      {(data.notes || []).map((n) => (
        <Typography key={n.id} variant="body2" data-testid={`cs-note-${n.id}`}>
          {n.type} <Typography component="span" variant="caption" color="text.secondary">{n.status === "draft" ? "draft" : "signed"} · {n.author} · {fmtDateTime(n.at)}</Typography>
        </Typography>
      ))}
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mt: 0.75 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Open referrals</Typography>
        <Link className="no-print" component="button" type="button" variant="caption" underline="hover" onClick={() => onOpen("referral_list")}>Open Referral List</Link>
      </Stack>
      {data.referrals && data.referrals.length === 0 && <Empty>No open referrals.</Empty>}
      {(data.referrals || []).map((r) => (
        <Typography key={r.id} variant="body2" data-testid={`cs-referral-${r.id}`}>
          {r.specialty || "Referral"} <Typography component="span" variant="caption" color="text.secondary">{r.status_label}{r.urgency !== "routine" ? ` · ${r.urgency}` : ""}</Typography>
        </Typography>
      ))}
    </Card>
  );
}

function UpcomingCard({ data }) {
  return (
    <Card title="Upcoming appointments" testid="cs-upcoming" state={data}>
      {data.items && data.items.length === 0 && <Empty>None scheduled.</Empty>}
      {(data.items || []).map((a) => (
        <Typography key={a.id} variant="body2" data-testid={`cs-appt-${a.id}`}>
          {a.title} <Typography component="span" variant="caption" color="text.secondary">{fmtDateTime(a.at)}{a.provider ? ` · ${a.provider}` : ""}{a.status === "pending" ? " · request pending" : ""}</Typography>
        </Typography>
      ))}
    </Card>
  );
}

/**
 * The Clinical Summary chart tab: one read-only page with the facts a clinician wants at a glance -- problems,
 * medications, the BMP and CBC as fishbone diagrams, vitals with trends, open orders and tasks, notes, referrals
 * and upcoming visits. Every card links to the tab where it is worked on; only the problem list is edited here.
 */
export default function ClinicalSummary({ patient, onOpenTab }) {
  const me = useMe();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [problemForm, setProblemForm] = useState(null); // { problem, defaults } when open
  const canEdit = RX_ROLES.includes(me.role);
  const open = (tab) => onOpenTab && onOpenTab(tab);

  const load = useCallback(async () => {
    if (!patient?.id) return;
    setLoading(true);
    try {
      const res = await api.get(apiEndpoints.clinicalSummary, { headers: await authHeader(), params: { patient: patient.id } });
      setData(res.data);
      setError("");
    } catch (err) {
      setError(errorText(err, "Could not load the clinical summary."));
    } finally {
      setLoading(false);
    }
  }, [patient]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Box sx={{ p: 2 }} data-testid="clinical-summary">
      <GlobalStyles styles={PRINT_STYLES} />
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }} className="no-print">
        <Typography variant="h6">Clinical Summary</Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<RefreshIcon />} onClick={load} disabled={loading} data-testid="cs-refresh">Refresh</Button>
          <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!data} data-testid="cs-print">Print</Button>
        </Stack>
      </Stack>
      {error && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>Try again</Button>} sx={{ mb: 1 }} data-testid="cs-load-error">{error}</Alert>
      )}
      {loading && !data && <Box sx={{ p: 3, textAlign: "center" }}><CircularProgress size={28} /></Box>}
      {data && (
        <Box id="clinical-summary-print" data-testid="cs-body">
          <Typography className="print-only" variant="caption" color="text.secondary" component="div" sx={{ display: "none", "@media print": { display: "block" }, mb: 0.5 }}>
            Clinical summary printed {new Date().toLocaleString()}
          </Typography>
          <HeaderStrip header={data.header} />
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 6 }}>
              <ProblemsCard data={data.problems} canEdit={canEdit} patient={patient}
                onAdd={(defaults) => setProblemForm({ problem: null, defaults })} onEdit={(problem) => setProblemForm({ problem, defaults: null })} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}><MedicationsCard data={data.medications} onOpen={open} /></Grid>
            <Grid size={12}><ResultsCard data={data.results} onOpen={open} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><VitalsCard data={data.vitals} onOpen={open} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><OrdersTasksCard orders={data.orders} tasks={data.tasks} onOpen={open} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><NotesReferralsCard data={data.notes_referrals} onOpen={open} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><UpcomingCard data={data.upcoming} /></Grid>
          </Grid>
        </Box>
      )}
      <ProblemFormDialog
        open={!!problemForm}
        patient={patient}
        problem={problemForm?.problem || null}
        defaults={problemForm?.defaults || null}
        onClose={() => setProblemForm(null)}
        onSaved={() => {
          setProblemForm(null);
          load();
        }}
      />
    </Box>
  );
}
