import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { BuilderShell, BuilderToolbar, BUILDER_STICKY_TOP } from "../components/builders/BuilderShell";
import { apiEndpoints } from "../config/api";
import ReportRelationshipMap from "../components/reports/ReportRelationshipMap";
import { STANDARD_REPORTS, dayTime, errorText, headers, listReports } from "../components/reports/reportUtils";

const TABS = ["all", "std", "mine", "shared", "map", "audit"];
const MODULES = [
  { key: "all", label: "All modules" },
  { key: "staffing", label: "Staffing" },
  { key: "communicator", label: "Communicator" },
  { key: "scheduling", label: "Scheduling" },
  { key: "notes", label: "Notes" },
  { key: "visits", label: "Visits" },
  { key: "orders", label: "Orders" },
  { key: "labs", label: "Labs" },
  { key: "linked", label: "Linked" },
];

export default function ReportsHomePage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [menu, setMenu] = useState(null); // { anchor, report }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newMenu, setNewMenu] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [audit, setAudit] = useState(null); // null until an administrator's request succeeds

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReports(await listReports());
    } catch (err) {
      setError(errorText(err, "Could not load your reports."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(apiEndpoints.staffingCustomReportLinkedCatalog, { headers: headers() })
      .then((res) => !cancelled && setCatalog(res.data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Only administrators can read the audit log; for everyone else the request is refused and the tab stays hidden.
  useEffect(() => {
    let cancelled = false;
    axios
      .get(apiEndpoints.staffingCustomReportAudit, { headers: headers() })
      .then((res) => !cancelled && setAudit(res.data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const std = STANDARD_REPORTS.map((s) => ({
      id: `std-${s.key}`,
      standard: true,
      module: "staffing",
      module_label: "Staffing",
      key: s.key,
      name: s.label,
      note: s.note,
      owner_name: "POWER",
      shared_text: "Everyone",
      last_run_at: null,
    }));
    const custom = reports.map((r) => ({ ...r, standard: false }));
    return [...std, ...custom];
  }, [reports]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      std: rows.filter((r) => r.standard).length,
      mine: rows.filter((r) => !r.standard && r.is_mine).length,
      shared: rows.filter((r) => !r.standard && !r.is_mine).length,
    }),
    [rows]
  );

  const visible = rows.filter((r) => {
    if (moduleFilter !== "all" && r.module !== moduleFilter) return false;
    if (tab === "std" && !r.standard) return false;
    if (tab === "mine" && (r.standard || !r.is_mine)) return false;
    if (tab === "shared" && (r.standard || r.is_mine)) return false;
    return !query || r.name.toLowerCase().includes(query.toLowerCase());
  });

  const run = (r) =>
    r.standard ? navigate(`/staffing?tab=reports&report=${r.key}`) : navigate(`/reports/${r.id}`);

  const duplicate = async (r) => {
    setMenu(null);
    try {
      await axios.post(
        apiEndpoints.staffingCustomReports,
        { name: `${r.name} (copy)`.slice(0, 120), description: r.description || "", source: r.source, config: r.config, audience: "me", audience_roles: [] },
        { headers: headers() }
      );
      load();
    } catch (err) {
      setError(errorText(err, "Could not duplicate the report."));
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await axios.delete(apiEndpoints.staffingCustomReport(confirmDelete.id), { headers: headers() });
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(errorText(err, "Could not delete the report."));
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BuilderShell
      title="Reports"
      subtitle="Run, build and share reports. Staffing, Communicator, Scheduling and Notes reports are available, and linked reports combine them."
      tabs={[
        { key: "all", label: "All", count: counts.all },
        { key: "std", label: "Standard", count: counts.std },
        { key: "mine", label: "My reports", count: counts.mine },
        { key: "shared", label: "Shared with me", count: counts.shared },
        { key: "map", label: "Relationship map" },
        ...(audit ? [{ key: "audit", label: "Audit log", count: audit.length }] : []),
      ]}
      tab={tab}
      onTab={(t) => TABS.includes(t) && setTab(t)}
      maxWidth="100%"
    >
      {tab === "map" ? (
        <ReportRelationshipMap catalog={catalog} />
      ) : tab === "audit" && audit ? (
        <Paper variant="outlined" sx={{ overflowX: { xs: "auto", md: "clip" } }}>
          <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
            Every run or preview of a report on patient data, newest first (last 200). Report contents are not stored here.
          </Typography>
          <Table size="small" aria-label="Report audit log">
            <TableHead>
              <TableRow>
                {["When", "Who", "Report", "Data", "PHI", "Rows", "Dates"].map((h) => (
                  <TableCell key={h} sx={{ position: "sticky", top: BUILDER_STICKY_TOP, zIndex: 2, bgcolor: "background.default", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {audit.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No runs on patient data yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {audit.map((a) => (
                <TableRow key={a.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{dayTime(a.at)}</TableCell>
                  <TableCell>{a.user}</TableCell>
                  <TableCell>{a.report}</TableCell>
                  <TableCell>{a.source_label}</TableCell>
                  <TableCell>
                    <Chip size="small" variant={a.phi_hidden ? "outlined" : "filled"} color={a.phi_hidden ? "default" : "warning"} label={a.phi_hidden ? "Hidden" : "Shown"} />
                  </TableCell>
                  <TableCell>{a.row_count}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{a.range_start ? `${a.range_start} to ${a.range_end}` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : (
      <>
      <BuilderToolbar>
        <TextField
          size="small"
          placeholder="Search reports"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputProps={{ "aria-label": "Search reports" }}
          sx={{ width: 240 }}
        />
        {MODULES.map((m) => (
          <Chip
            key={m.key}
            size="small"
            clickable
            color={moduleFilter === m.key ? "primary" : "default"}
            variant={moduleFilter === m.key ? "filled" : "outlined"}
            label={m.label}
            onClick={() => setModuleFilter(m.key)}
            aria-pressed={moduleFilter === m.key}
          />
        ))}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={(e) => setNewMenu(e.currentTarget)}>
          New report
        </Button>
        <Menu anchorEl={newMenu} open={!!newMenu} onClose={() => setNewMenu(null)}>
          <MenuItem
            onClick={() => {
              setNewMenu(null);
              navigate("/reports/new");
            }}
          >
            From one data source
          </MenuItem>
          <MenuItem
            onClick={() => {
              setNewMenu(null);
              navigate("/reports/canvas/new");
            }}
          >
            Linked report (drag and drop)
          </MenuItem>
        </Menu>
      </BuilderToolbar>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ overflowX: { xs: "auto", md: "clip" } }}>
        <Table size="small" aria-label="Reports">
          <TableHead>
            <TableRow>
              {["Name", "Type", "Module", "Owner", "Shared with", "Last run", ""].map((h) => (
                <TableCell
                  key={h || "actions"}
                  sx={{ position: "sticky", top: BUILDER_STICKY_TOP, zIndex: 2, bgcolor: "background.default", fontWeight: 600, whiteSpace: "nowrap" }}
                >
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7}>
                  <CircularProgress size={18} sx={{ m: 1 }} />
                </TableCell>
              </TableRow>
            )}
            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    {tab === "mine" ? "You have not built a report yet. Choose New report to start one." : "No reports match."}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {visible.map((r) => (
              <TableRow key={r.id} hover sx={{ cursor: "pointer" }} onClick={() => run(r)}>
                <TableCell sx={{ fontWeight: 500 }}>
                  {r.name}
                  {r.description || r.note ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {r.description || r.note}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Chip size="small" variant={r.standard ? "outlined" : "filled"} color={r.standard ? "default" : "primary"} label={r.standard ? "Standard" : "Custom"} />
                </TableCell>
                <TableCell>{r.module_label}</TableCell>
                <TableCell>{r.owner_name || "—"}</TableCell>
                <TableCell>{r.shared_text}</TableCell>
                <TableCell>{r.standard ? "—" : dayTime(r.last_run_at)}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                  <Button size="small" variant="outlined" color="inherit" startIcon={<PlayArrowIcon />} onClick={() => run(r)}>
                    Run
                  </Button>
                  {!r.standard && (
                    <IconButton size="small" aria-label={`More actions for ${r.name}`} onClick={(e) => setMenu({ anchor: e.currentTarget, report: r })}>
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {menu?.report?.can_edit && (
          <MenuItem
            onClick={() => {
              navigate(menu.report.source === "linked" ? `/reports/${menu.report.id}/canvas` : `/reports/${menu.report.id}/edit`);
              setMenu(null);
            }}
          >
            Edit
          </MenuItem>
        )}
        <MenuItem onClick={() => duplicate(menu.report)}>Duplicate</MenuItem>
        {menu?.report?.can_edit && (
          <MenuItem
            sx={{ color: "error.main" }}
            onClick={() => {
              setConfirmDelete(menu.report);
              setMenu(null);
            }}
          >
            Delete
          </MenuItem>
        )}
      </Menu>
      </>
      )}

      <Dialog open={!!confirmDelete} onClose={() => !busy && setConfirmDelete(null)}>
        <DialogTitle>Delete this report?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            “{confirmDelete?.name}” will be removed for everyone it is shared with. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)} disabled={busy}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={remove} disabled={busy}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </BuilderShell>
  );
}
