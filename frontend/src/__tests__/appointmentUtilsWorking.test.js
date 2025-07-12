// Test for actual appointment utilities
import {
    checkAvailabilityConflict,
    isDateBlocked,
    formatAvailableSlots
} from '../utils/appointment/appointmentUtils';

describe('appointmentUtils', () => {
    describe('checkAvailabilityConflict', () => {
        it('should return false when no doctor ID provided', () => {
            const startDate = new Date('2025-07-15T10:00:00Z');
            const result = checkAvailabilityConflict(startDate, 60, null, []);

            expect(result).toBe(false);
        });

        it('should return false when no start date provided', () => {
            const result = checkAvailabilityConflict(null, 60, 1, []);

            expect(result).toBe(false);
        });

        it('should return false when no duration provided', () => {
            const startDate = new Date('2025-07-15T10:00:00Z');
            const result = checkAvailabilityConflict(startDate, null, 1, []);

            expect(result).toBe(false);
        });

        it('should return false when invalid date provided', () => {
            const invalidDate = new Date('invalid');
            const result = checkAvailabilityConflict(invalidDate, 60, 1, []);

            expect(result).toBe(false);
        });
    });

    describe('isDateBlocked', () => {
        it('should return object with isBlocked false when no blocked days or holidays', () => {
            const result = isDateBlocked('2025-07-15', [], []);

            expect(result).toHaveProperty('isBlocked');
            expect(result.isBlocked).toBe(false);
        });

        it('should return object with isBlocked true when date is in blocked days', () => {
            const blockedDays = ['2025-07-15', '2025-07-16'];
            const result = isDateBlocked('2025-07-15', blockedDays, []);

            expect(result).toHaveProperty('isBlocked');
            expect(result.isBlocked).toBe(true);
            expect(result.isBlockedDay).toBe(true);
        });

        it('should return object with isBlocked false when date is not blocked', () => {
            const blockedDays = ['2025-07-15', '2025-07-16'];
            const result = isDateBlocked('2025-07-20', blockedDays, []);

            expect(result).toHaveProperty('isBlocked');
            expect(result.isBlocked).toBe(false);
        });

        it('should handle holidays correctly', () => {
            const holidays = [
                { date: '2025-07-04', name: 'Independence Day' },
                { date: '2025-12-25', name: 'Christmas' }
            ];
            const result = isDateBlocked('2025-07-04', [], holidays);

            expect(result).toHaveProperty('isBlocked');
            expect(result.isBlocked).toBe(true);
            expect(result.isHoliday).toBe(true);
        });
    });

    describe('formatAvailableSlots', () => {
        it('should handle empty array', () => {
            const result = formatAvailableSlots([]);

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });

        it('should handle array of time slots', () => {
            const slots = ['10:00', '14:00', '16:00'];
            const result = formatAvailableSlots(slots);

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(3);
        });

        it('should return an array', () => {
            const slots = ['10:00'];
            const result = formatAvailableSlots(slots);

            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('Input validation helpers', () => {
        it('should validate that dates are Date objects', () => {
            const isValidDate = (date) => date instanceof Date && !isNaN(date.getTime());

            expect(isValidDate(new Date())).toBe(true);
            expect(isValidDate(new Date('2025-07-15'))).toBe(true);
            expect(isValidDate(new Date('invalid'))).toBe(false);
            expect(isValidDate('2025-07-15')).toBe(false);
            expect(isValidDate(null)).toBe(false);
        });

        it('should validate positive duration', () => {
            const isValidDuration = (duration) =>
                typeof duration === 'number' && duration > 0 && Number.isInteger(duration);

            expect(isValidDuration(30)).toBe(true);
            expect(isValidDuration(60)).toBe(true);
            expect(isValidDuration(0)).toBe(false);
            expect(isValidDuration(-30)).toBe(false);
            expect(isValidDuration(30.5)).toBe(false);
            expect(isValidDuration('30')).toBe(false);
        });
    });
});
