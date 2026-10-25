import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Button } from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPrint } from "@fortawesome/free-solid-svg-icons";

// The Reports tab provides an element in its frozen title row; a report renders its own controls
// (month, form, shift, print...) into it so they sit on the same line as the report title.
export const ReportActionsSlotContext = createContext(null);

/** Renders `children` into the frozen report title row (inline when there is no slot, e.g. in tests). */
export function ReportActions({ children }) {
  const slot = useContext(ReportActionsSlotContext);
  return slot ? createPortal(children, slot) : children;
}

/** The one Print button used by every report. */
export function ReportPrintButton({ onClick, disabled, children = "Print", ...rest }) {
  return (
    <Button
      color="primary"
      startIcon={<FontAwesomeIcon icon={faPrint} />}
      onClick={onClick}
      disabled={disabled}
      sx={{ minHeight: 44, fontWeight: 600 }}
      {...rest}
    >
      {children}
    </Button>
  );
}
