import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CreateAppointmentForm from '../CreateAppointmentForm';

// Mock Material-UI components
jest.mock('@mui/material', () => ({
    Box: ({ children, ...props }) => <div {...props}>{children}</div>,
    Paper: ({ children, ...props }) => <div {...props}>{children}</div>,
    Typography: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

// Mock the custom hooks
jest.mock('../hooks/appointment-form/useAppointmentFormData');
jest.mock('../hooks/appointment-form/useAppointmentDoctors');
jest.mock('../hooks/appointment-form/useAppointmentFormExternal');
jest.mock('../hooks/appointment-form/useAppointmentFormSubmission');

// Mock the modular components
jest.mock('./appointment-form/AppointmentFormFields', () => ({
    AppointmentFormFields: ({ formData, onInputChange, doctors, onDoctorSelect }) => (
        <div data-testid="appointment-form-fields">
            <input
                data-testid="title-input"
                value={formData.title}
                onChange={(e) => onInputChange('title', e.target.value)}
                placeholder="Appointment Title"
            />
            <input
                data-testid="description-input"
                value={formData.description}
                onChange={(e) => onInputChange('description', e.target.value)}
                placeholder="Description"
            />
            <select
                data-testid="doctor-select"
                onChange={(e) => onDoctorSelect(e.target.value)}
            >
                <option value="">Select Doctor</option>
                {doctors.map(doctor => (
                    <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
                ))}
            </select>
        </div>
    )
}));

jest.mock('./appointment-form/AvailableSlotsPanel', () => ({
    AvailableSlotsPanel: ({ availableSlots, onSlotSelect }) => (
        <div data-testid="available-slots-panel">
            {availableSlots.map((slot, index) => (
                <button
                    key={index}
                    data-testid={`slot-${index}`}
                    onClick={() => onSlotSelect(slot)}
                >
                    {slot}
                </button>
            ))}
        </div>
    )
}));

jest.mock('./appointment-form/AppointmentFormActions', () => ({
    AppointmentFormActions: ({ onSubmit, onCancel, loading, editMode }) => (
        <div data-testid="appointment-form-actions">
            <button
                data-testid="submit-button"
                onClick={onSubmit}
                disabled={loading}
            >
                {editMode ? 'Update' : 'Create'} Appointment
            </button>
            <button
                data-testid="cancel-button"
                onClick={onCancel}
            >
                Cancel
            </button>
        </div>
    )
}));

import {
    useAppointmentFormData,
    useAppointmentDoctors,
    useAppointmentFormExternal,
    useAppointmentFormSubmission
} from '../hooks/appointment-form';

describe('CreateAppointmentForm Component', () => {
    const mockOnSuccess = jest.fn();

    const mockFormData = {
        title: '',
        description: '',
        appointment_datetime: '',
        duration_minutes: 30,
        recurrence: 'none'
    };

    const mockFormDataHook = {
        formData: mockFormData,
        handleInputChange: jest.fn(),
        validateForm: jest.fn().mockReturnValue({ isValid: true, errors: {} }),
        selectedClinicEvent: null,
        handleClinicEventSelect: jest.fn(),
    };

    const mockDoctorsHook = {
        doctors: [
            { id: 1, name: 'Dr. Smith' },
            { id: 2, name: 'Dr. Johnson' }
        ],
        selectedDoctor: null,
        handleDoctorSelect: jest.fn(),
        loading: false
    };

    const mockExternalHook = {
        clinicEvents: [],
        blockedDays: [],
        holidays: [],
        availableSlots: ['10:00 AM', '2:00 PM', '4:00 PM'],
        loading: false
    };

    const mockSubmissionHook = {
        handleSubmit: jest.fn(),
        loading: false,
        error: null
    };

    beforeEach(() => {
        jest.clearAllMocks();

        useAppointmentFormData.mockReturnValue(mockFormDataHook);
        useAppointmentDoctors.mockReturnValue(mockDoctorsHook);
        useAppointmentFormExternal.mockReturnValue(mockExternalHook);
        useAppointmentFormSubmission.mockReturnValue(mockSubmissionHook);
    });

    describe('Rendering', () => {
        it('should render all form sections', () => {
            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                    patientName="John Doe"
                    patientId={123}
                />
            );

            expect(screen.getByTestId('appointment-form-fields')).toBeInTheDocument();
            expect(screen.getByTestId('available-slots-panel')).toBeInTheDocument();
            expect(screen.getByTestId('appointment-form-actions')).toBeInTheDocument();
        });

        it('should display create mode by default', () => {
            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                />
            );

            expect(screen.getByText('Create Appointment')).toBeInTheDocument();
        });

        it('should display edit mode when appointmentToEdit is provided', () => {
            const appointmentToEdit = {
                id: 1,
                title: 'Existing Appointment',
                description: 'Existing Description'
            };

            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                    appointmentToEdit={appointmentToEdit}
                    editMode={true}
                />
            );

            expect(screen.getByText('Update Appointment')).toBeInTheDocument();
        });
    });

    describe('Form Interactions', () => {
        it('should handle title input changes', () => {
            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                />
            );

            const titleInput = screen.getByTestId('title-input');
            fireEvent.change(titleInput, { target: { value: 'New Appointment' } });

            expect(mockFormDataHook.handleInputChange).toHaveBeenCalledWith('title', 'New Appointment');
        });

        it('should handle description input changes', () => {
            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                />
            );

            const descriptionInput = screen.getByTestId('description-input');
            fireEvent.change(descriptionInput, { target: { value: 'New Description' } });

            expect(mockFormDataHook.handleInputChange).toHaveBeenCalledWith('description', 'New Description');
        });

        it('should handle doctor selection', () => {
            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                />
            );

            const doctorSelect = screen.getByTestId('doctor-select');
            fireEvent.change(doctorSelect, { target: { value: '1' } });

            expect(mockDoctorsHook.handleDoctorSelect).toHaveBeenCalledWith('1');
        });

        it('should handle slot selection', () => {
            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                />
            );

            const slotButton = screen.getByTestId('slot-0');
            fireEvent.click(slotButton);

            expect(mockFormDataHook.handleInputChange).toHaveBeenCalledWith(
                'appointment_datetime',
                '10:00 AM'
            );
        });
    });

    describe('Form Submission', () => {
        it('should handle form submission', async () => {
            mockSubmissionHook.handleSubmit.mockResolvedValue();

            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                />
            );

            const submitButton = screen.getByTestId('submit-button');
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(mockSubmissionHook.handleSubmit).toHaveBeenCalled();
            });
        });

        it('should show loading state during submission', () => {
            useAppointmentFormSubmission.mockReturnValue({
                ...mockSubmissionHook,
                loading: true
            });

            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                />
            );

            const submitButton = screen.getByTestId('submit-button');
            expect(submitButton).toBeDisabled();
        });

        it('should validate form before submission', async () => {
            mockFormDataHook.validateForm.mockReturnValue({
                isValid: false,
                errors: { title: 'Title is required' }
            });

            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                />
            );

            const submitButton = screen.getByTestId('submit-button');
            fireEvent.click(submitButton);

            expect(mockFormDataHook.validateForm).toHaveBeenCalled();
        });
    });

    describe('Props Integration', () => {
        it('should pass patientId to hooks', () => {
            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                    patientId={123}
                />
            );

            expect(useAppointmentFormData).toHaveBeenCalledWith(
                null, // appointmentToEdit
                false, // editMode
                123, // patientId
                expect.any(Array) // clinicEvents
            );
        });

        it('should pass defaultProviderId to doctors hook', () => {
            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                    defaultProviderId={456}
                />
            );

            expect(useAppointmentDoctors).toHaveBeenCalledWith(456);
        });

        it('should handle edit mode props', () => {
            const appointmentToEdit = { id: 1, title: 'Test' };

            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                    appointmentToEdit={appointmentToEdit}
                    editMode={true}
                />
            );

            expect(useAppointmentFormData).toHaveBeenCalledWith(
                appointmentToEdit,
                true,
                null,
                expect.any(Array)
            );
        });
    });

    describe('Error Handling', () => {
        it('should display submission errors', () => {
            useAppointmentFormSubmission.mockReturnValue({
                ...mockSubmissionHook,
                error: 'Failed to create appointment'
            });

            render(
                <CreateAppointmentForm
                    onSuccess={mockOnSuccess}
                />
            );

            expect(screen.getByText('Failed to create appointment')).toBeInTheDocument();
        });
    });
});
