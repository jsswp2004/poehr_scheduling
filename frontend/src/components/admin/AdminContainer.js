import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import AdminNavGrid from './AdminNavGrid';
import { filterTools, roleLabel } from './adminHelpers';

/**
 * AdminContainer
 * Management Portal layout: title, a "Find a tool" box, and the tools in groups.
 */
const AdminContainer = ({ userRole, loading, visibleNavItems, handleNavigate }) => {
    const [query, setQuery] = useState('');
    const inputRef = useRef(null);

    // "/" jumps to the search box, unless the person is already typing somewhere.
    useEffect(() => {
        const onKey = (e) => {
            const tag = (e.target && e.target.tagName) || '';
            if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !e.target.isContentEditable) {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    const shown = filterTools(visibleNavItems, query);
    const searching = query.trim().length > 0;
    const role = roleLabel(userRole);

    return (
        <Box sx={{ width: '100%', maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 4 }, pt: 2, pb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
                <Box sx={{ flex: 1, minWidth: 220 }}>
                    <Typography variant="h5" component="h1" fontWeight={600}>
                        Management Portal
                    </Typography>
                    {role && (
                        <Typography variant="body2" color="text.secondary">
                            Signed in as {role}
                        </Typography>
                    )}
                </Box>
                <TextField
                    inputRef={inputRef}
                    size="small"
                    placeholder="Find a tool"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setQuery('');
                    }}
                    inputProps={{ 'aria-label': 'Find a tool' }}
                    sx={{ width: { xs: '100%', sm: 300 }, bgcolor: '#fff' }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon fontSize="small" />
                            </InputAdornment>
                        ),
                        endAdornment: query ? (
                            <IconButton size="small" aria-label="Clear search" onClick={() => setQuery('')}>
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        ) : null,
                    }}
                />
            </Box>

            {searching && shown.length > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }} aria-live="polite">
                    {shown.length} {shown.length === 1 ? 'tool matches' : 'tools match'} &ldquo;{query.trim()}&rdquo;
                </Typography>
            )}

            {shown.length > 0 ? (
                <AdminNavGrid navItems={shown} onNavigate={handleNavigate} />
            ) : (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                        {searching ? `No tool matches “${query.trim()}”` : 'No tools are available for your role'}
                    </Typography>
                    {searching && (
                        <Button onClick={() => setQuery('')} sx={{ mt: 1, textTransform: 'none' }}>
                            Clear search
                        </Button>
                    )}
                </Box>
            )}
        </Box>
    );
};

export default AdminContainer;
