import React, { useMemo, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    Chip,
    IconButton,
    LinearProgress,
    Menu,
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
import { faPen, faTrash, faUserPlus, faFileArrowUp, faEllipsisVertical } from '@fortawesome/free-solid-svg-icons';
import ToolbarPortal, { STICKY_TOP } from './CommunicatorToolbarSlot';

const ROWS_PER_PAGE = 14;

const initials = (name) =>
    (name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

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

    const count = (fn) => contacts.filter(fn).length;
    const chips = [
        ['all', 'All', contacts.length],
        ['can', 'Can text', count((c) => smsStatus(c) === 'can')],
        ['out', 'Opted out', count((c) => smsStatus(c) === 'out')],
        ['none', 'No phone', count((c) => smsStatus(c) === 'none')],
        ['missing', 'Missing info', count((c) => !hasPhone(c) || !hasEmail(c))]
    ];
    // One chip row replaces the two dropdowns: "all" clears both filters.
    const chipActive = (key) => {
        if (key === 'all') return smsFilter === 'all' && infoFilter === 'all';
        if (key === 'missing') return infoFilter === 'missing';
        return smsFilter === key;
    };
    const pickChip = (key) => {
        setPage(0);
        if (key === 'all') { setSmsFilter('all'); setInfoFilter('all'); }
        else if (key === 'missing') { setSmsFilter('all'); setInfoFilter(infoFilter === 'missing' ? 'all' : 'missing'); }
        else { setInfoFilter('all'); setSmsFilter(smsFilter === key ? 'all' : key); }
    };

    const [menuAnchor, setMenuAnchor] = useState(null);
    const closeMenu = () => setMenuAnchor(null);

    const headCell = { position: 'sticky', top: STICKY_TOP, zIndex: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' };

    return (
        <Box>
            {/* Frozen toolbar (rendered into the page's pinned header block) */}
            <ToolbarPortal>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1, pb: 1 }}>
                    <TextField
                        size="small"
                        placeholder="Search name, phone or email"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                        inputProps={{ 'aria-label': 'Search contacts' }}
                        sx={{ minWidth: 240, flex: '1 1 240px', maxWidth: 380 }}
                    />
                    {chips.map(([key, label, n]) => (
                        <Chip
                            key={key}
                            clickable
                            size="small"
                            label={`${label} ${n}`}
                            aria-pressed={chipActive(key)}
                            color={chipActive(key) ? 'primary' : 'default'}
                            variant={chipActive(key) ? 'filled' : 'outlined'}
                            onClick={() => pickChip(key)}
                            sx={{ fontWeight: 600 }}
                        />
                    ))}
                    <Box sx={{ flex: 1 }} />
                    <Button variant="outlined" size="small" startIcon={<FontAwesomeIcon icon={faFileArrowUp} />} onClick={onUploadClick}>
                        Upload CSV
                    </Button>
                    <Button variant="contained" size="small" startIcon={<FontAwesomeIcon icon={faUserPlus} />} onClick={onAddContact}>
                        Add recipients
                    </Button>
                    <Tooltip title="More actions">
                        <IconButton size="small" aria-label="More actions" aria-haspopup="menu" onClick={(e) => setMenuAnchor(e.currentTarget)}>
                            <FontAwesomeIcon icon={faEllipsisVertical} />
                        </IconButton>
                    </Tooltip>
                    <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
                        <MenuItem onClick={() => { closeMenu(); onDownloadTemplate(); }}>Download template</MenuItem>
                        <MenuItem disabled={contacts.length === 0} onClick={() => { closeMenu(); onPrintContacts(contacts); }}>
                            Print contacts
                        </MenuItem>
                    </Menu>
                </Stack>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ pb: 0.5, minHeight: 32 }}>
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
                            sx={{ ml: 'auto', borderBottom: 0, minHeight: 32, '& .MuiToolbar-root': { minHeight: 32 } }}
                        />
                    )}
                </Stack>
            </ToolbarPortal>

            {loading && <LinearProgress sx={{ mb: 1 }} />}

            {/* overflow is only clipped (not scrolled) on wide screens so the header row can pin to the page */}
            <Box sx={{ overflowX: { xs: 'auto', md: 'clip' } }}>
                <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={headCell}>Name</TableCell>
                            <TableCell sx={headCell}>Phone</TableCell>
                            <TableCell sx={headCell}>Email</TableCell>
                            <TableCell sx={headCell}>SMS status</TableCell>
                            <TableCell sx={headCell}>Created</TableCell>
                            <TableCell sx={headCell} align="right">Actions</TableCell>
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
                                <TableCell>
                                    <Avatar sx={{ width: 26, height: 26, mr: 1, display: 'inline-flex', verticalAlign: 'middle', fontSize: 11, fontWeight: 700, bgcolor: 'action.selected', color: 'primary.main' }}>
                                        {initials(contact.name)}
                                    </Avatar>
                                    {contact.name}
                                </TableCell>
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
