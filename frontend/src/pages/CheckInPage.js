import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Button, CircularProgress, Container, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import { getValidToken, clearAuthData } from '../utils/auth';
import { API_BASE_URL } from '../config/api';
import BackButton from '../components/BackButton';
import { MIN_CHARS, canSearch, detailText, longDate, patientName, timeText, visibleResults } from '../components/checkin/checkInHelpers';

const ALLOWED_ROLES = ['admin', 'system_admin', 'registrar'];
const RESET_SECONDS = 10;

const CheckInPage = () => {
    const navigate = useNavigate();
    const [token, setToken] = useState(null);
    const [query, setQuery] = useState('');
    const [appointments, setAppointments] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [rowErrors, setRowErrors] = useState({});
    const [arrivedAt, setArrivedAt] = useState({}); // appointment id -> time text, for check-ins made on this screen
    const [done, setDone] = useState(null); // the person who was just checked in
    const latest = useRef(0);

    useEffect(() => {
        const init = async () => {
            try {
                const valid = await getValidToken();
                if (!valid) {
                    clearAuthData();
                    navigate('/login');
                    return;
                }
                setToken(valid);
                const role = jwtDecode(valid).role || '';
                if (!ALLOWED_ROLES.includes(role)) {
                    navigate('/dashboard');
                }
            } catch (err) {
                clearAuthData();
                navigate('/login');
            }
        };
        init();
    }, [navigate]);

    // Ask the server a moment after typing stops, and ignore answers that arrive late.
    useEffect(() => {
        if (!token) return undefined;
        if (!canSearch(query)) {
            latest.current += 1;
            setAppointments([]);
            setSearching(false);
            setSearchError('');
            return undefined;
        }
        const id = ++latest.current;
        const timer = setTimeout(async () => {
            setSearching(true);
            setSearchError('');
            try {
                const res = await axios.get(`${API_BASE_URL}/api/check-in/search/`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { query: query.trim() },
                });
                if (id === latest.current) setAppointments(Array.isArray(res.data) ? res.data : []);
            } catch (err) {
                if (id === latest.current) {
                    setAppointments([]);
                    setSearchError('Could not search right now. Try again, or ask the front desk.');
                }
            } finally {
                if (id === latest.current) setSearching(false);
            }
        }, 250);
        return () => clearTimeout(timer);
    }, [query, token]);

    const startOver = useCallback(() => {
        latest.current += 1;
        setQuery('');
        setAppointments([]);
        setDone(null);
        setRowErrors({});
    }, []);

    // After a check-in, clear the screen for the next person.
    useEffect(() => {
        if (!done) return undefined;
        const timer = setTimeout(startOver, RESET_SECONDS * 1000);
        return () => clearTimeout(timer);
    }, [done, startOver]);

    const setArrived = async (appointment, arrived) => {
        if (!token || busyId) return;
        setBusyId(appointment.id);
        setRowErrors((e) => ({ ...e, [appointment.id]: '' }));
        try {
            const res = await axios.patch(
                `${API_BASE_URL}/api/check-in/update-status/${appointment.id}/`,
                { arrived },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const updated = { ...appointment, ...(res.data || {}), arrived };
            setAppointments((list) => list.map((a) => (a.id === appointment.id ? updated : a)));
            if (arrived) {
                const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                setArrivedAt((m) => ({ ...m, [appointment.id]: at }));
                setDone({ appointment: updated, at });
            } else {
                setArrivedAt((m) => {
                    const next = { ...m };
                    delete next[appointment.id];
                    return next;
                });
                setDone(null);
            }
        } catch (err) {
            const name = patientName(appointment).split(' ')[0];
            setRowErrors((e) => ({
                ...e,
                [appointment.id]: arrived
                    ? `Could not check in ${name}. Nothing was changed. Try again, or ask the front desk.`
                    : `Could not undo the check-in for ${name}. Nothing was changed.`,
            }));
        } finally {
            setBusyId(null);
        }
    };

    const { rows, hidden } = visibleResults(appointments);
    const searched = canSearch(query);
    const showEmpty = searched && !searching && !searchError && appointments.length === 0;

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6f9', py: 2 }}>
            <Container maxWidth="sm">
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 2 }}>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="h4" fontWeight={600} component="h1">
                            Check in
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {longDate()}
                        </Typography>
                    </Box>
                    <BackButton sx={{ mb: 0 }} />
                </Box>

                <TextField
                    fullWidth
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type your first or last name"
                    inputProps={{ 'aria-label': 'Search by name', style: { fontSize: '1.25rem', padding: '16px 4px' } }}
                    sx={{ bgcolor: '#fff', borderRadius: 2, '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                        endAdornment: searching ? (
                            <CircularProgress size={22} />
                        ) : query ? (
                            <IconButton aria-label="Clear search" onClick={startOver} edge="end">
                                <CloseIcon />
                            </IconButton>
                        ) : null,
                    }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2.5 }}>
                    Type at least {MIN_CHARS} letters of your first or last name. Only today's appointments are listed.
                </Typography>

                {searchError && (
                    <Box role="alert" sx={{ p: 1.5, mb: 2, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 2, color: '#991b1b', fontSize: 14 }}>
                        {searchError}
                    </Box>
                )}

                {done && (
                    <Box data-testid="checked-in-card" role="status" sx={{ p: 2, mb: 2, bgcolor: '#f0fdf4', border: '1px solid #a6e3c0', borderRadius: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <CheckCircleIcon sx={{ color: '#16a34a', fontSize: 44 }} />
                            <Box>
                                <Typography variant="h6" fontWeight={600}>
                                    {patientName(done.appointment)} is checked in
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#166534' }}>
                                    {done.at}
                                    {done.appointment.provider_name ? ` · ${done.appointment.provider_name}` : ''} {'·'} please have a seat
                                </Typography>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, mt: 1.5, alignItems: 'center' }}>
                            <Button variant="contained" size="large" onClick={startOver} sx={{ textTransform: 'none', borderRadius: 2 }}>
                                Next person
                            </Button>
                            <Button onClick={() => setArrived(done.appointment, false)} disabled={busyId === done.appointment.id} sx={{ textTransform: 'none' }}>
                                Undo
                            </Button>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            The search clears by itself after {RESET_SECONDS} seconds.
                        </Typography>
                    </Box>
                )}

                {rows.length > 0 && (
                    <>
                        <Typography variant="overline" color="text.secondary" component="div" aria-live="polite">
                            {appointments.length} {appointments.length === 1 ? 'appointment' : 'appointments'} today for &ldquo;{query.trim()}&rdquo;
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                            {rows.map((a) => {
                                const arrived = !!a.arrived;
                                const busy = busyId === a.id;
                                const first = patientName(a);
                                return (
                                    <Box key={a.id} data-testid="checkin-row" sx={{ p: 1.75, bgcolor: arrived ? '#f0fdf4' : '#fff', border: '1px solid', borderColor: arrived ? '#a6e3c0' : '#dfe4ec', borderRadius: 3 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                                            <Typography sx={{ width: 84, flex: 'none', fontWeight: 600 }}>{timeText(a.appointment_datetime)}</Typography>
                                            <Box sx={{ flex: 1, minWidth: 160 }}>
                                                <Typography variant="h6" fontWeight={600} sx={{ lineHeight: 1.25 }}>
                                                    {first}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {arrived && (
                                                        <Box component="span" sx={{ color: '#067647', fontWeight: 600 }}>
                                                            {'✓'} Checked in{arrivedAt[a.id] ? ` at ${arrivedAt[a.id]}` : ''}
                                                            {detailText(a) ? ' · ' : ''}
                                                        </Box>
                                                    )}
                                                    {detailText(a)}
                                                </Typography>
                                            </Box>
                                            {arrived ? (
                                                <Button onClick={() => setArrived(a, false)} disabled={busy} aria-label={`Undo check-in for ${first}`} sx={{ textTransform: 'none' }}>
                                                    Undo
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="contained"
                                                    size="large"
                                                    onClick={() => setArrived(a, true)}
                                                    disabled={!!busyId}
                                                    aria-label={`Check in ${first}`}
                                                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
                                                    sx={{ textTransform: 'none', borderRadius: 2.5, minWidth: 132, minHeight: 48, fontWeight: 600, fontSize: 16 }}
                                                >
                                                    {busy ? 'Checking in' : 'Check in'}
                                                </Button>
                                            )}
                                        </Box>
                                        {rowErrors[a.id] && (
                                            <Box role="alert" sx={{ mt: 1.25, p: 1.25, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 2, color: '#991b1b', fontSize: 13 }}>
                                                {rowErrors[a.id]}
                                            </Box>
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>
                        {hidden > 0 && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                                {hidden} more {hidden === 1 ? 'match' : 'matches'}. Type more of the name to narrow the list.
                            </Typography>
                        )}
                    </>
                )}

                {showEmpty && (
                    <Box sx={{ textAlign: 'center', py: 5, px: 2, bgcolor: '#fff', border: '1px solid #dfe4ec', borderRadius: 3 }}>
                        <Typography variant="h6" fontWeight={600}>
                            No appointment found for &ldquo;{query.trim()}&rdquo; today
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                            Check the spelling, or ask the front desk. Only today's appointments are listed.
                        </Typography>
                    </Box>
                )}
            </Container>
        </Box>
    );
};

export default CheckInPage;
