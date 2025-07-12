import { renderHook, act } from '@testing-library/react';
import { useAppointmentFormData } from '../appointment-form/useAppointmentFormData';
import { jwtDecode } from 'jwt-decode';

// Mock dependencies
jest.mock('jwt-decode');
jest.mock('../../utils/appointment/appointmentUtils', () => ({
    validateAppointmentForm: jest.fn(),
    prepareAppointmentPayload: jest.fn(),
    isDateBlocked: jest.fn(),
    checkAvailabilityConflict: jest.fn(),
}));

import {
    validateAppointmentForm,
    prepareAppointmentPayload,
    isDateBlocked,
    checkAvailabilityConflict
} from '../../utils/appointment/appointmentUtils';

describe('useAppointmentFormData Hook', () => {
    const mockToken = 'mock.jwt.token';
    const mockDecodedToken = {
        user_id: 1,
        username: 'testuser',
        is_admin: true,
        role: 'admin'
    };

    const mockClinicEvents = [
        { id: 1, title: 'Event 1', date: '2025-07-15T10:00:00Z' },
        { id: 2, title: 'Event 2', date: '2025-07-16T14:00:00Z' }
    ];

    const mockAppointmentToEdit = {
        id: 1,
        title: 'Test Appointment',
        description: 'Test Description',
        appointment_datetime: '2025-07-15T10:00:00Z',
        duration_minutes: 60,
        recurrence: 'weekly',
        recurrence_end_date: '2025-08-15'
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock localStorage
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: jest.fn().mockReturnValue(mockToken),
            },
            writable: true,
        });

        jwtDecode.mockReturnValue(mockDecodedToken);
        validateAppointmentForm.mockReturnValue({ isValid: true, errors: {} });
        prepareAppointmentPayload.mockReturnValue({});
        isDateBlocked.mockReturnValue(false);
        checkAvailabilityConflict.mockReturnValue(false);
    });

    describe('Initial State', () => {
        it('should initialize with default form data', () => {
            const { result } = renderHook(() =>
                useAppointmentFormData(null, false, null, mockClinicEvents)
            );

            expect(result.current.formData).toEqual({
                title: '',
                description: '',
                appointment_datetime: '',
                duration_minutes: 30,
                recurrence: 'none',
                recurrence_end_date: '',
            });
            expect(result.current.selectedClinicEvent).toBeNull();
        });

        it('should initialize with edit data when in edit mode', () => {
            const { result } = renderHook(() =>
                useAppointmentFormData(mockAppointmentToEdit, true, null, mockClinicEvents)
            );

            expect(result.current.formData).toEqual({
                title: 'Test Appointment',
                description: 'Test Description',
                appointment_datetime: '2025-07-15T10:00:00Z',
                duration_minutes: 60,
                recurrence: 'weekly',
                recurrence_end_date: '2025-08-15',
            });
        });

        it('should decode JWT token on initialization', () => {
            renderHook(() =>
                useAppointmentFormData(null, false, null, mockClinicEvents)
            );

            expect(jwtDecode).toHaveBeenCalledWith(mockToken);
        });
    });

    describe('Form Data Updates', () => {
        it('should update form data correctly', () => {
            const { result } = renderHook(() =>
                useAppointmentFormData(null, false, null, mockClinicEvents)
            );

            act(() => {
                result.current.handleInputChange('title', 'New Appointment');
            });

            expect(result.current.formData.title).toBe('New Appointment');
        });

        it('should update multiple fields independently', () => {
            const { result } = renderHook(() =>
                useAppointmentFormData(null, false, null, mockClinicEvents)
            );

            act(() => {
                result.current.handleInputChange('title', 'New Title');
                result.current.handleInputChange('duration_minutes', 45);
                result.current.handleInputChange('recurrence', 'daily');
            });

            expect(result.current.formData).toEqual({
                title: 'New Title',
                description: '',
                appointment_datetime: '',
                duration_minutes: 45,
                recurrence: 'daily',
                recurrence_end_date: '',
            });
        });
    });

    describe('Clinic Event Selection', () => {
        it('should handle clinic event selection', () => {
            const { result } = renderHook(() =>
                useAppointmentFormData(null, false, null, mockClinicEvents)
            );

            act(() => {
                result.current.handleClinicEventSelect(mockClinicEvents[0]);
            });

            expect(result.current.selectedClinicEvent).toEqual(mockClinicEvents[0]);
        });

        it('should clear clinic event selection', () => {
            const { result } = renderHook(() =>
                useAppointmentFormData(null, false, null, mockClinicEvents)
            );

            // First select an event
            act(() => {
                result.current.handleClinicEventSelect(mockClinicEvents[0]);
            });

            // Then clear it
            act(() => {
                result.current.handleClinicEventSelect(null);
            });

            expect(result.current.selectedClinicEvent).toBeNull();
        });
    });

    describe('Form Validation', () => {
        it('should validate form data', () => {
            validateAppointmentForm.mockReturnValue({
                isValid: true,
                errors: {}
            });

            const { result } = renderHook(() =>
                useAppointmentFormData(null, false, null, mockClinicEvents)
            );

            const validation = result.current.validateForm();

            expect(validateAppointmentForm).toHaveBeenCalledWith(
                result.current.formData,
                'admin'
            );
            expect(validation.isValid).toBe(true);
        });

        it('should return validation errors', () => {
            const mockErrors = {
                title: 'Title is required',
                appointment_datetime: 'Date is required'
            };

            validateAppointmentForm.mockReturnValue({
                isValid: false,
                errors: mockErrors
            });

            const { result } = renderHook(() =>
                useAppointmentFormData(null, false, null, mockClinicEvents)
            );

            const validation = result.current.validateForm();

            expect(validation.isValid).toBe(false);
            expect(validation.errors).toEqual(mockErrors);
        });
    });

    describe('Date Validation', () => {
        it('should check if date is blocked', () => {
            isDateBlocked.mockReturnValue(true);

            const { result } = renderHook(() =>
                useAppointmentFormData(null, false, null, mockClinicEvents)
            );

            const isBlocked = result.current.isDateBlocked('2025-07-15');

            expect(isDateBlocked).toHaveBeenCalledWith('2025-07-15');
            expect(isBlocked).toBe(true);
        });

        it('should check for availability conflicts', () => {
            checkAvailabilityConflict.mockReturnValue(true);

            const { result } = renderHook(() =>
                useAppointmentFormData(null, false, null, mockClinicEvents)
            );

            const hasConflict = result.current.checkConflict('2025-07-15T10:00:00Z', 60);

            expect(checkAvailabilityConflict).toHaveBeenCalledWith(
                '2025-07-15T10:00:00Z',
                60,
                mockClinicEvents,
                null // appointment ID for edit mode
            );
            expect(hasConflict).toBe(true);
        });
    });

    describe('Payload Preparation', () => {
        it('should prepare appointment payload', () => {
            const mockPayload = {
                title: 'Test',
                description: 'Test desc',
                appointment_datetime: '2025-07-15T10:00:00Z',
                duration_minutes: 30
            };

            prepareAppointmentPayload.mockReturnValue(mockPayload);

            const { result } = renderHook(() =>
                useAppointmentFormData(null, false, 123, mockClinicEvents)
            );

            const payload = result.current.preparePayload();

            expect(prepareAppointmentPayload).toHaveBeenCalledWith(
                result.current.formData,
                123, // patientId
                false, // editMode
                'admin' // userRole
            );
            expect(payload).toEqual(mockPayload);
        });
    });

    describe('Return Values', () => {
        it('should return all required properties and methods', () => {
            const { result } = renderHook(() =>
                useAppointmentFormData(null, false, null, mockClinicEvents)
            );

            // Check properties
            expect(result.current).toHaveProperty('formData');
            expect(result.current).toHaveProperty('selectedClinicEvent');

            // Check methods
            expect(typeof result.current.handleInputChange).toBe('function');
            expect(typeof result.current.handleClinicEventSelect).toBe('function');
            expect(typeof result.current.validateForm).toBe('function');
            expect(typeof result.current.isDateBlocked).toBe('function');
            expect(typeof result.current.checkConflict).toBe('function');
            expect(typeof result.current.preparePayload).toBe('function');
        });
    });
});
