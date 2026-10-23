import { MAX_RESULTS, canSearch, detailText, patientName, timeText, visibleResults } from '../checkInHelpers';

describe('checkInHelpers', () => {
    test('patientName prefers patient_name, then the nested patient, then a fallback', () => {
        expect(patientName({ patient_name: ' Maria Gonzalez ' })).toBe('Maria Gonzalez');
        expect(patientName({ patient: { first_name: 'Ann', last_name: 'Lee' } })).toBe('Ann Lee');
        expect(patientName({ patient: 7 })).toBe('Unknown patient');
        expect(patientName(null)).toBe('Unknown patient');
    });

    test('timeText copes with missing and bad values', () => {
        expect(timeText(null)).toBe('-');
        expect(timeText('not a date')).toBe('-');
        expect(timeText('2026-10-23T09:30:00')).toMatch(/9:30/);
    });

    test('detailText joins the provider and place that exist', () => {
        expect(detailText({ provider_name: 'Dr. Priya Patel', unit_name: 'Clinic' })).toBe('Dr. Priya Patel · Clinic');
        expect(detailText({ provider_name: 'Dr. Priya Patel' })).toBe('Dr. Priya Patel');
        expect(detailText({})).toBe('');
    });

    test('canSearch needs two letters, ignoring spaces', () => {
        expect(canSearch('m')).toBe(false);
        expect(canSearch(' m ')).toBe(false);
        expect(canSearch('ma')).toBe(true);
        expect(canSearch(undefined)).toBe(false);
    });

    test('visibleResults sorts by time, caps the list and does not change the input', () => {
        const list = Array.from({ length: 8 }, (_, i) => ({ id: i, appointment_datetime: `2026-10-23T${String(17 - i).padStart(2, '0')}:00:00` }));
        const copy = [...list];
        const { rows, hidden } = visibleResults(list);
        expect(rows).toHaveLength(MAX_RESULTS);
        expect(hidden).toBe(2);
        expect(rows[0].id).toBe(7);
        expect(list).toEqual(copy);
    });
});
