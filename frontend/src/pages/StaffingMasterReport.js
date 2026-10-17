import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPrint } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import { DAY_LETTERS, MONTH_NAMES, gridDays } from "../utils/masterSchedule";

/**
 * The Master Schedule as a print-ready page: the same layout and colours as
 * the paper spreadsheet, but only people who are actually on the sheet (no
 * empty rows) and one blank row after every section.
 */
function StaffingMasterReport() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [weekStart, setWeekStart] = useState(3);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const days = useMemo(() => gridDays(year, month, weekStart), [year, month, weekStart]);
  const start = days[0].iso;
  const end = days[days.length - 1].iso;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(apiEndpoints.staffingMasterSchedule, {
          headers: getAuthHeaders(getAccessToken()),
          params: { start, end },
        });
        if (cancelled) return;
        const ws = res.data?.settings?.week_start;
        if (Number.isInteger(ws) && ws !== weekStart) {
          setWeekStart(ws); // the organization's work-week start decides the columns; refetch for them
          return;
        }
        setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || "Could not load the master schedule.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end, weekStart]);

  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2, now.getFullYear() + 3];

  // Name column 15%, HP 3.5%, Status 4.5%; the days share the rest equally so
  // any month (5 or 6 weeks) fits across one landscape page.
  const dayPct = (77 / days.length).toFixed(3);

  return (
    <Box>
      <style>{`
        .master-report-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11px; }
        .master-report-table th, .master-report-table td {
          border: 1px solid #c8c8c8; padding: 0 2px; height: 20px; text-align: center; overflow: hidden;
          white-space: nowrap; -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .master-report-table td.left, .master-report-table th.left { text-align: left; padding-left: 4px; }
        .master-report-table tr.section td { font-weight: 700; }
        .master-report-table tr.spacer td { height: 20px; }
        .master-report-table thead { display: table-header-group; }
        .master-report-table tr { page-break-inside: avoid; }
        .master-report-title { display: none; }
        @media print {
          @page { size: landscape; margin: 0.4in; }
          .master-report-table { font-size: 8pt; }
          .master-report-table th, .master-report-table td { height: 15px; }
          .master-report-table tr.spacer td { height: 15px; }
          .master-report-title { display: block; font-weight: 700; font-size: 11pt; margin-bottom: 4px; }
        }
      `}</style>

      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap className="no-print" sx={{ mb: 1.5 }}>
        <TextField select size="small" label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))} sx={{ minWidth: 150 }}>
          {MONTH_NAMES.map((m, i) => (
            <MenuItem key={m} value={i}>{m}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} sx={{ minWidth: 100 }}>
          {(years.includes(year) ? years : [...years, year].sort()).map((y) => (
            <MenuItem key={y} value={y}>{y}</MenuItem>
          ))}
        </TextField>
        <Button size="small" startIcon={<FontAwesomeIcon icon={faPrint} />} onClick={() => window.print()} disabled={!data || loading}>
          Print
        </Button>
        {loading && <CircularProgress size={20} />}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 1 }} className="no-print">
          {error}
        </Alert>
      )}

      {data && (
        <Box sx={{ overflowX: "auto" }}>
          <div className="master-report-title">
            Master Schedule — {MONTH_NAMES[month]} {year}
          </div>
          <table className="master-report-table">
            <colgroup>
              <col style={{ width: "15%" }} />
              <col style={{ width: "3.5%" }} />
              <col style={{ width: "4.5%" }} />
              {days.map((d) => (
                <col key={d.iso} style={{ width: `${dayPct}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="left" style={{ background: "#f5f5f5" }}>STAFF</th>
                <th style={{ background: "#f5f5f5" }}>HP</th>
                <th style={{ background: "#f5f5f5" }}>Status</th>
                {days.map((d) => (
                  <th key={d.iso} style={{ background: d.color || "#f5f5f5", lineHeight: 1.05 }}>
                    <div>{DAY_LETTERS[d.dow]}</div>
                    <div style={{ fontSize: "0.8em", fontWeight: 400 }}>{d.day}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sections.map((section) => {
                const people = section.rows.filter((r) => r.staff_id);
                return [
                  <tr className="section" key={`s${section.id}`}>
                    <td className="left" colSpan={3} style={{ paddingLeft: section.level ? 14 : 4 }}>
                      {section.name}
                    </td>
                    {days.map((d) => (
                      <td key={d.iso} style={{ background: d.color || undefined }} />
                    ))}
                  </tr>,
                  ...people.map((r) => (
                    <tr key={`r${r.id}`}>
                      <td className="left">{r.staff_name}</td>
                      <td>{r.hp}</td>
                      <td>{r.status}</td>
                      {days.map((d) => (
                        <td key={d.iso} style={{ background: d.color || undefined }}>
                          {data.cells?.[String(r.id)]?.[d.iso] || ""}
                        </td>
                      ))}
                    </tr>
                  )),
                  <tr className="spacer" key={`x${section.id}`}>
                    <td />
                    <td />
                    <td />
                    {days.map((d) => (
                      <td key={d.iso} style={{ background: d.color || undefined }} />
                    ))}
                  </tr>,
                ];
              })}
            </tbody>
          </table>
          <Typography variant="caption" color="text.secondary" className="no-print" sx={{ display: "block", mt: 0.75 }}>
            Prints on one landscape page width. People not yet added to the Master Schedule tab, and blank rows, are left out.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default StaffingMasterReport;
