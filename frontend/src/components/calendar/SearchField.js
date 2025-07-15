/**
 * Isolated Search Field Component
 * This component is completely isolated from calendar re-renders
 */
import React, { useRef, useEffect, useCallback } from "react";
import { TextField, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

const SearchField = React.memo(function SearchField({ onSearchChange, searchQuery }) {
    const inputRef = useRef();
    const timeoutRef = useRef();

    // Handle input change with debouncing
    const handleInputChange = useCallback((e) => {
        const value = e.target.value;

        // Clear previous timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Set new timeout for debounced search
        timeoutRef.current = setTimeout(() => {
            onSearchChange({ target: { value } });
        }, 500);
    }, [onSearchChange]);

    // Handle clear search
    const handleClearSearch = useCallback(() => {
        if (inputRef.current) {
            inputRef.current.value = "";
            onSearchChange({ target: { value: "" } });
        }
    }, [onSearchChange]);

    // Update input value when searchQuery prop changes (for programmatic updates)
    useEffect(() => {
        if (inputRef.current && inputRef.current.value !== searchQuery) {
            inputRef.current.value = searchQuery || "";
        }
    }, [searchQuery]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return (
        <div
            style={{
                position: "relative",
                width: "250px",
                marginLeft: "16px",
                marginRight: "6px",
            }}
        >
            <TextField
                inputRef={inputRef}
                fullWidth
                size="small"
                variant="outlined"
                placeholder="Search appointments..."
                defaultValue={searchQuery || ""}
                onChange={handleInputChange}
                sx={{
                    "& .MuiOutlinedInput-root": {
                        height: "29px",
                        fontSize: "14px",
                    },
                }}
                InputProps={{
                    endAdornment: (
                        <IconButton
                            size="small"
                            onClick={handleClearSearch}
                            sx={{
                                position: "absolute",
                                right: 0,
                                top: "50%",
                                transform: "translateY(-50%)",
                                opacity: 0.7,
                                "&:hover": {
                                    opacity: 1,
                                }
                            }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    ),
                }}
            />
        </div>
    );
});

export default SearchField;
