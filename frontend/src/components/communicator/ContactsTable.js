import React from 'react';
import {
    Box,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Typography,
    IconButton,
    LinearProgress
} from '@mui/material';
import {
    Add as AddIcon,
    Upload as UploadIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Email as EmailIcon,
    Sms as SmsIcon,
    Print as PrintIcon
} from '@mui/icons-material';

/**
 * Contacts table component with CRUD operations
 * Displays contacts list with edit, delete, and action buttons
 */
const ContactsTable = ({
    contacts,
    loading,
    onAddContact,
    onEditContact,
    onDeleteContact,
    onUploadClick,
    onDownloadTemplate,
    onPrintContacts,
    formatDate,
    hasPhone,
    hasEmail
}) => {
    return (
        <Box>
            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={onAddContact}
                >
                    Add Recipients
                </Button>

                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<UploadIcon />}
                    onClick={onUploadClick}
                >
                    Upload CSV
                </Button>

                <Button
                    variant="text"
                    size="small"
                    onClick={onDownloadTemplate}
                >
                    Download Template
                </Button>

                <Button
                    variant="text"
                    size="small"
                    startIcon={<PrintIcon />}
                    onClick={() => onPrintContacts(contacts)}
                    disabled={contacts.length === 0}
                >
                    Print Contacts
                </Button>
            </Box>

            {/* Loading Indicator */}
            {loading && <LinearProgress sx={{ mb: 1 }} />}

            {/* Contacts Table */}
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {contacts.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                                    <Typography variant="body1" color="text.secondary">
                                        No contacts found. Add contacts manually or upload a CSV file.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            contacts.map((contact) => (
                                <TableRow key={contact.id} hover>
                                    <TableCell>{contact.name}</TableCell>

                                    <TableCell>
                                        {hasPhone(contact) ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                <SmsIcon fontSize="small" color="success" />
                                                {contact.phone}
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">-</Typography>
                                        )}
                                    </TableCell>

                                    <TableCell>
                                        {hasEmail(contact) ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                <EmailIcon fontSize="small" color="info" />
                                                {contact.email}
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">-</Typography>
                                        )}
                                    </TableCell>

                                    <TableCell>
                                        {formatDate(contact.created_at)}
                                    </TableCell>

                                    <TableCell>
                                        <IconButton
                                            onClick={() => onEditContact(contact)}
                                            color="primary"
                                            size="small"
                                        >
                                            <EditIcon />
                                        </IconButton>

                                        <IconButton
                                            onClick={() => onDeleteContact(contact.id)}
                                            color="error"
                                            size="small"
                                        >
                                            <DeleteIcon />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default ContactsTable;
