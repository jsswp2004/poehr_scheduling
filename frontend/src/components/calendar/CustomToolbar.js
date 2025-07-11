/**
 * CustomToolbar component for the calendar
 */
import React, { useState } from "react";
import {
    TextField,
    IconButton,
    Button,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const CustomToolbar = ({
    date,
    label,
    onNavigate,
    views,
    view,
    onView,
    searchQuery,
    onSearchChange,
}) => {
    const [showPicker, setShowPicker] = useState(false);

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
                    value={searchQuery}
                    onChange={onSearchChange}
                    sx={{
                        "& .MuiOutlinedInput-root": {
                            height: "29px",
                            fontSize: "14px",
                        },
                    }}
                    InputProps={{
                        endAdornment: searchQuery && (
                            <IconButton
                                size="small"
                                onClick={() => onSearchChange({ target: { value: "" } })}
                                sx={{
                                    position: "absolute",
                                    right: 0,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                }}
                            >
                                <CloseIcon fontSize="small" />
                            </IconButton>
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
                            className={`btn btn-sm ${view === viewName
                                    ? "btn-primary"
                                    : "btn-outline-secondary"
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
};

export default CustomToolbar;
