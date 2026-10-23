import React from "react";
import { Box, ButtonBase, Typography } from "@mui/material";

// The numbered step bar at the top of Full Registration. A step shows a check once its key details are
// filled in. It is a tab list, so the keyboard and screen readers treat it like the tabs it replaced.
function RegistrationSteps({ steps, current, filled, onSelect }) {
  return (
    <Box role="tablist" aria-label="Registration steps" sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
      {steps.map((s, i) => {
        const active = s.value === current;
        const done = !!filled[s.value];
        return (
          <ButtonBase
            key={s.value}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(s.value)}
            title={done ? "Key details entered" : undefined}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1,
              py: 0.5,
              borderRadius: 2,
              bgcolor: active ? "#e8efff" : "transparent",
              border: "1px solid",
              borderColor: active ? "#bfd0ff" : "transparent",
              "&:hover": { bgcolor: active ? "#e8efff" : "action.hover" },
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                boxSizing: "border-box",
                color: done || active ? "#fff" : "text.secondary",
                bgcolor: done ? "#16a34a" : active ? "primary.main" : "transparent",
                border: done || active ? "none" : "1px solid #c9d1dd",
              }}
            >
              {done ? "✓" : i + 1}
            </Box>
            <Typography variant="body2" sx={{ fontWeight: active ? 600 : 500, color: active ? "#1e40af" : "text.primary", whiteSpace: "nowrap" }}>
              {s.label}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

export default RegistrationSteps;
