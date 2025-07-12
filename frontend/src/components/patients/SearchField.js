import React, { useState, useEffect, useCallback } from 'react';
import { TextField } from '@mui/material';

const SearchField = ({ onSearchChange, initialValue = '', ...textFieldProps }) => {
    const [localValue, setLocalValue] = useState(initialValue);

    // Update local value when initialValue changes (but not during typing)
    useEffect(() => {
        if (initialValue !== localValue) {
            setLocalValue(initialValue);
        }
    }, [initialValue]);

    // Debounce function
    useEffect(() => {
        const timer = setTimeout(() => {
            onSearchChange(localValue);
        }, 500);

        return () => clearTimeout(timer);
    }, [localValue, onSearchChange]);

    const handleChange = useCallback((e) => {
        setLocalValue(e.target.value);
    }, []);

    return (
        <TextField
            {...textFieldProps}
            value={localValue}
            onChange={handleChange}
        />
    );
};

export default React.memo(SearchField);
