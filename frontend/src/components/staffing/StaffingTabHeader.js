import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Box, Typography } from "@mui/material";

// StaffingPage supplies an element inside its frozen header block; tab titles render into it so every tab's
// title row freezes with the tabs and looks the same. Without a slot (tests, standalone) the header is inline.
export const StaffingHeaderSlotContext = createContext(null);

export const HEADER_SX = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 2,
  pb: 1.5,
};

export default function StaffingTabHeader({ title, count = null, subtitle = null, className, children }) {
  const slot = useContext(StaffingHeaderSlotContext);
  const header = (
    <Box className={className} sx={slot ? HEADER_SX : { ...HEADER_SX, mb: 0.5 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
          {title}
          {count !== null && (
            <Box component="span" sx={{ fontWeight: 400, color: "text.secondary" }}>
              {" "}({count})
            </Box>
          )}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ maxWidth: 620 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
  return slot ? createPortal(header, slot) : header;
}
