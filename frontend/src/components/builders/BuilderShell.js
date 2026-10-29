import { createContext, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Chip, Container, Paper, Typography } from "@mui/material";
import BackButton from "../BackButton";

// Shared layout for the builders (Status Board, Note, Flowsheet, Order, Triage).
//
//   BuilderShell     pinned title, count chips, chip tabs and a toolbar slot under the 64px navy bar.
//   BuilderToolbar   a screen's toolbar (Save, Discard, New, a ⋮ menu) rendered into that slot, so it stays pinned.
//                    Without a slot (tests, a component used on its own) it renders inline.
//   BuilderSplit     the list on the left (pinned while the editor scrolls) with the editor on the right.
//   BuilderListPanel the left list panel: a header (usually the "New" button) and the rows.
//
// The pinned block publishes its height as --builder-sticky-h so pinned table headers and the list panel can sit
// just under it.

export const BuilderToolbarSlotContext = createContext(null);

export const BUILDER_STICKY_TOP = "calc(64px + var(--builder-sticky-h, 170px))";

export function BuilderToolbar({ children }) {
  const slot = useContext(BuilderToolbarSlotContext);
  return slot ? createPortal(children, slot) : children;
}

export function BuilderShell({ title, subtitle, chips, tabs, tab, onTab, maxWidth = 1280, children }) {
  const [slot, setSlot] = useState(null);

  const pinRef = useCallback((node) => {
    if (!node) return;
    const publish = () => document.documentElement.style.setProperty("--builder-sticky-h", `${node.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(publish).observe(node);
  }, []);

  return (
    <Container maxWidth={false} sx={{ mt: 0, mb: 3, px: { xs: 2, md: 4 } }}>
      <Box
        ref={pinRef}
        data-testid="builder-sticky-header"
        sx={{
          position: "sticky",
          top: 64,
          zIndex: 1000,
          bgcolor: "background.default",
          pt: "18px",
          mt: "-18px",
          pb: 0.5,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
            {title}
          </Typography>
          {chips}
          <Box sx={{ flex: 1 }} />
          <BackButton sx={{ mb: 0, py: 0.75 }} />
        </Box>
        {subtitle && (
          <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12, mt: -0.25 }}>
            {subtitle}
          </Typography>
        )}
        {tabs && tabs.length > 0 && (
          <Box role="tablist" sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", pt: 1 }}>
            {tabs.map((t) => (
              <Chip
                key={t.key}
                size="small"
                clickable
                role="tab"
                aria-selected={tab === t.key}
                color={tab === t.key ? "primary" : "default"}
                variant={tab === t.key ? "filled" : "outlined"}
                label={t.count != null ? `${t.label} ${t.count}` : t.label}
                onClick={() => onTab(t.key)}
                data-testid={`builder-tab-${t.key}`}
              />
            ))}
          </Box>
        )}
        <Box
          ref={setSlot}
          data-testid="builder-toolbar"
          sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", py: 1, minHeight: 44 }}
        />
      </Box>
      <BuilderToolbarSlotContext.Provider value={slot}>
        <Box sx={{ maxWidth, mx: "auto", pt: 2 }}>{children}</Box>
      </BuilderToolbarSlotContext.Provider>
    </Container>
  );
}

export function BuilderSplit({ list, children }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "260px minmax(0, 1fr)" },
        gap: 2,
        alignItems: "start",
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          position: { md: "sticky" },
          top: { md: `calc(${BUILDER_STICKY_TOP} + 14px)` },
          maxHeight: { md: `calc(100vh - ${BUILDER_STICKY_TOP} - 40px)` },
          overflow: "auto",
          borderRadius: 2,
        }}
      >
        {list}
      </Paper>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

// A header strip for the top of a list panel (New button, search box).
export function BuilderListHeader({ children }) {
  return (
    <Box sx={{ p: 1, display: "grid", gap: 1, borderBottom: "1px solid", borderColor: "divider" }}>{children}</Box>
  );
}
