import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import {
    FaTools,
    FaCalendarCheck,
    FaUserCog,
    FaSearch,
    FaEnvelope,
    FaClipboardList,
    FaClipboardCheck,
    FaTable,
    FaHospital,
    FaColumns,
    FaHeartbeat,
    FaUserCheck,
} from 'react-icons/fa';
import { groupTools } from './adminHelpers';

const ICONS = {
    FaCalendarCheck,
    FaTools,
    FaUserCog,
    FaSearch,
    FaEnvelope,
    FaClipboardList,
    FaTable,
    FaClipboardCheck,
    FaHospital,
    FaColumns,
    FaHeartbeat,
    FaUserCheck,
};

function ToolCard({ item, group, onNavigate }) {
    const Icon = ICONS[item.icon];
    return (
        <ButtonBase
            onClick={() => onNavigate(item.path)}
            focusRipple
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 1.5,
                textAlign: 'left',
                minHeight: 76,
                px: 1.75,
                py: 1.5,
                bgcolor: '#fff',
                border: '1px solid #dfe4ec',
                borderRadius: 2.5,
                transition: 'border-color 120ms, box-shadow 120ms',
                '&:hover, &:focus-visible': { borderColor: group.color, boxShadow: '0 2px 8px rgba(29,78,216,.15)' },
            }}
        >
            <Box sx={{ width: 40, height: 40, borderRadius: 2.5, bgcolor: group.tint, color: group.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                {Icon ? <Icon size={19} aria-hidden="true" /> : null}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle2" fontWeight={600} component="div">
                    {item.label}
                    {item.isNew && (
                        <Box component="span" sx={{ ml: 1, px: 0.9, py: 0.1, borderRadius: 2, bgcolor: '#dcfce7', color: '#166534', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>
                            NEW
                        </Box>
                    )}
                </Typography>
                {item.description && (
                    <Typography variant="caption" color="text.secondary" component="div">
                        {item.description}
                    </Typography>
                )}
            </Box>
        </ButtonBase>
    );
}

/**
 * AdminNavGrid
 * The tools the person may open, in labeled groups. Each card is one button.
 */
const AdminNavGrid = ({ navItems, onNavigate }) => {
    const groups = groupTools(navItems);
    return (
        <Box>
            {groups.map(({ group, tools }) => (
                <Box key={group.id} component="section" aria-label={group.label} sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.25 }}>
                        <Typography variant="overline" fontWeight={700} sx={{ color: group.color, lineHeight: 1.4 }}>
                            {group.label}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                            {tools.length}
                        </Typography>
                        <Box sx={{ flex: 1, height: 1, bgcolor: '#dfe4ec' }} />
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 1.5 }}>
                        {tools.map((item) => (
                            <ToolCard key={item.id} item={item} group={group} onNavigate={onNavigate} />
                        ))}
                    </Box>
                </Box>
            ))}
        </Box>
    );
};

export default AdminNavGrid;
