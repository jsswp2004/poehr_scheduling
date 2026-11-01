import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  FormControlLabel,
  IconButton,
  InputBase,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { findSettings } from "./settingsIndex";
import { storedCareSetting } from "../patients/CareSettingSidebar";
import {
  CARE_LABELS,
  avatarColor,
  dobText,
  flattenRows,
  initials,
  loadRecent,
  logOpened,
  rememberRecent,
  searchRequest,
  shortDate,
  targetFor,
} from "./searchHelpers";

const DEBOUNCE_MS = 220;
const BADGE_COLOR = { "In house": "success", "In ED": "warning", Outpatient: "default", Discharged: "default" };
const KIND_LABEL = { mrn: "Medical record number", vn: "Visit number", dob: "Date of birth", phone: "Phone number" };

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Yellow marks on the part of the text that matched what was typed.
function Mark({ text, query }) {
  const words = (query || "").split(/[\s,;]+/).filter(Boolean);
  if (!text || !words.length) return <>{text}</>;
  const parts = String(text).split(new RegExp(`(${words.map(escapeRe).join("|")})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Box key={i} component="mark" sx={{ bgcolor: "#fef08a", color: "inherit", borderRadius: "3px", px: "1px" }}>
            {part}
          </Box>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

function Heading({ children }) {
  return (
    <Typography variant="caption" sx={{ display: "block", px: 1.5, pt: 1.25, pb: 0.5, fontWeight: 700, letterSpacing: "0.06em", color: "text.secondary" }}>
      {children}
    </Typography>
  );
}

function PatientRow({ row, query, active, onOpen, onHover, domId }) {
  const v = row.visit;
  const line1 = [row.age && row.sex ? `${row.age} ${row.sex}` : row.age || row.sex, row.dob ? `DOB ${dobText(row.dob)}` : ""].filter(Boolean).join(" · ");
  const line2 = [row.mrn, v && v.care_setting_label, v && v.location, v && v.provider].filter(Boolean).join(" · ");
  return (
    <Box
      id={domId}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={() => onOpen(row, "chart")}
      data-testid={`search-row-${row.rowKey}`}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.5,
        py: 1,
        minHeight: 56,
        borderRadius: 2,
        cursor: "pointer",
        border: 1,
        borderColor: active ? "primary.light" : "transparent",
        bgcolor: active ? "action.selected" : "transparent",
      }}
    >
      <Avatar sx={{ width: 40, height: 40, bgcolor: avatarColor(row.user_id), fontSize: 15, fontWeight: 600 }}>{initials(row.full_name)}</Avatar>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body1" noWrap sx={{ fontWeight: 600 }}>
          <Mark text={row.full_name} query={query} />
          {line1 && (
            <Typography component="span" variant="body2" color="text.secondary" sx={{ fontWeight: 400 }}>
              {" · "}
              {line1}
            </Typography>
          )}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          <Mark text={line2} query={query} />
        </Typography>
      </Box>
      {row.badge && <Chip size="small" label={row.badge} color={BADGE_COLOR[row.badge] || "default"} variant={row.badge === "Discharged" ? "outlined" : "filled"} />}
      {active && (
        <Stack direction="row" spacing={0.75} sx={{ display: { xs: "none", sm: "flex" } }}>
          <Button size="small" variant="contained" onClick={(e) => { e.stopPropagation(); onOpen(row, "chart"); }}>
            Open chart
          </Button>
          <Button size="small" variant="outlined" onClick={(e) => { e.stopPropagation(); onOpen(row, "orders"); }}>
            Orders
          </Button>
          <Button size="small" variant="outlined" onClick={(e) => { e.stopPropagation(); onOpen(row, "results"); }}>
            Results
          </Button>
        </Stack>
      )}
    </Box>
  );
}

function VisitRow({ row, query, active, onOpen, onHover, domId }) {
  const line2 = [row.admission_type || row.care_setting_label, row.location, row.admit ? shortDate(row.admit) : ""].filter(Boolean).join(" · ");
  return (
    <Box
      id={domId}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={() => onOpen(row, "chart")}
      data-testid={`search-row-${row.rowKey}`}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.5,
        py: 1,
        minHeight: 56,
        borderRadius: 2,
        cursor: "pointer",
        border: 1,
        borderColor: active ? "primary.light" : "transparent",
        bgcolor: active ? "action.selected" : "transparent",
      }}
    >
      <Avatar variant="rounded" sx={{ width: 40, height: 40, bgcolor: "#e0e7ff", color: "#3730a3" }}>
        <DescriptionOutlinedIcon fontSize="small" />
      </Avatar>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body1" noWrap sx={{ fontWeight: 600 }}>
          <Mark text={row.visit_number} query={query} />
          <Typography component="span" variant="body2" color="text.secondary" sx={{ fontWeight: 400 }}>
            {" · "}
            <Mark text={row.full_name} query={query} />
          </Typography>
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {line2}
        </Typography>
      </Box>
      <Chip size="small" label={row.is_open ? "Open" : "Closed"} color={row.is_open ? "success" : "default"} variant={row.is_open ? "filled" : "outlined"} />
      {active && (
        <Button size="small" variant="contained" sx={{ display: { xs: "none", sm: "inline-flex" } }} onClick={(e) => { e.stopPropagation(); onOpen(row, "chart"); }}>
          {row.is_current ? "Open chart" : "Open visit"}
        </Button>
      )}
    </Box>
  );
}

function SettingRow({ row, query, active, onOpen, onHover, domId }) {
  const tool = row.group === "tool";
  return (
    <Box
      id={domId}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={() => onOpen(row)}
      data-testid={`search-row-${row.rowKey}`}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.5,
        py: 1,
        minHeight: 56,
        borderRadius: 2,
        cursor: "pointer",
        border: 1,
        borderColor: active ? "primary.light" : "transparent",
        bgcolor: active ? "action.selected" : "transparent",
      }}
    >
      <Avatar variant="rounded" sx={{ width: 40, height: 40, bgcolor: tool ? "#e8efff" : "#eceafe", color: tool ? "#1d4ed8" : "#4338ca" }}>
        <SettingsOutlinedIcon fontSize="small" />
      </Avatar>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body1" noWrap sx={{ fontWeight: 600 }}>
          <Mark text={row.label} query={query} />
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {row.where} · <Mark text={row.description} query={query} />
        </Typography>
      </Box>
      {active && (
        <Button size="small" variant="contained" sx={{ display: { xs: "none", sm: "inline-flex" } }} onClick={(e) => { e.stopPropagation(); onOpen(row); }}>
          Go
        </Button>
      )}
    </Box>
  );
}

export default function GlobalSearch({ userId, role = "", canRegister = false }) {
  const navigate = useNavigate();
  const fullScreen = useMediaQuery("(max-width:600px)");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState("all");
  const [careOnly, setCareOnly] = useState(false);
  const [data, setData] = useState(null);
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const care = storedCareSetting();
  const careValue = careOnly && CARE_LABELS[care] ? care : "";
  const recent = useMemo(() => (open ? loadRecent(userId) : []), [open, userId]);
  const term = query.trim();
  const seq = useRef(0);

  const close = useCallback(() => setOpen(false), []);

  // Ctrl+K / Cmd+K opens the search from any page.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setChip("all");
      setData(null);
      setActive(0);
    }
  }, [open]);

  // Look up as the person types.
  useEffect(() => {
    if (!open) return undefined;
    const mineOnly = !term;
    const controller = new AbortController();
    const mark = ++seq.current;
    const timer = setTimeout(
      async () => {
        setLoading(true);
        setFailed(false);
        try {
          const result = await searchRequest(term, careValue, controller.signal);
          if (mark !== seq.current) return;
          if (mineOnly) setMine(result);
          else setData(result);
          setActive(0);
        } catch (err) {
          if (mark === seq.current && !controller.signal.aborted && err.name !== "CanceledError") setFailed(true);
        } finally {
          if (mark === seq.current) setLoading(false);
        }
      },
      mineOnly ? 0 : DEBOUNCE_MS
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, term, careValue]);

  const showing = term ? data : null;
  // Settings and Management Portal tools (administrators only), worked out here from the typed words.
  const settingRows = useMemo(() => (term ? findSettings(term, role) : []), [term, role]);
  const rows = useMemo(() => {
    if (term) {
      if (chip === "settings") return settingRows;
      return [...(chip === "all" ? settingRows : []), ...flattenRows(showing, chip)];
    }
    const list = [];
    recent.forEach((r) => list.push({ ...r, rowKey: `r${r.user_id}` }));
    ((mine && mine.patients) || []).forEach((p) => {
      if (!list.some((r) => String(r.user_id) === String(p.user_id))) list.push({ ...p, rowKey: `m${p.user_id}` });
    });
    return list;
  }, [term, showing, chip, recent, mine, settingRows]);

  useEffect(() => {
    if (active >= rows.length) setActive(0);
  }, [rows.length, active]);

  const openRow = useCallback(
    (row, action) => {
      if (row.type === "setting") {
        close();
        navigate(row.path);
        return;
      }
      const target = targetFor(row, action);
      logOpened(target, term, action);
      rememberRecent(userId, row);
      close();
      navigate("/patients", { state: { searchOpen: target } });
    },
    [term, userId, close, navigate]
  );

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (e.key === "Enter" && rows[active]) {
      e.preventDefault();
      openRow(rows[active], "chart");
    }
  };

  const patientsCount = (showing && showing.patients.length) || 0;
  const visitsCount = (showing && showing.visits.length) || 0;
  const chips = [
    ["all", "All", null],
    ["patients", "Patients", patientsCount],
    ["visits", "Visits", visitsCount],
    ["mrn", "MRN", null],
    ...(settingRows.length ? [["settings", "Settings", settingRows.length]] : []),
  ];
  const noMatch = !!term && showing && !loading && !patientsCount && !visitsCount && !settingRows.length;
  const kindLabel = showing && KIND_LABEL[showing.kind];

  const renderRow = (row, i) => {
    const props = {
      row,
      query: term,
      active: i === active,
      onOpen: openRow,
      onHover: () => setActive(i),
      domId: `search-opt-${i}`,
    };
    if (row.type === "setting") return <SettingRow key={row.rowKey} {...props} />;
    return row.type === "visit" ? <VisitRow key={row.rowKey} {...props} /> : <PatientRow key={row.rowKey} {...props} />;
  };

  // rows are already in the order they are drawn (patients, visits, close spellings), so the keyboard follows it
  const drawRow = (row) => renderRow(row, rows.indexOf(row));
  const settingsOnly = rows.filter((r) => r.type === "setting" && r.group === "setting");
  const toolRows = rows.filter((r) => r.type === "setting" && r.group === "tool");
  const patientRows = rows.filter((r) => r.type !== "visit" && r.type !== "setting" && !String(r.rowKey).startsWith("s") && !String(r.rowKey).match(/^[rm]/));
  const visitRows = rows.filter((r) => r.type === "visit");
  const similarRows = rows.filter((r) => String(r.rowKey).startsWith("s"));
  const recentRows = !term ? rows.filter((r) => String(r.rowKey).startsWith("r")) : [];
  const mineRows = !term ? rows.filter((r) => String(r.rowKey).startsWith("m")) : [];

  return (
    <>
      <Tooltip title="Search patients, MRNs and visits (Ctrl+K)">
        <IconButton color="inherit" onClick={() => setOpen(true)} aria-label="Search" aria-haspopup="dialog" sx={{ mr: 0.5 }} data-testid="global-search-open">
          <SearchIcon sx={{ color: "white" }} />
        </IconButton>
      </Tooltip>
      <Dialog
        open={open}
        onClose={close}
        fullScreen={fullScreen}
        fullWidth
        maxWidth="sm"
        aria-label="Search"
        PaperProps={{ sx: { width: { sm: 720 }, maxWidth: { sm: 720 }, alignSelf: { sm: "flex-start" }, mt: { sm: "84px" }, borderRadius: { sm: 3 }, overflow: "hidden" } }}
        sx={{ zIndex: 1300 }}
        data-testid="global-search"
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
          <SearchIcon color="action" />
          <InputBase
            autoFocus
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search a name, MRN, visit number, date of birth or phone"
            inputProps={{ "aria-label": "Search patients, MRNs and visits", role: "combobox", "aria-expanded": true, "aria-controls": "search-list", "aria-activedescendant": rows.length ? `search-opt-${active}` : undefined, autoComplete: "off", spellCheck: false }}
            sx={{ fontSize: 20, minHeight: 44 }}
            data-testid="global-search-input"
          />
          {loading && <CircularProgress size={18} />}
          <Chip size="small" variant="outlined" label="Esc" onClick={close} sx={{ cursor: "pointer" }} />
        </Box>

        {term && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ px: 2, py: 1, bgcolor: "action.hover", borderBottom: 1, borderColor: "divider" }}>
            {chips.map(([key, label, count]) => (
              <Chip
                key={key}
                size="small"
                color={chip === key ? "primary" : "default"}
                variant={chip === key ? "filled" : "outlined"}
                label={count == null ? label : `${label} ${count}`}
                onClick={() => {
                  setChip(key);
                  setActive(0);
                }}
                data-testid={`search-chip-${key}`}
              />
            ))}
            <Box sx={{ flexGrow: 1 }} />
            {CARE_LABELS[care] && (
              <FormControlLabel
                sx={{ mr: 0 }}
                control={<Checkbox size="small" checked={careOnly} onChange={(e) => setCareOnly(e.target.checked)} />}
                label={<Typography variant="body2">This care setting only ({CARE_LABELS[care]})</Typography>}
              />
            )}
          </Stack>
        )}

        <Box id="search-list" role="listbox" aria-label="Results" sx={{ p: 1, maxHeight: { sm: "60vh" }, overflowY: "auto", flexGrow: 1, minHeight: 120 }}>
          {failed && (
            <Typography color="error" sx={{ p: 2 }}>
              The search could not be reached. Try again in a moment.
            </Typography>
          )}

          {!term && (
            <>
              {recentRows.length > 0 && (
                <Box>
                  <Heading>RECENT</Heading>
                  {recentRows.map(drawRow)}
                </Box>
              )}
              {mineRows.length > 0 && (
                <Box>
                  <Heading>MY PATIENTS IN HOUSE</Heading>
                  {mineRows.map(drawRow)}
                </Box>
              )}
              {!recentRows.length && !mineRows.length && !loading && (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  Type a name, an MRN such as MRN-000142, a visit number such as VN-000231, a date of birth or a phone number.
                </Typography>
              )}
            </>
          )}

          {term && !noMatch && !failed && (
            <>
              {kindLabel && (
                <Typography variant="caption" sx={{ display: "block", px: 1.5, pt: 0.5, color: "text.secondary" }}>
                  Searching by {kindLabel.toLowerCase()}
                </Typography>
              )}
              {settingsOnly.length > 0 && (
                <Box>
                  <Heading>SETTINGS</Heading>
                  {settingsOnly.map(drawRow)}
                </Box>
              )}
              {toolRows.length > 0 && (
                <Box>
                  <Heading>TOOLS</Heading>
                  {toolRows.map(drawRow)}
                </Box>
              )}
              {chip !== "visits" && chip !== "settings" && patientRows.length > 0 && (
                <Box>
                  <Heading>PATIENTS</Heading>
                  {patientRows.map(drawRow)}
                </Box>
              )}
              {chip !== "patients" && chip !== "mrn" && chip !== "settings" && visitRows.length > 0 && (
                <Box>
                  <Heading>VISITS</Heading>
                  {visitRows.map(drawRow)}
                </Box>
              )}
              {!patientRows.length && !visitRows.length && !settingRows.length && !loading && (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  Nothing under this filter.
                </Typography>
              )}
            </>
          )}

          {noMatch && (
            <Box sx={{ p: 1.5 }}>
              <Typography sx={{ fontWeight: 600 }}>No one matches “{term}”</Typography>
              {similarRows.length > 0 && (
                <>
                  <Heading>DID YOU MEAN</Heading>
                  {similarRows.map(drawRow)}
                </>
              )}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                You can also search by date of birth (03/14/1972), a phone number or the last four digits of a phone.
              </Typography>
              {canRegister && (
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ mt: 1.5 }}
                  onClick={() => {
                    close();
                    navigate("/patients?tab=register");
                  }}
                >
                  Register a new patient
                </Button>
              )}
            </Box>
          )}
        </Box>

        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap sx={{ px: 2, py: 1, borderTop: 1, borderColor: "divider", bgcolor: "action.hover" }}>
          <Typography variant="caption" color="text.secondary"><b>↑ ↓</b> move</Typography>
          <Typography variant="caption" color="text.secondary"><b>Enter</b> open</Typography>
          <Typography variant="caption" color="text.secondary"><b>Tab</b> quick actions</Typography>
          <Typography variant="caption" color="text.secondary"><b>Esc</b> close</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="caption" color="text.secondary">Only your clinic’s patients</Typography>
        </Stack>
      </Dialog>
    </>
  );
}
