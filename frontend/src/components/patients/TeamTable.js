import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Avatar,
    Badge,
    Box,
    Button,
    Chip,
    FormControlLabel,
    IconButton,
    InputAdornment,
    MenuItem,
    Pagination,
    Paper,
    Select,
    Skeleton,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import MessagesButton from '../MessagesButton';
import TeamMemberDrawer from './TeamMemberDrawer';
import {
    TEAM_FILTERS,
    avatarColor,
    canText,
    initials,
    lastActive,
    memberName,
    phoneText,
    rangeText,
    roleColors,
    roleLabel,
    textBlockedReason,
} from './teamHelpers';

const PAGE_SIZES = [10, 25, 50];

function PersonAvatar({ member, size = 36 }) {
    const online = !!member.is_online;
    return (
        <Badge
            overlap="circular"
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            variant="dot"
            sx={{ '& .MuiBadge-badge': { bgcolor: online ? '#16a34a' : '#c9d1dd', border: '2px solid #fff', width: 11, height: 11, borderRadius: '50%' } }}
        >
            <Avatar src={member.profile_picture || undefined} alt="" sx={{ width: size, height: size, bgcolor: avatarColor(member.id), fontSize: size * 0.38, fontWeight: 600 }}>
                {initials(memberName(member))}
            </Avatar>
        </Badge>
    );
}

function RoleChip({ role, compact = false }) {
    const [bg, fg] = roleColors(role);
    return <Chip size="small" label={roleLabel(role)} sx={{ bgcolor: bg, color: fg, fontWeight: 600, ...(compact ? { height: 18, fontSize: 11, '& .MuiChip-label': { px: 1 } } : {}) }} />;
}

// Message, Text and Email for one person. Text is switched off, with the reason, for anyone who
// has not agreed to texts or has no phone number.
function Actions({ member, onMessage, onSendText, onOpenEmailModal, stretch = false }) {
    const stop = (fn) => (e) => {
        e.stopPropagation();
        fn(member);
    };
    const blocked = textBlockedReason(member);
    const name = memberName(member);
    return (
        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: stretch ? 'stretch' : 'flex-end' }} onClick={(e) => e.stopPropagation()}>
            <Button size="small" variant="contained" disableElevation startIcon={<ChatBubbleOutlineIcon fontSize="small" />} onClick={stop(onMessage)} aria-label={`Message ${name}`} sx={{ textTransform: 'none', flex: stretch ? 1 : 'none' }}>
                Message
            </Button>
            <Tooltip title={blocked}>
                <span style={{ display: 'flex', flex: stretch ? 1 : 'none' }}>
                    <Button size="small" variant="outlined" disabled={!!blocked} onClick={stop(onSendText)} aria-label={`Text ${name}`} sx={{ textTransform: 'none', flex: 1 }}>
                        Text
                    </Button>
                </span>
            </Tooltip>
            <Button size="small" variant="outlined" disabled={!member.email} onClick={stop(onOpenEmailModal)} aria-label={`Email ${name}`} sx={{ textTransform: 'none', flex: stretch ? 1 : 'none' }}>
                Email
            </Button>
        </Box>
    );
}

function TeamTable({
    team,
    loadingTeam,
    hasLoadedTeam = true,
    teamSearch,
    setTeamSearch,
    teamRole = 'all',
    setTeamRole = () => {},
    teamOnline = false,
    setTeamOnline = () => {},
    teamPage,
    setTeamPage,
    teamPageSize = 10,
    setTeamPageSize = () => {},
    teamTotalSize = 0,
    teamTotalPages,
    roleCounts = null,
    onSendText,
    onOpenEmailModal,
    onMessage = () => {},
    onOpenMessages,
    totalUnreadCount = 0,
    showOrganization = false,
    title = null,
    backAction = null,
}) {
    const theme = useTheme();
    const narrow = useMediaQuery(theme.breakpoints.down('md'));

    // The search box keeps what is being typed; the list is only asked after a short pause.
    // It stays on screen while the list loads, so typing is never interrupted.
    const [localSearchValue, setLocalSearchValue] = useState(teamSearch || '');
    const searchTimeoutRef = useRef(null);
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        setLocalSearchValue(teamSearch || '');
    }, [teamSearch]);

    const handleSearchInputChange = useCallback(
        (e) => {
            const value = e.target.value;
            setLocalSearchValue(value);
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = setTimeout(() => setTeamSearch(value), 300);
        },
        [setTeamSearch]
    );

    const clearSearch = () => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        setLocalSearchValue('');
        setTeamSearch('');
    };

    useEffect(
        () => () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        },
        []
    );

    const filtering = !!(teamSearch || localSearchValue) || teamRole !== 'all' || teamOnline;
    const clearAll = () => {
        clearSearch();
        setTeamRole('all');
        setTeamOnline(false);
    };

    const firstLoad = loadingTeam && !hasLoadedTeam;
    const total = roleCounts?.all ?? teamTotalSize;
    const onlineCount = roleCounts?.online;
    const dim = loadingTeam && hasLoadedTeam ? 0.6 : 1;

    // Click or Enter opens the details panel. Table rows keep their row role; cards act as buttons.
    const rowHandlers = (member, asButton = false) => ({
        onClick: () => setSelected(member),
        onKeyDown: (e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setSelected(member);
            }
        },
        tabIndex: 0,
        ...(asButton ? { role: 'button' } : {}),
        'aria-label': `Details for ${memberName(member)}`,
    });

    const empty = (
        <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
            <SearchIcon sx={{ fontSize: 34, color: 'text.disabled' }} />
            <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 1 }}>
                {filtering ? (teamSearch ? `No one matches “${teamSearch}”` : 'No one matches these filters') : 'No team members yet'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {filtering ? 'Check the spelling, or try a name, email or phone number.' : 'People you add to your organization will show up here.'}
            </Typography>
            {filtering && (
                <Button variant="outlined" onClick={clearAll}>
                    Clear search and filters
                </Button>
            )}
        </Box>
    );

    const skeletonRows = [0, 1, 2, 3, 4].map((i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: 58, px: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Skeleton variant="circular" width={36} height={36} />
            <Box sx={{ flex: 1 }}>
                <Skeleton width="45%" />
                <Skeleton width="30%" />
            </Box>
            <Skeleton width={70} />
        </Box>
    ));

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, pt: 1, mb: 1, flexWrap: 'wrap', flexShrink: 0 }}>
                {title && (
                    <Typography variant="h5" data-testid="view-title">
                        {title}
                    </Typography>
                )}
                <Typography variant="body2" color="text.secondary" aria-live="polite">
                    {hasLoadedTeam ? (
                        <>
                            {total} {total === 1 ? 'person' : 'people'}
                            {typeof onlineCount === 'number' && (
                                <>
                                    {' · '}
                                    <Box component="span" sx={{ color: '#067647', fontWeight: 600 }}>
                                        {onlineCount} online now
                                    </Box>
                                </>
                            )}
                        </>
                    ) : (
                        'Loading team'
                    )}
                </Typography>
                <Box sx={{ flex: 1 }} />
                {onOpenMessages && <MessagesButton onClick={onOpenMessages} totalUnreadCount={totalUnreadCount} />}
                {backAction}
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, mb: 1, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
                <TextField
                    placeholder="Search by name, email or phone"
                    value={localSearchValue}
                    onChange={handleSearchInputChange}
                    variant="outlined"
                    size="small"
                    sx={{ minWidth: { xs: '100%', sm: 300 } }}
                    inputProps={{ 'aria-label': 'Search team' }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon fontSize="small" />
                            </InputAdornment>
                        ),
                        endAdornment: localSearchValue ? (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={clearSearch} aria-label="Clear search">
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </InputAdornment>
                        ) : null,
                    }}
                />
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: narrow ? 'nowrap' : 'wrap', overflowX: narrow ? 'auto' : 'visible', maxWidth: '100%' }} role="group" aria-label="Filter by role">
                    {TEAM_FILTERS.map((f) => {
                        const count = roleCounts ? roleCounts[f.value] : undefined;
                        const active = teamRole === f.value;
                        return (
                            <Chip
                                key={f.value}
                                clickable
                                onClick={() => setTeamRole(f.value)}
                                aria-pressed={active}
                                color={active ? 'primary' : 'default'}
                                variant={active ? 'filled' : 'outlined'}
                                label={
                                    <span>
                                        {f.label}
                                        {typeof count === 'number' && <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 11 }}>{count}</span>}
                                    </span>
                                }
                            />
                        );
                    })}
                </Box>
                <Box sx={{ flex: 1 }} />
                <FormControlLabel
                    sx={{ m: 0 }}
                    control={<Switch size="small" checked={teamOnline} onChange={(e) => setTeamOnline(e.target.checked)} inputProps={{ 'aria-label': 'Online only' }} />}
                    label={<Typography variant="body2">Online only</Typography>}
                />
            </Box>

            <Box sx={{ opacity: dim, transition: 'opacity 120ms', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {firstLoad ? (
                    <Paper variant="outlined" data-testid="team-skeleton">
                        {skeletonRows}
                    </Paper>
                ) : team.length === 0 ? (
                    <Paper variant="outlined">{empty}</Paper>
                ) : narrow ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {team.map((member) => {
                            const active = lastActive(member);
                            return (
                                <Paper key={member.id} variant="outlined" sx={{ p: 1.75, borderRadius: 3, cursor: 'pointer' }} {...rowHandlers(member, true)}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                                        <PersonAvatar member={member} size={40} />
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant="subtitle2" fontWeight={600} noWrap>
                                                {memberName(member)}
                                            </Typography>
                                            <Box sx={{ mt: 0.25 }}>
                                                <RoleChip role={member.role} />
                                            </Box>
                                        </Box>
                                        <Typography variant="caption" sx={{ color: active.online ? '#067647' : 'text.secondary' }}>
                                            {active.text}
                                        </Typography>
                                    </Box>
                                    <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ mb: 1 }}>
                                        {member.email || 'No email on file'}
                                    </Typography>
                                    <Actions member={member} onMessage={onMessage} onSendText={onSendText} onOpenEmailModal={onOpenEmailModal} stretch />
                                </Paper>
                            );
                        })}
                    </Box>
                ) : (
                    <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, minHeight: 0 }}>
                        <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', minWidth: 680 }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>Person</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Contact</TableCell>
                                    <TableCell sx={{ fontWeight: 700, width: 150 }}>Last active</TableCell>
                                    <TableCell sx={{ width: 250 }} />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {team.map((member) => {
                                    const active = lastActive(member);
                                    const phone = phoneText(member.phone_number);
                                    return (
                                        <TableRow key={member.id} hover sx={{ cursor: 'pointer' }} {...rowHandlers(member)}>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                                                    <PersonAvatar member={member} />
                                                    <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
                                                        <Typography variant="body2" fontWeight={600} noWrap title={memberName(member)} sx={{ maxWidth: '100%' }}>
                                                            {memberName(member)}
                                                        </Typography>
                                                        <RoleChip role={member.role} compact />
                                                        {showOrganization && (
                                                            <Typography variant="caption" color="text.secondary" noWrap component="div">
                                                                {member.organization_name || 'No organization'}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" noWrap title={member.email || ''}>
                                                    {member.email || 'No email on file'}
                                                </Typography>
                                                <Typography variant="caption" color={phone ? 'text.secondary' : 'text.disabled'} component="div" noWrap>
                                                    {phone || 'No phone'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ color: active.online ? '#067647' : 'text.secondary' }}>
                                                    {active.text}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Actions member={member} onMessage={onMessage} onSendText={onSendText} onOpenEmailModal={onOpenEmailModal} />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>

            {hasLoadedTeam && teamTotalSize > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mt: 1, flexShrink: 0 }}>
                    <Typography variant="caption" color="text.secondary" data-testid="team-range">
                        {rangeText(teamPage, teamPageSize, teamTotalSize)}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                        Rows per page
                    </Typography>
                    <Select size="small" value={teamPageSize} onChange={(e) => setTeamPageSize(Number(e.target.value))} inputProps={{ 'aria-label': 'Rows per page' }} sx={{ fontSize: 13 }}>
                        {PAGE_SIZES.map((n) => (
                            <MenuItem key={n} value={n}>
                                {n}
                            </MenuItem>
                        ))}
                    </Select>
                    {teamTotalPages > 1 && (
                        <Pagination count={teamTotalPages} page={teamPage} onChange={(e, newPage) => setTeamPage(newPage)} color="primary" showFirstButton showLastButton size={narrow ? 'small' : 'medium'} />
                    )}
                </Box>
            )}

            <TeamMemberDrawer
                member={selected}
                onClose={() => setSelected(null)}
                onMessage={onMessage}
                onSendText={onSendText}
                onOpenEmailModal={onOpenEmailModal}
                showOrganization={showOrganization}
            />
        </Box>
    );
}

export default TeamTable;
