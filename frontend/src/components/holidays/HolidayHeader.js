import React from 'react';
import { Stack, TextField, Button, Typography, IconButton } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faXmark, faSpinner } from '@fortawesome/free-solid-svg-icons';

const HolidayHeader = ({
    searchQuery,
    onSearchChange,
    onClearSearch,
    yearInput,
    onYearChange,
    loadingYear,
    onLoadYear,
    onAddHoliday
}) => {
    return (
        <Stack
            direction="row"
            spacing={2}
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 3 }}
        >
            <TextField
                size="small"
                variant="outlined"
                placeholder="Search holidays..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                sx={{ maxWidth: 350 }}
                InputProps={{
                    endAdornment: searchQuery && (
                        <IconButton size="small" onClick={onClearSearch}>
                            <FontAwesomeIcon icon={faXmark} />
                        </IconButton>
                    ),
                }}
            />

            <Typography variant="body2" color="text.secondary">
                <b>Tip:</b> Click "Add Holiday" to create a new holiday. Use the
                delete button to remove any unwanted holidays.
            </Typography>

            <Stack direction="row" spacing={2} alignItems="center">
                <TextField
                    label="Year"
                    type="number"
                    size="small"
                    value={yearInput}
                    onChange={(e) => onYearChange(e.target.value)}
                    sx={{ maxWidth: 120 }}
                    disabled={loadingYear}
                />
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={onLoadYear}
                    disabled={loadingYear}
                >
                    {loadingYear ? (
                        <FontAwesomeIcon
                            icon={faSpinner}
                            spin
                            style={{ marginRight: 8 }}
                        />
                    ) : null}
                    Load Year
                </Button>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={onAddHoliday}
                >
                    <FontAwesomeIcon icon={faPlus} style={{ marginRight: 6 }} />
                    Add Holiday
                </Button>
            </Stack>
        </Stack>
    );
};

export default HolidayHeader;
