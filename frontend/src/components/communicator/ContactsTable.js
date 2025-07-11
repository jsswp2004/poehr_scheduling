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
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={onAddContact}
                >
                    Add Recipients
                </Button>

                <Button
                    variant="outlined"
                    startIcon={<UploadIcon />}
                    onClick={onUploadClick}
                >
                    Upload CSV
                </Button>

                <Button
                    variant="text"
                    onClick={onDownloadTemplate}
                >
                    Download Template
                </Button>

                <Button
                    variant="text"
                    startIcon={<PrintIcon />}
                    onClick={() => onPrintContacts(contacts)}
                    disabled={contacts.length === 0}
                >
                    Print Contacts
                </Button>
            </Box>

            {/* Loading Indicator */}
            {loading && <LinearProgress sx={{ mb: 2 }} />}

            {/* Contacts Table */}
            <TableContainer component={Paper} elevation={3}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: 'primary.light' }}>
                            <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {contacts.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
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
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <SmsIcon fontSize="small" color="success" />
                                                {contact.phone}
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">-</Typography>
                                        )}
                                    </TableCell>

                                    <TableCell>
                                        {hasEmail(contact) ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
