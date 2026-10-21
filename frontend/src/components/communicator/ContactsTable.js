import React, { useMemo, useState } from 'react';
import {
    Box,
    Button,
    Chip,
    IconButton,
    LinearProgress,
    MenuItem,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TablePagination,
    TableRow,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrash, faUserPlus, faFileArrowUp, faPrint } from '@fortawesome/free-solid-svg-icons';

const ROWS_PER_PAGE = 14;

/**
 * Contacts list. Layout mirrors the Staffing roster: title with count, actions
 * on the right, search + filters row, plain table, 14 rows per page.
 * Search, filters and paging are client-side (the whole list is loaded).
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
    const [search, setSearch] = useState('');
    const [smsFilter, setSmsFilter] = useState('all'); // all | can | out | none
    const [infoFilter, setInfoFilter] = useState('all'); // all | phone | email | missing
    const [page, setPage] = useState(0);

    const smsStatus = (c) => {
        if (!hasPhone(c)) return 'none';
        return c.opted_out ? 'out' : 'can';
    };

    const filtered = useMemo(() => {
        const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return contacts.filter((c) => {
            if (smsFilter !== 'all' && smsStatus(c) !== smsFilter) return false;
            if (infoFilter === 'phone' && !hasPhone(c)) return false;
            if (infoFilter === 'email' && !hasEmail(c)) return false;
            if (infoFilter === 'missing' && hasPhone(c) && hasEmail(c)) return false;
            if (terms.length === 0) return true;
            const haystack = [c.name, c.phone, c.email].filter(Boolean).join(' ').toLowerCase();
            // Phone numbers: also match on digits only, so "301880" finds (301) 880-xxxx.
            const digits = (c.phone || '').replace(/\D/g, '');
            return terms.every((t) => haystack.includes(t) || (/^\d+$/.test(t) && digits.includes(t)));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contacts, search, smsFilter, infoFilter]);

    const lastPage = Math.max(0, Math.ceil(filtered.length / ROWS_PER_PAGE) - 1);
    const safePage = Math.min(page, lastPage);
    const pageRows = filtered.slice(safePage * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE + ROWS_PER_PAGE);
    const filtersActive = search.trim() !== '' || smsFilter !== 'all' || infoFilter !== 'all';

    const resetFilters = () => {
        setSearch('');
        setSmsFilter('all');
        setInfoFilter('all');
        setPage(0);
    };

    const statusChip = (c) => {
        const s = smsStatus(c);
        if (s === 'can') return <Chip size="small" color="success" label="Can text" />;
        if (s === 'out') return <Chip size="small" color="error" variant="outlined" label="Opted out" />;
        return <Chip size="small" variant="outlined" label="No phone" />;
    };

    return (
        <Box>
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
                <Typography variant="h6">Contacts ({contacts.length})</Typography>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                    <Button size="small" onClick={onDownloadTemplate}>Download template</Button>
                    <Button
                        size="small"
                        startIcon={<FontAwesomeIcon icon={faPrint} />}
                        onClick={() => onPrintContacts(contacts)}
                        disabled={contacts.length === 0}
                    >
                        Print
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<FontAwesomeIcon icon={faFileArrowUp} />}
                        onClick={onUploadClick}
                    >
                        Upload CSV
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<FontAwesomeIcon icon={faUserPlus} />}
                        onClick={onAddContact}
                    >
                        Add recipients
                    </Button>
                </Stack>
            </Stack>

            {loading && <LinearProgress sx={{ mb: 1 }} />}

            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
                <TextField
                    size="small"
                    label="Search contacts"
                    placeholder="Name, phone or email"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    sx={{ minWidth: 260, flex: 1, maxWidth: 420 }}
                />
                <TextField
                    select
                    size="small"
                    label="SMS status"
                    value={smsFilter}
                    onChange={(e) => { setSmsFilter(e.target.value); setPage(0); }}
                    sx={{ minWidth: 140 }}
                >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="can">Can text</MenuItem>
                    <MenuItem value="out">Opted out</MenuItem>
                    <MenuItem value="none">No phone</MenuItem>
                </TextField>
                <TextField
                    select
                    size="small"
                    label="Contact info"
                    value={infoFilter}
                    onChange={(e) => { setInfoFilter(e.target.value); setPage(0); }}
                    sx={{ minWidth: 140 }}
                >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="phone">Has phone</MenuItem>
                    <MenuItem value="email">Has email</MenuItem>
                    <MenuItem value="missing">Missing info</MenuItem>
                </TextField>
                <Typography variant="body2" color="text.secondary">
                    Showing {filtered.length} of {contacts.length}
                </Typography>
                {filtersActive && <Button size="small" onClick={resetFilters}>Clear</Button>}
                {filtered.length > ROWS_PER_PAGE && (
                    <TablePagination
                        component="div"
                        count={filtered.length}
                        page={safePage}
                        onPageChange={(e, p) => setPage(p)}
                        rowsPerPage={ROWS_PER_PAGE}
                        rowsPerPageOptions={[]}
                        sx={{ ml: 'auto', borderBottom: 0 }}
                    />
                )}
            </Stack>

            <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Phone</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>SMS status</TableCell>
                            <TableCell>Created</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pageRows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        {contacts.length === 0
                                            ? 'No contacts yet. Add recipients manually or upload a CSV file.'
                                            : 'No contacts match your search.'}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                        {pageRows.map((contact) => (
                            <TableRow key={contact.id} hover>
                                <TableCell>{contact.name}</TableCell>
                                <TableCell>{hasPhone(contact) ? contact.phone : '—'}</TableCell>
                                <TableCell>{hasEmail(contact) ? contact.email : '—'}</TableCell>
                                <TableCell>{statusChip(contact)}</TableCell>
                                <TableCell>{formatDate(contact.created_at)}</TableCell>
                                <TableCell align="right">
                                    <Tooltip title="Edit contact">
                                        <IconButton size="small" onClick={() => onEditContact(contact)} aria-label="Edit contact">
                                            <FontAwesomeIcon icon={faPen} />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete contact">
                                        <IconButton size="small" color="error" onClick={() => onDeleteContact(contact)} aria-label="Delete contact">
                                            <FontAwesomeIcon icon={faTrash} />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Box>
        </Box>
    );
};

export default ContactsTable;
