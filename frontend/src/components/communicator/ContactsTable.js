import React, { useMemo, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    ButtonBase,
    Checkbox,
    IconButton,
    LinearProgress,
    Menu,
    MenuItem,
    Paper,
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
import { faPen, faUserPlus, faFileArrowUp, faEllipsisVertical } from '@fortawesome/free-solid-svg-icons';
import ToolbarPortal, { STICKY_TOP } from './CommunicatorToolbarSlot';

const ROWS_PER_PAGE = 14;

const initials = (name) =>
    (name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// Soft status pills: a tinted background, dark text of the same hue, and a dot. Contrast is above 4.5:1.
const CONSENT = {
    can: { label: 'Can text', bg: '#d1fae5', fg: '#065f46', dot: '#047857' },
    out: { label: 'Opted out', bg: '#fee2e2', fg: '#991b1b', dot: '#b91c1c' },
    none: { label: 'No phone', bg: '#f1f5f9', fg: '#334155', dot: '#64748b' }
};

const ConsentPill = ({ kind }) => {
    const c = CONSENT[kind];
    return (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.25, borderRadius: 999, bgcolor: c.bg, color: c.fg, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
            <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: c.dot }} />
            {c.label}
        </Box>
    );
};

/**
 * Contacts list. Four summary tiles double as filters (All, Can text, Opted out, Needs attention), a pinned
 * toolbar holds search and the actions, and the table has row checkboxes with a "Message selected" bar.
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
    hasEmail,
    selectedIds = [],
    onSelectionChange = () => {},
    onMessageSelected = () => {}
}) => {
    const [search, setSearch] = useState('');
    const [smsFilter, setSmsFilter] = useState('all'); // all | can | out | none
    const [infoFilter, setInfoFilter] = useState('all'); // all | missing
    const [page, setPage] = useState(0);

    const smsStatus = (c) => {
        if (!hasPhone(c)) return 'none';
        return c.opted_out ? 'out' : 'can';
    };

    const filtered = useMemo(() => {
        const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return contacts.filter((c) => {
            if (smsFilter !== 'all' && smsStatus(c) !== smsFilter) return false;
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

    // Selection (ids persist across pages and filters; the header box acts on everything the filters show)
    const selectedSet = new Set(selectedIds);
    const filteredIds = filtered.map((c) => c.id);
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedSet.has(id));
    const someFilteredSelected = filteredIds.some((id) => selectedSet.has(id));
    const toggleAll = () =>
        onSelectionChange(
            allFilteredSelected
                ? selectedIds.filter((id) => !filteredIds.includes(id))
                : Array.from(new Set([...selectedIds, ...filteredIds]))
        );
    const toggleOne = (id) =>
        onSelectionChange(selectedSet.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

    const resetFilters = () => {
        setSearch('');
        setSmsFilter('all');
        setInfoFilter('all');
        setPage(0);
    };

    const count = (fn) => contacts.filter(fn).length;
    const tiles = [
        ['all', 'All contacts', contacts.length, 'Everyone in your list', null],
        ['can', 'Can text', count((c) => smsStatus(c) === 'can'), "Have a phone and haven't opted out", '#047857'],
        ['out', 'Opted out', count((c) => smsStatus(c) === 'out'), 'Replied STOP. Never texted', '#b91c1c'],
        ['missing', 'Needs attention', count((c) => !hasPhone(c) || !hasEmail(c)), 'Missing a phone or an email', '#b45309']
    ];
    // "all" clears both filters; the others replace each other. Clicking the active tile clears it.
    const tileActive = (key) => {
        if (key === 'all') return smsFilter === 'all' && infoFilter === 'all';
        if (key === 'missing') return infoFilter === 'missing';
        return smsFilter === key;
    };
    const pickTile = (key) => {
        setPage(0);
        if (key === 'all') { setSmsFilter('all'); setInfoFilter('all'); }
        else if (key === 'missing') { setSmsFilter('all'); setInfoFilter(infoFilter === 'missing' ? 'all' : 'missing'); }
        else { setInfoFilter('all'); setSmsFilter(smsFilter === key ? 'all' : key); }
    };

    const [menuAnchor, setMenuAnchor] = useState(null);
    const closeMenu = () => setMenuAnchor(null);
    const [rowMenu, setRowMenu] = useState(null); // { anchor, contact }
    const closeRowMenu = () => setRowMenu(null);

    const headCell = {
        position: 'sticky', top: STICKY_TOP, zIndex: 2, bgcolor: '#f8fafc', borderBottom: 1, borderColor: 'divider',
        color: 'text.secondary', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase'
    };

    // Nothing yet: one clear next step instead of an empty table.
    if (!loading && contacts.length === 0) {
        return (
            <Paper variant="outlined" sx={{ mt: 2, py: 8, px: 3, textAlign: 'center', borderRadius: '12px' }}>
                <Typography variant="h6" component="h2">No contacts yet</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3, maxWidth: 460, mx: 'auto' }}>
                    Add the people you want to reach by text or email. You can add them one at a time or import a CSV file.
                </Typography>
                <Stack direction="row" spacing={1.5} justifyContent="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                    <Button variant="contained" startIcon={<FontAwesomeIcon icon={faUserPlus} />} onClick={onAddContact}>Add contact</Button>
                    <Button variant="outlined" startIcon={<FontAwesomeIcon icon={faFileArrowUp} />} onClick={onUploadClick}>Import CSV</Button>
                    <Button onClick={onDownloadTemplate}>Download template</Button>
                </Stack>
            </Paper>
        );
    }

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
                        sx={{ minWidth: 240, flex: '1 1 240px', maxWidth: 420 }}
                    />
                    <Box sx={{ flex: 1 }} />
                    <Button variant="outlined" size="small" startIcon={<FontAwesomeIcon icon={faFileArrowUp} />} onClick={onUploadClick}>
                        Import
                    </Button>
                    <Button variant="contained" size="small" startIcon={<FontAwesomeIcon icon={faUserPlus} />} onClick={onAddContact}>
                        Add contact
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
                {selectedIds.length > 0 ? (
                    <Stack direction="row" spacing={1.5} alignItems="center" role="status" sx={{ flexWrap: 'wrap', rowGap: 1, py: 0.75, px: 1.5, mb: 0.5, borderRadius: 2, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedIds.length} selected</Typography>
                        <Button size="small" variant="contained" onClick={onMessageSelected}>Message selected</Button>
                        <Box sx={{ flex: 1 }} />
                        <Button size="small" onClick={() => onSelectionChange([])}>Clear selection</Button>
                    </Stack>
                ) : (
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ pb: 0.5, minHeight: 32 }}>
                        <Typography variant="body2" color="text.secondary">
                            Showing {filtered.length} of {contacts.length}
                        </Typography>
                        {filtersActive && <Button size="small" onClick={resetFilters}>Clear filters</Button>}
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
                )}
            </ToolbarPortal>

            {/* Summary tiles: they scroll away; each one filters the table */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 2, mt: 1, mb: 2 }}>
                {tiles.map(([key, label, n, sub, dot]) => {
                    const active = tileActive(key);
                    return (
                        <ButtonBase
                            key={key}
                            onClick={() => pickTile(key)}
                            aria-pressed={active}
                            sx={{
                                display: 'block', textAlign: 'left', borderRadius: '12px', p: '14px 18px',
                                bgcolor: active ? '#eff6ff' : 'background.paper',
                                border: active ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                ...(active ? {} : { p: '15px 19px' })
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13, fontWeight: 600, color: active ? '#1e3a8a' : '#334155' }}>
                                {dot && <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot }} />}
                                {label}
                            </Box>
                            <Typography component="div" sx={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, mt: 0.25 }}>{n}</Typography>
                            <Typography component="div" variant="caption" color="text.secondary">{sub}</Typography>
                        </ButtonBase>
                    );
                })}
            </Box>

            {loading && <LinearProgress sx={{ mb: 1 }} />}

            {/* clip (not scroll) on wide screens so the header row can pin to the page */}
            <Box sx={{ overflowX: { xs: 'auto', md: 'clip' }, border: '1px solid #e2e8f0', borderRadius: '12px', bgcolor: 'background.paper' }}>
                <Table size="small" sx={{ minWidth: 820, '& .MuiTableBody-root .MuiTableCell-root': { py: 1.25, fontSize: '0.875rem' } }}>
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox" sx={headCell}>
                                <Checkbox
                                    size="small"
                                    checked={allFilteredSelected}
                                    indeterminate={someFilteredSelected && !allFilteredSelected}
                                    onChange={toggleAll}
                                    disabled={filteredIds.length === 0}
                                    inputProps={{ 'aria-label': 'Select all contacts shown' }}
                                />
                            </TableCell>
                            <TableCell sx={headCell}>Name</TableCell>
                            <TableCell sx={headCell}>Phone</TableCell>
                            <TableCell sx={headCell}>Email</TableCell>
                            <TableCell sx={headCell}>Text consent</TableCell>
                            <TableCell sx={headCell}>Last messaged</TableCell>
                            <TableCell sx={headCell}>Added</TableCell>
                            <TableCell sx={headCell} align="right"><Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</Box></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pageRows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8}>
                                    <Typography variant="body2" color="text.secondary">No contacts match your search or filters.</Typography>
                                </TableCell>
                            </TableRow>
                        )}
                        {pageRows.map((contact) => (
                            <TableRow key={contact.id} hover selected={selectedSet.has(contact.id)}>
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        size="small"
                                        checked={selectedSet.has(contact.id)}
                                        onChange={() => toggleOne(contact.id)}
                                        inputProps={{ 'aria-label': `Select ${contact.name}` }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                                        <Avatar sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, bgcolor: '#dbeafe', color: '#1e3a8a' }}>
                                            {initials(contact.name)}
                                        </Avatar>
                                        <Typography component="span" sx={{ fontWeight: 600, fontSize: 'inherit' }}>{contact.name}</Typography>
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    {hasPhone(contact) ? contact.phone : (
                                        <Button size="small" onClick={() => onEditContact(contact)} sx={{ p: 0, minWidth: 0, fontWeight: 600 }}>+ Add phone</Button>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {hasEmail(contact) ? contact.email : (
                                        <Button size="small" onClick={() => onEditContact(contact)} sx={{ p: 0, minWidth: 0, fontWeight: 600 }}>+ Add email</Button>
                                    )}
                                </TableCell>
                                <TableCell><ConsentPill kind={smsStatus(contact)} /></TableCell>
                                <TableCell sx={{ color: 'text.secondary' }}>{contact.last_messaged ? formatDate(contact.last_messaged) : 'Never'}</TableCell>
                                <TableCell sx={{ color: 'text.secondary' }}>{formatDate(contact.created_at)}</TableCell>
                                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                    <Tooltip title="Edit contact">
                                        <IconButton size="small" onClick={() => onEditContact(contact)} aria-label={`Edit ${contact.name}`}>
                                            <FontAwesomeIcon icon={faPen} />
                                        </IconButton>
                                    </Tooltip>
                                    <IconButton size="small" aria-label={`More actions for ${contact.name}`} aria-haspopup="menu" onClick={(e) => setRowMenu({ anchor: e.currentTarget, contact })}>
                                        <FontAwesomeIcon icon={faEllipsisVertical} />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Box>

            <Menu anchorEl={rowMenu && rowMenu.anchor} open={!!rowMenu} onClose={closeRowMenu}>
                <MenuItem onClick={() => { const c = rowMenu.contact; closeRowMenu(); onEditContact(c); }}>Edit</MenuItem>
                <MenuItem sx={{ color: 'error.main' }} onClick={() => { const c = rowMenu.contact; closeRowMenu(); onDeleteContact(c); }}>Delete</MenuItem>
            </Menu>
        </Box>
    );
};

export default ContactsTable;
