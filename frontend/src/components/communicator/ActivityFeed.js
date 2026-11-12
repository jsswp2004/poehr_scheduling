import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Alert,
    Box,
    ButtonBase,
    LinearProgress,
    Paper,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from '@mui/material';
import { API_BASE_URL } from '../../config/api';

const TYPES = ['sms', 'email', 'webhook']; // webhook = replies from contacts
const DAYS = 90;

const whenText = (d) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;

const pill = (bg, fg) => ({ display: 'inline-block', px: 1.25, py: 0.25, borderRadius: 999, bgcolor: bg, color: fg, fontSize: 11, fontWeight: 600 });

/**
 * Sent messages and replies as one feed. Each send is shown once with everyone it went to (the log stores one row
 * per recipient, so rows with the same message at the same minute are grouped). Pick an item on the left to read it.
 */
const ActivityFeed = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [view, setView] = useState('all'); // all | sent | replies
    const [search, setSearch] = useState('');
    const [selectedKey, setSelectedKey] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('access_token');
            const since = new Date(Date.now() - DAYS * 86400000).toISOString().split('T')[0];
            const results = await Promise.all(
                TYPES.map(async (t) => {
                    const res = await axios.get(
                        `${API_BASE_URL}/api/communicator/logs/?message_type=${t}&created_at__gte=${since}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    const rows = Array.isArray(res.data) ? res.data : res.data.results || [];
                    return rows.map((l) => ({ ...l, _type: t }));
                })
            );
            setLogs(results.flat());
        } catch (err) {
            console.error('Failed to load activity', err);
            setError('Could not load activity. Please try again.');
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const items = useMemo(() => {
        const groups = new Map();
        const out = [];
        logs.forEach((l) => {
            const when = new Date(l.created_at);
            if (l._type === 'webhook') {
                out.push({ key: `r${l.id}`, kind: 'reply', title: l.recipient, body: l.body || '', when, org: l.organization_name, recipients: [] });
                return;
            }
            const key = [l._type, l.subject || '', l.body || '', String(l.created_at).slice(0, 16)].join('|');
            let g = groups.get(key);
            if (!g) {
                g = {
                    key, kind: 'sent', channel: l._type === 'sms' ? 'Text' : 'Email', subject: l.subject || '',
                    body: l.body || '', when, org: l.organization_name, recipients: [],
                    sentBy: typeof l.sent_by === 'string' ? l.sent_by : ''
                };
                groups.set(key, g);
                out.push(g);
            }
            g.recipients.push(l.recipient);
        });
        return out.sort((a, b) => b.when - a.when);
    }, [logs]);

    const replyCount = items.filter((i) => i.kind === 'reply').length;
    const term = search.trim().toLowerCase();
    const shown = items.filter((i) => {
        if (view === 'sent' && i.kind !== 'sent') return false;
        if (view === 'replies' && i.kind !== 'reply') return false;
        if (!term) return true;
        return [i.title, i.body, i.subject, ...(i.recipients || [])].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
    const selected = shown.find((i) => i.key === selectedKey) || shown[0];

    return (
        <Box>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1, mb: 2 }}>
                <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => v && setView(v)} aria-label="Show">
                    <ToggleButton value="all" sx={{ textTransform: 'none', px: 2 }}>All</ToggleButton>
                    <ToggleButton value="sent" sx={{ textTransform: 'none', px: 2 }}>Sent</ToggleButton>
                    <ToggleButton value="replies" sx={{ textTransform: 'none', px: 2 }}>Replies {replyCount}</ToggleButton>
                </ToggleButtonGroup>
                <TextField
                    size="small"
                    placeholder="Search messages or people"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    inputProps={{ 'aria-label': 'Search activity' }}
                    sx={{ minWidth: 240, flex: '1 1 240px', maxWidth: 360 }}
                />
                <Typography variant="body2" color="text.secondary">Last {DAYS} days</Typography>
            </Stack>

            {loading && <LinearProgress sx={{ mb: 1 }} />}
            {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

            {!loading && !error && shown.length === 0 ? (
                <Paper variant="outlined" sx={{ py: 7, textAlign: 'center', borderRadius: '12px' }}>
                    <Typography variant="h6" component="h2">{items.length === 0 ? 'Nothing sent yet' : 'Nothing matches'}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {items.length === 0
                            ? `Messages you send and replies you get will show up here.`
                            : 'Try a different search or filter.'}
                    </Typography>
                </Paper>
            ) : (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, alignItems: 'flex-start' }}>
                    {/* Feed */}
                    <Paper variant="outlined" component="ul" aria-label="Messages" sx={{ flex: '1 1 400px', maxWidth: 460, m: 0, p: 0, listStyle: 'none', borderRadius: '12px', overflow: 'hidden', maxHeight: 640, overflowY: 'auto' }}>
                        {shown.map((i) => {
                            const active = selected && selected.key === i.key;
                            return (
                                <li key={i.key}>
                                    <ButtonBase
                                        onClick={() => setSelectedKey(i.key)}
                                        aria-current={active ? 'true' : undefined}
                                        sx={{ display: 'block', width: '100%', textAlign: 'left', px: 2.25, py: 1.75, borderBottom: '1px solid #eef2f7', bgcolor: active ? '#eff6ff' : 'background.paper' }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                            <Typography sx={{ fontWeight: 600, fontSize: 14, flex: 1, minWidth: 0 }} noWrap>
                                                {i.kind === 'reply' ? i.title : `Sent to ${people(i.recipients.length)}`}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{whenText(i.when)}</Typography>
                                        </Box>
                                        <Typography sx={{ mt: 0.5, fontSize: 13, lineHeight: 1.45, color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {i.kind === 'sent' && i.subject ? `${i.subject}: ` : ''}{i.body}
                                        </Typography>
                                        <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
                                            {i.kind === 'reply'
                                                ? <Box component="span" sx={pill('#dbeafe', '#1e3a8a')}>Reply</Box>
                                                : <Box component="span" sx={pill('#f1f5f9', '#334155')}>{i.channel}</Box>}
                                        </Stack>
                                    </ButtonBase>
                                </li>
                            );
                        })}
                    </Paper>

                    {/* Detail */}
                    {selected && (
                        <Paper variant="outlined" component="section" aria-label="Message detail" sx={{ flex: '999 1 520px', minWidth: 0, p: 3, borderRadius: '12px' }}>
                            <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.secondary' }}>
                                {selected.kind === 'reply' ? 'Reply' : selected.channel === 'Text' ? 'Text message' : 'Email'}
                            </Typography>
                            <Typography variant="h6" component="h2" sx={{ mt: 0.25 }}>
                                {selected.kind === 'reply' ? `From ${selected.title}` : `Sent to ${people(selected.recipients.length)}`}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {whenText(selected.when)}{selected.sentBy ? ` · Sent by ${selected.sentBy}` : ''}{selected.org ? ` · ${selected.org}` : ''}
                            </Typography>

                            <Box sx={{ mt: 2, p: 2, borderRadius: '12px', bgcolor: '#f1f5f9', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {selected.subject && <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.75 }}>{selected.subject}</Typography>}
                                {selected.body}
                            </Box>

                            {selected.kind === 'sent' && (
                                <>
                                    <Typography variant="subtitle2" component="h3" sx={{ mt: 3, mb: 1, fontWeight: 700 }}>
                                        Recipients ({selected.recipients.length})
                                    </Typography>
                                    <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', border: '1px solid #e2e8f0', borderRadius: '10px', maxHeight: 280, overflowY: 'auto' }}>
                                        {selected.recipients.map((r, idx) => (
                                            <Box component="li" key={`${r}-${idx}`} sx={{ px: 2, py: 1.1, fontSize: 14, borderBottom: idx === selected.recipients.length - 1 ? 0 : '1px solid #eef2f7' }}>
                                                {r}
                                            </Box>
                                        ))}
                                    </Box>
                                </>
                            )}
                        </Paper>
                    )}
                </Box>
            )}
        </Box>
    );
};

export default ActivityFeed;
