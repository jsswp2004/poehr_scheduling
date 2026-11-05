import React from "react";
import { Box, Tab, Tabs } from "@mui/material";

// The step tabs at the top of Full Registration, styled like the page's own tabs. A step shows a green check once
// its key details are filled in, and "review" when it has not been opened yet. Wide lists scroll sideways.
function RegistrationSteps({ steps, current, filled, onSelect, needsReview = {} }) {
  const value = steps.some((s) => s.value === current) ? current : false;
  return (
    <Tabs
      value={value}
      onChange={(e, v) => onSelect(v)}
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      aria-label="Registration steps"
      sx={{ mb: 1, flexShrink: 0, minHeight: 36, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 36, textTransform: "none", px: 1.5, py: 0.5 } }}
    >
      {steps.map((s) => {
        const done = !!filled[s.value];
        const review = needsReview[s.value] && s.value !== current;
        return (
          <Tab
            key={s.value}
            value={s.value}
            title={done ? "Key details entered" : undefined}
            label={
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                {done && (
                  <Box component="span" aria-hidden="true" sx={{ color: "#16a34a", fontWeight: 700, fontSize: 14, lineHeight: 1 }}>
                    {"\u2713"}
                  </Box>
                )}
                {s.label}
                {review && (
                  <Box component="span" sx={{ color: "warning.main", fontSize: 11 }} data-testid={`needs-review-${s.value}`}>
                    review
                  </Box>
                )}
              </Box>
            }
          />
        );
      })}
    </Tabs>
  );
}

export default RegistrationSteps;
