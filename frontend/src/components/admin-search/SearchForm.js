import React from 'react';
import { TextField, Box, Button } from '@mui/material';

/**
 * SearchForm Component
 * Handles the search input and form submission
 */
const SearchForm = ({
    query,
    onQueryChange,
    onSearch
}) => {
    return (
        <Box
            component="form"
            onSubmit={onSearch}
            sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}
        >
            <TextField
                type="text"
                label="Search by patient, provider, date or description"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                fullWidth
                size="small"
            />
            <Button variant="contained" color="primary" type="submit">
                Search
            </Button>
        </Box>
    );
};

export default SearchForm;
