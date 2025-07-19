/**
 * RegisterModal component for creating new patients from the appointment modal
 */
import React from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    Box,
    Typography,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import RegisterPage from "../../pages/RegisterPage";

const RegisterModal = ({ open, onClose, onPatientCreated }) => {
    const handleClose = () => {
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    height: '90vh',
                    maxHeight: '90vh',
                }
            }}
        >
            <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" component="div">
                        Register New Patient
                    </Typography>
                    <IconButton
                        aria-label="close"
                        onClick={handleClose}
                        sx={{
                            color: (theme) => theme.palette.grey[500],
                        }}
                    >
                        <Close />
                    </IconButton>
                </Box>
            </DialogTitle>

            <DialogContent
                dividers
                sx={{
                    p: 2,
                    overflow: 'auto',
                    '& .MuiPaper-root': {
                        boxShadow: 'none',
                        background: 'transparent',
                    }
                }}
            >
                <RegisterPage
                    adminMode={true}
                    onPatientRegistered={onPatientCreated}
                    modalMode={true}
                />
            </DialogContent>
        </Dialog>
    );
};

export default RegisterModal;
