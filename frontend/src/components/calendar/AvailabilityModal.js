/**
 * AvailabilityModal component for showing provider availability
 */
import React from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    List,
    ListItem,
    ListItemText,
    Chip,
} from "@mui/material";
import { formatTime } from "../../utils/calendar/dateUtils";

const AvailabilityModal = ({
    open,
    onClose,
    selectedDateAvailability,
}) => {
    const availabilityData = selectedDateAvailability?.availability || [];
    const selectedDate = selectedDateAvailability?.date;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                Provider Availability
                {selectedDate && (
                    <Typography variant="subtitle2" color="text.secondary">
                        {selectedDate.toDateString()}
                    </Typography>
                )}
            </DialogTitle>

            <DialogContent>
                <Box>
                    {availabilityData.length > 0 ? (
                        <List>
                            {availabilityData.map((event) => (
                                <ListItem key={event.id} divider>
                                    <ListItemText
                                        primary={`Dr. ${event.resource?.data?.provider_name || "Unknown Provider"}`}
                                        secondary={`${formatTime(event.start)} - ${formatTime(event.end)}`}
                                    />
                                    <Chip
                                        label="Available"
                                        color="success"
                                        size="small"
                                    />
                                </ListItem>
                            ))}
                        </List>
                    ) : (
                        <Typography
                            color="text.secondary"
                            align="center"
                            sx={{ py: 3 }}
                        >
                            No providers available on this date.
                        </Typography>
                    )}
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} color="primary">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AvailabilityModal;
