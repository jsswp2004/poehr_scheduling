import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppointmentFormFields } from './AppointmentFormFields';

jest.mock('../locations/LocationPicker', () => ({
  __esModule: true,
  default: () => null,
  useLocationTree: () => null,
}));
jest.mock('react-select', () => ({ __esModule: true, default: () => null }));

const base = {
  formData: { title: 'Checkup', description: '', appointment_datetime: '', duration_minutes: 30, recurrence: 'none', unit: '' },
  handleChange: jest.fn(),
  clinicEvents: [],
  selectedClinicEvent: null,
  handleClinicEventChange: jest.fn(),
  doctors: [],
  selectedDoctor: null,
  handleDoctorChange: jest.fn(),
  editMode: false,
};

beforeEach(() => base.handleChange.mockClear());

test('offers a Video visit checkbox that starts unchecked', () => {
  render(<AppointmentFormFields {...base} />);
  expect(screen.getByLabelText('Video visit (Telehealth)')).not.toBeChecked();
});

test('ticking it reports is_video true to the form', () => {
  render(<AppointmentFormFields {...base} />);
  fireEvent.click(screen.getByLabelText('Video visit (Telehealth)'));
  expect(base.handleChange).toHaveBeenCalledWith({ target: { name: 'is_video', value: true } });
});

test('shows an existing video appointment as checked, and can untick it', () => {
  render(<AppointmentFormFields {...base} editMode formData={{ ...base.formData, is_video: true }} />);
  const box = screen.getByLabelText('Video visit (Telehealth)');
  expect(box).toBeChecked();
  fireEvent.click(box);
  expect(base.handleChange).toHaveBeenCalledWith({ target: { name: 'is_video', value: false } });
});
