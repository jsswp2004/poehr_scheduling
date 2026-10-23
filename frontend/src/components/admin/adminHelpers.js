// Pure helpers for the Management Portal.

export const TOOL_GROUPS = [
    { id: 'daily', label: 'Daily work', color: '#1d4ed8', tint: '#e8efff' },
    { id: 'build', label: 'Build and configure', color: '#4338ca', tint: '#eceafe' },
    { id: 'facility', label: 'Facility and account', color: '#475569', tint: '#eef1f6' },
];

export const ROLE_LABELS = {
    admin: 'Administrator',
    system_admin: 'System administrator',
    registrar: 'Registrar',
};

export function roleLabel(role) {
    return ROLE_LABELS[role] || '';
}

// Tools whose name or description contains every word typed.
export function filterTools(tools, query) {
    const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return tools;
    return tools.filter((t) => {
        const hay = `${t.label} ${t.description || ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
    });
}

// [{ group, tools }] in group order, leaving out groups with no tools.
export function groupTools(tools) {
    return TOOL_GROUPS.map((group) => ({ group, tools: tools.filter((t) => t.group === group.id) })).filter((g) => g.tools.length > 0);
}
