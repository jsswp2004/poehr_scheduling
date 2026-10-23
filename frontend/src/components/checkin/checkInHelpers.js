// Pure helpers for the Check-in page.

export const MIN_CHARS = 2;
export const MAX_RESULTS = 6;

export function patientName(appointment) {
    if (!appointment) return 'Unknown patient';
    if (appointment.patient_name && appointment.patient_name.trim()) return appointment.patient_name.trim();
    const p = appointment.patient;
    if (p && typeof p === 'object') {
        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        if (name) return name;
    }
    return 'Unknown patient';
}

export function timeText(datetime) {
    if (!datetime) return '-';
    const d = new Date(datetime);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// "Dr. Priya Patel · Riverside Family › Family Medicine", with whatever parts exist.
export function detailText(appointment) {
    return [appointment?.provider_name, appointment?.unit_name].filter(Boolean).join(' · ');
}

export function canSearch(query) {
    return (query || '').trim().length >= MIN_CHARS;
}

// Oldest first, without touching the list that was passed in. Returns the rows to show and how many were left out.
export function visibleResults(appointments, max = MAX_RESULTS) {
    const sorted = [...(appointments || [])].sort((a, b) => new Date(a.appointment_datetime) - new Date(b.appointment_datetime));
    return { rows: sorted.slice(0, max), hidden: Math.max(0, sorted.length - max) };
}

export function longDate(now = new Date()) {
    return now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
