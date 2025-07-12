import {
    checkAvailabilityConflict,
    validateAppointmentForm,
    prepareAppointmentPayload,
    isDateBlocked,
    formatDateForAPI,
    parseAPIDate
} from '../appointment/appointmentUtils';

describe('appointmentUtils', () => {
    describe('checkAvailabilityConflict', () => {
        const mockProviderBlocks = [
            {
                start: new Date('2025-07-15T10:00:00Z'),
                end: new Date('2025-07-15T12:00:00Z'),
                doctor_id: 1
            },
            {
                start: new Date('2025-07-15T14:00:00Z'),
                end: new Date('2025-07-15T16:00:00Z'),
                doctor_id: 1
            }
        ];

        it('should return false when no conflict exists', () => {
            const startDate = new Date('2025-07-15T08:00:00Z');
            const result = checkAvailabilityConflict(startDate, 60, 1, mockProviderBlocks);

            expect(result).toBe(false);
        });

        it('should return true when appointment conflicts with blocked time', () => {
            const startDate = new Date('2025-07-15T10:30:00Z');
            const result = checkAvailabilityConflict(startDate, 60, 1, mockProviderBlocks);

            expect(result).toBe(true);
        });

        it('should return false when required parameters are missing', () => {
            expect(checkAvailabilityConflict(null, 60, 1, mockProviderBlocks)).toBe(false);
            expect(checkAvailabilityConflict(new Date(), null, 1, mockProviderBlocks)).toBe(false);
            expect(checkAvailabilityConflict(new Date(), 60, null, mockProviderBlocks)).toBe(false);
        });

        it('should handle edit mode correctly for unchanged appointments', () => {
            const startDate = new Date('2025-07-15T10:00:00Z');
            const appointmentToEdit = {
                appointment_datetime: '2025-07-15T10:00:00Z',
                duration_minutes: 60
            };

            const result = checkAvailabilityConflict(
                startDate,
                60,
                1,
                mockProviderBlocks,
                true,
                appointmentToEdit
            );

            expect(result).toBe(false);
        });

        it('should check conflicts in edit mode when time changes', () => {
            const startDate = new Date('2025-07-15T10:30:00Z'); // Changed time
            const appointmentToEdit = {
                appointment_datetime: '2025-07-15T10:00:00Z',
                duration_minutes: 60
            };

            const result = checkAvailabilityConflict(
                startDate,
                60,
                1,
                mockProviderBlocks,
                true,
                appointmentToEdit
            );

            expect(result).toBe(true);
        });
    });

    describe('validateAppointmentForm', () => {
        const validFormData = {
            title: 'Test Appointment',
            appointment_datetime: '2025-07-15T10:00:00Z',
            duration_minutes: 30,
            description: 'Test description'
        };

        it('should return valid for complete form data', () => {
            const result = validateAppointmentForm(validFormData, 'admin');

            expect(result.isValid).toBe(true);
            expect(result.errors).toEqual({});
        });

        it('should return errors for missing required fields', () => {
            const invalidFormData = {
                title: '',
                appointment_datetime: '',
                duration_minutes: null
            };

            const result = validateAppointmentForm(invalidFormData, 'admin');

            expect(result.isValid).toBe(false);
            expect(result.errors.title).toBeDefined();
            expect(result.errors.appointment_datetime).toBeDefined();
        });

        it('should validate duration is positive', () => {
            const formData = {
                ...validFormData,
                duration_minutes: -30
            };

            const result = validateAppointmentForm(formData, 'admin');

            expect(result.isValid).toBe(false);
            expect(result.errors.duration_minutes).toBeDefined();
        });

        it('should validate appointment is in the future', () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);

            const formData = {
                ...validFormData,
                appointment_datetime: pastDate.toISOString()
            };

            const result = validateAppointmentForm(formData, 'user');

            expect(result.isValid).toBe(false);
            expect(result.errors.appointment_datetime).toBeDefined();
        });

        it('should allow admins to schedule past appointments', () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);

            const formData = {
                ...validFormData,
                appointment_datetime: pastDate.toISOString()
            };

            const result = validateAppointmentForm(formData, 'admin');

            expect(result.isValid).toBe(true);
        });
    });

    describe('prepareAppointmentPayload', () => {
        const formData = {
            title: 'Test Appointment',
            description: 'Test description',
            appointment_datetime: '2025-07-15T10:00:00Z',
            duration_minutes: 30,
            recurrence: 'weekly',
            recurrence_end_date: '2025-08-15'
        };

        it('should prepare payload for new appointment', () => {
            const result = prepareAppointmentPayload(formData, 123, false, 'admin');

            expect(result).toEqual({
                title: 'Test Appointment',
                description: 'Test description',
                appointment_datetime: '2025-07-15T10:00:00Z',
                duration_minutes: 30,
                recurrence: 'weekly',
                recurrence_end_date: '2025-08-15',
                patient_id: 123
            });
        });

        it('should prepare payload for edit mode', () => {
            const result = prepareAppointmentPayload(formData, 123, true, 'admin');

            expect(result).toEqual({
                title: 'Test Appointment',
                description: 'Test description',
                appointment_datetime: '2025-07-15T10:00:00Z',
                duration_minutes: 30,
                recurrence: 'weekly',
                recurrence_end_date: '2025-08-15'
            });
        });

        it('should exclude recurrence fields when recurrence is none', () => {
            const formDataNoRecurrence = {
                ...formData,
                recurrence: 'none'
            };

            const result = prepareAppointmentPayload(formDataNoRecurrence, 123, false, 'admin');

            expect(result.recurrence).toBeUndefined();
            expect(result.recurrence_end_date).toBeUndefined();
        });
    });

    describe('isDateBlocked', () => {
        const blockedDays = ['2025-07-15', '2025-07-16'];
        const holidays = [
            { date: '2025-07-04', name: 'Independence Day' },
            { date: '2025-12-25', name: 'Christmas' }
        ];

        it('should return true for blocked days', () => {
            expect(isDateBlocked('2025-07-15', blockedDays, holidays)).toBe(true);
        });

        it('should return true for holidays', () => {
            expect(isDateBlocked('2025-07-04', blockedDays, holidays)).toBe(true);
        });

        it('should return false for available days', () => {
            expect(isDateBlocked('2025-07-20', blockedDays, holidays)).toBe(false);
        });

        it('should handle empty arrays', () => {
            expect(isDateBlocked('2025-07-20', [], [])).toBe(false);
        });
    });

    describe('formatDateForAPI', () => {
        it('should format date correctly for API', () => {
            const date = new Date('2025-07-15T10:30:00Z');
            const result = formatDateForAPI(date);

            expect(result).toBe('2025-07-15T10:30:00.000Z');
        });

        it('should handle null input', () => {
            expect(formatDateForAPI(null)).toBeNull();
        });

        it('should handle invalid date', () => {
            expect(formatDateForAPI(new Date('invalid'))).toBeNull();
        });
    });

    describe('parseAPIDate', () => {
        it('should parse API date string correctly', () => {
            const result = parseAPIDate('2025-07-15T10:30:00Z');

            expect(result).toBeInstanceOf(Date);
            expect(result.getFullYear()).toBe(2025);
            expect(result.getMonth()).toBe(6); // July (0-indexed)
            expect(result.getDate()).toBe(15);
        });

        it('should handle null input', () => {
            expect(parseAPIDate(null)).toBeNull();
        });

        it('should handle invalid date string', () => {
            expect(parseAPIDate('invalid-date')).toBeNull();
        });
    });
});
