/**
 * CustomToolbar component for the calendar
 */
import React, { useState, useCallback, memo, useEffect, useRef } from "react";
import { Box, TextField, Button, ButtonGroup } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const CustomToolbar = memo(function CustomToolbar({
  date,
  label,
  onNavigate,
  views,
  view,
  onView,
  searchQuery,
  onSearchChange,
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [localSearchValue, setLocalSearchValue] = useState(searchQuery || "");
  const searchTimeoutRef = useRef(null);

  // Sync with external searchQuery when it changes
  useEffect(() => {
    setLocalSearchValue(searchQuery || "");
  }, [searchQuery]);

  // Handle local search input changes
  const handleSearchInputChange = useCallback(
    (e) => {
      const value = e.target.value;
      setLocalSearchValue(value);

      // Clear existing timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Debounce the external search update
      searchTimeoutRef.current = setTimeout(() => {
        onSearchChange(value);
      }, 300);
    },
    [onSearchChange]
  );

  // Memoize the clear search handler
  const handleClearSearch = useCallback(() => {
    setLocalSearchValue("");
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    onSearchChange("");
  }, [onSearchChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Suite look: 36px controls, slate borders, tinted active state.
  const groupButtonSx = (active) => ({
    height: 36,
    px: 1.5,
    minWidth: 40,
    fontWeight: 600,
    fontSize: 14,
    bgcolor: active ? "#dbeafe" : "#ffffff",
    color: active ? "#1d4ed8" : "#475569",
    borderColor: "#cbd5e1",
    "&:hover": {
      bgcolor: active ? "#dbeafe" : "#f1f5f9",
      borderColor: "#cbd5e1",
    },
  });

  return (
    <Box
      className="rbc-toolbar"
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1.5,
        mb: 1.5,
        px: 0.5,
      }}
    >
      {/* Navigation Controls */}
      <ButtonGroup variant="outlined" aria-label="Calendar navigation">
        <Button aria-label="Previous" onClick={() => onNavigate("PREV")} sx={groupButtonSx(false)}>
          ‹
        </Button>
        <Button onClick={() => onNavigate("TODAY")} sx={groupButtonSx(false)}>
          Today
        </Button>
        <Button aria-label="Next" onClick={() => onNavigate("NEXT")} sx={groupButtonSx(false)}>
          ›
        </Button>
      </ButtonGroup>

      {/* Date Label with Picker */}
      <Box sx={{ position: "relative" }}>
        <Button
          onClick={() => setShowPicker(!showPicker)}
          sx={{ fontSize: 16, fontWeight: 600, color: "text.primary", height: 36, px: 1 }}
        >
          {label}
        </Button>
        {showPicker && (
          <Box
            sx={{
              position: "absolute",
              top: "100%",
              left: 0,
              zIndex: 1000,
              bgcolor: "background.paper",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              boxShadow: 3,
              p: 1,
            }}
          >
            <DatePicker
              selected={date}
              onChange={(newDate) => {
                onNavigate("DATE", newDate);
                setShowPicker(false);
              }}
              inline
            />
          </Box>
        )}
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      {/* Search Field */}
      <TextField
        size="small"
        variant="outlined"
        placeholder="Search appointments..."
        value={localSearchValue}
        onChange={handleSearchInputChange}
        sx={{
          width: 260,
          "& .MuiOutlinedInput-root": { height: 36, fontSize: 14 },
        }}
        inputProps={{ "aria-label": "Search appointments" }}
        InputProps={{
          endAdornment: localSearchValue && (
            <Box
              component="button"
              type="button"
              aria-label="Clear search"
              onClick={handleClearSearch}
              sx={{
                border: 0,
                background: "transparent",
                cursor: "pointer",
                color: "#475569",
                fontSize: 16,
                lineHeight: 1,
                borderRadius: "50%",
                width: 22,
                height: 22,
                "&:hover": { bgcolor: "#f1f5f9" },
              }}
            >
              ×
            </Box>
          ),
        }}
      />

      {/* View Controls */}
      <ButtonGroup variant="outlined" aria-label="Calendar view">
        {views.map((viewName) => (
          <Button
            key={viewName}
            onClick={() => onView(viewName)}
            sx={groupButtonSx(view === viewName)}
          >
            {/* react-big-calendar's built-in view names use underscores
                (e.g. "work_week"); replace them with spaces and title-case
                every word so the label reads "Work Week". */}
            {viewName
              .split("_")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")}
          </Button>
        ))}
      </ButtonGroup>
    </Box>
  );
});

export default CustomToolbar;
