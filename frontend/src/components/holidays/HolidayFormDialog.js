import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
    TextField,
    FormControl,
    InputLabel,
    Select as MUISelect,
    MenuItem,
    Button,
} from '@mui/material';

const HolidayFormDialog = ({
    open,
    editingHoliday,
    holidayFormData,
    saving,
    onClose,
    onSave,
    onUpdateFormData,
}) => {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
        >
            <DialogTitle>
                {editingHoliday ? 'Edit Holiday' : 'Add Holiday'}
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} mt={2}>
                    <TextField
                        label="Name"
                        value={holidayFormData.name}
                        onChange={(e) => onUpdateFormData('name', e.target.value)}
                        fullWidth
                        size="small"
                    />
                    <TextField
                        label="Date"
                        type="date"
                        value={holidayFormData.date}
                        onChange={(e) => onUpdateFormData('date', e.target.value)}
                        fullWidth
                        size="small"
                        InputLabelProps={{ shrink: true }}
                    />
                    <FormControl fullWidth size="small">
                        <InputLabel id="recognized-label">Recognized</InputLabel>
                        <MUISelect
                            labelId="recognized-label"
                            value={holidayFormData.is_recognized ? 'yes' : 'no'}
                            label="Recognized"
                            onChange={(e) =>
                                onUpdateFormData('is_recognized', e.target.value === 'yes')
                            }
                        >
                            <MenuItem value="yes">Yes</MenuItem>
                            <MenuItem value="no">No</MenuItem>
                        </MUISelect>
                    </FormControl>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="secondary">
                    Cancel
                </Button>
                <Button
                    onClick={onSave}
                    variant="contained"
                    color="primary"
                    disabled={saving}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default HolidayFormDialog;
