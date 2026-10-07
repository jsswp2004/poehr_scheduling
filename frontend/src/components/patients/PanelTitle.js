import { Typography } from "@mui/material";

/**
 * The one heading style for the chart tabs (Orders, Results, Patient Info, Documents, Flowsheets, ...),
 * so every tab's header has the same type and size, and the same small gap before its content.
 */
export const PANEL_TITLE_SX = { fontSize: "1.125rem", fontWeight: 600, lineHeight: 1.3, mb: 1 };

function PanelTitle({ children, sx, ...rest }) {
  return (
    <Typography component="h2" sx={{ ...PANEL_TITLE_SX, ...sx }} {...rest}>
      {children}
    </Typography>
  );
}

export default PanelTitle;
