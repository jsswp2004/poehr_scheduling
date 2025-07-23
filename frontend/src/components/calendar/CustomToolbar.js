/**
 * CustomToolbar component for the calendar
 */
import React, { useState, useCallback, memo, useEffect, useRef } from "react";
import { TextField, IconButton, Button, InputAdornment } from "@mui/material";
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

  return (
    <div className="rbc-toolbar d-flex align-items-center justify-content-between mb-2">
      {/* Search Field */}
      <div
        style={{
          position: "relative",
          width: "250px",
          marginLeft: "16px",
          marginRight: "6px",
        }}
      >
        <TextField
          fullWidth
          size="small"
          variant="outlined"
          placeholder="Search appointments..."
          value={localSearchValue}
          onChange={handleSearchInputChange}
          sx={{
            "& .MuiOutlinedInput-root": {
              height: "29px",
              fontSize: "14px",
            },
          }}
          InputProps={{
            endAdornment: localSearchValue && (
              <span
                onClick={handleClearSearch}
                style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "16px",
                  height: "16px",
                  fontSize: "12px",
                  color: "#666",
                  borderRadius: "50%",
                  marginRight: "4px",
                  backgroundColor: "transparent",
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = "#f0f0f0";
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = "transparent";
                }}
              >
                ×
              </span>
            ),
          }}
        />
      </div>

      {/* Navigation Controls */}
      <div className="d-flex align-items-center">
        <span className="rbc-btn-group">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => onNavigate("PREV")}
          >
            ‹
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => onNavigate("TODAY")}
          >
            Today
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => onNavigate("NEXT")}
          >
            ›
          </button>
        </span>

        {/* Date Label with Picker */}
        <span className="rbc-toolbar-label mx-3 position-relative">
          <span
            className="text-primary fw-bold"
            style={{ cursor: "pointer" }}
            onClick={() => setShowPicker(!showPicker)}
          >
            {label}
          </span>
          {showPicker && (
            <div
              className="position-absolute bg-white border rounded shadow-lg p-2"
              style={{ top: "100%", left: 0, zIndex: 1000 }}
            >
              <DatePicker
                selected={date}
                onChange={(newDate) => {
                  onNavigate("DATE", newDate);
                  setShowPicker(false);
                }}
                inline
              />
            </div>
          )}
        </span>

        {/* View Controls */}
        <span className="rbc-btn-group">
          {views.map((viewName) => (
            <button
              key={viewName}
              type="button"
              className={`btn btn-sm ${
                view === viewName ? "btn-primary" : "btn-outline-secondary"
              }`}
              onClick={() => onView(viewName)}
            >
              {viewName.charAt(0).toUpperCase() + viewName.slice(1)}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
});

export default CustomToolbar;
