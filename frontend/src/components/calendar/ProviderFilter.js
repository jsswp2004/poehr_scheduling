import React, { useState } from "react";
import { Box, Button, Checkbox, Menu, MenuItem, Typography } from "@mui/material";

export const docName = (d) => d.name || `Dr. ${d.first_name || ""} ${d.last_name || ""}`.trim();

/**
 * "All providers" dropdown for the calendar toolbar. `selected` is an array of provider ids
 * (as strings); an empty array means everyone.
 */
export default function ProviderFilter({ doctors = [], colors = {}, selected = [], onChange }) {
  const [anchor, setAnchor] = useState(null);
  const label =
    selected.length === 0 || selected.length === doctors.length
      ? "All providers"
      : selected.length === 1
      ? docName(doctors.find((d) => String(d.id) === selected[0]) || {}) || "1 provider"
      : `${selected.length} providers`;
  const toggle = (id) => {
    const key = String(id);
    onChange(selected.includes(key) ? selected.filter((s) => s !== key) : [...selected, key]);
  };
  return (
    <>
      <Button
        variant="outlined"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Filter by provider"
        data-testid="provider-filter"
        sx={{ height: 36, textTransform: "none", fontWeight: 500, fontSize: 14, color: "#1f2937", borderColor: "#cbd5e1" }}
      >
        {label} &nbsp;▾
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {doctors.map((d) => (
          <MenuItem key={d.id} dense onClick={() => toggle(d.id)} data-testid={`provider-option-${d.id}`}>
            <Checkbox size="small" checked={selected.length === 0 || selected.includes(String(d.id))} sx={{ p: 0.5, mr: 1 }} />
            <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: colors[String(d.id)] || "#94a3b8", mr: 1 }} />
            <Typography variant="body2">{docName(d)}</Typography>
          </MenuItem>
        ))}
        <Box sx={{ px: 2, py: 0.5, display: "flex", gap: 2 }}>
          <Button size="small" onClick={() => onChange([])} sx={{ p: 0, minWidth: 0, textTransform: "none" }}>
            Select all
          </Button>
          <Button size="small" onClick={() => onChange(doctors.map((d) => String(d.id)).slice(0, 1))} sx={{ p: 0, minWidth: 0, textTransform: "none" }}>
            Only first
          </Button>
        </Box>
      </Menu>
    </>
  );
}
