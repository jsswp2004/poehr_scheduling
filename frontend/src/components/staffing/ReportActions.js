import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faDownload,
  faFileCsv,
  faFilePdf,
  faPrint,
} from "@fortawesome/free-solid-svg-icons";

// The Reports tab provides an element in its frozen title row; a report renders its own controls
// (month, form, shift, print...) into it so they sit on the same line as the report title.
export const ReportActionsSlotContext = createContext(null);

/** Renders `children` into the frozen report title row (inline when there is no slot, e.g. in tests). */
export function ReportActions({ children }) {
  const slot = useContext(ReportActionsSlotContext);
  return slot ? createPortal(children, slot) : children;
}

/** The one Print button used by every report. */
export function ReportPrintButton({ onClick, disabled, iconOnly = false, children = "Print", ...rest }) {
  const button = (
    <Button
      color="primary"
      startIcon={iconOnly ? undefined : <FontAwesomeIcon icon={faPrint} />}
      onClick={onClick}
      disabled={disabled}
      aria-label={iconOnly ? "Print" : undefined}
      sx={{ minHeight: 44, fontWeight: 600, ...(iconOnly ? { minWidth: 40, px: 1 } : {}) }}
      {...rest}
    >
      {iconOnly ? <FontAwesomeIcon icon={faPrint} /> : children}
    </Button>
  );
  return iconOnly ? (
    <Tooltip title="Print">
      <span>{button}</span>
    </Tooltip>
  ) : (
    button
  );
}

// ---------------------------------------------------------------------------
// One Export menu for every report.
//
// The Reports tab draws the Subscribe / Export / Print buttons in its frozen title row. Reports that
// own their data (Master schedule, Daily staffing forms) tell the tab what Export and Print should do
// with useReportExport(); the other reports are handled by the tab itself.
// ---------------------------------------------------------------------------
export const ReportExportContext = createContext(null);

/** Register this report's export + print behaviour with the Reports tab while it is on screen. */
export function useReportExport({ formats, disabled, busy, onExport, onPrint }) {
  const register = useContext(ReportExportContext);
  const latest = useRef({ onExport, onPrint });
  latest.current = { onExport, onPrint };
  const key = `${(formats || []).join(",")}|${!!disabled}|${busy || ""}`;
  useEffect(() => {
    if (!register) return undefined;
    register({
      formats,
      disabled,
      busy,
      onExport: (fmt) => latest.current.onExport(fmt),
      onPrint: () => latest.current.onPrint(),
    });
    return () => register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, key]);
}

const FORMAT_ITEMS = [
  { value: "pdf", icon: faFilePdf, title: "PDF document", hint: "Formatted, ready to print or share" },
  { value: "csv", icon: faFileCsv, title: "CSV spreadsheet", hint: "Raw rows to open in Excel" },
];

/** "Export" button that opens a PDF / CSV menu. `formats` lists what this report can produce. */
export function ReportExportMenu({ formats = ["pdf", "csv"], onExport, disabled, busy, iconOnly = false }) {
  const [anchor, setAnchor] = useState(null);
  const close = () => setAnchor(null);
  return (
    <>
      <Tooltip title={iconOnly ? (busy ? "Preparing..." : "Export") : ""}>
        <span>
          <Button
            variant="outlined"
            color="inherit"
            aria-haspopup="menu"
            aria-label={iconOnly ? "Export" : undefined}
            aria-expanded={anchor ? "true" : undefined}
            startIcon={iconOnly ? undefined : <FontAwesomeIcon icon={faDownload} />}
            endIcon={iconOnly ? undefined : <FontAwesomeIcon icon={faCaretDown} />}
            onClick={(e) => setAnchor(e.currentTarget)}
            disabled={disabled || !!busy}
            sx={{ minHeight: 44, ...(iconOnly ? { minWidth: 40, px: 1 } : {}) }}
          >
            {iconOnly ? <FontAwesomeIcon icon={faDownload} /> : busy ? "Preparing..." : "Export"}
          </Button>
        </span>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close} slotProps={{ paper: { sx: { mt: 0.5, minWidth: 300 } } }}>
        {FORMAT_ITEMS.map((item) => {
          const available = formats.includes(item.value);
          return (
            <MenuItem
              key={item.value}
              disabled={!available}
              onClick={() => {
                close();
                onExport(item.value);
              }}
              sx={{ py: 1.25 }}
            >
              <ListItemIcon>
                <FontAwesomeIcon icon={item.icon} />
              </ListItemIcon>
              <ListItemText
                primary={item.title}
                secondary={available ? item.hint : "Not available for this report"}
                primaryTypographyProps={{ fontWeight: 600 }}
              />
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
