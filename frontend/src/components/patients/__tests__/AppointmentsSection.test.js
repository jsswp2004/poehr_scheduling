import { render, screen, fireEvent, within } from '@testing-library/react';

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../../../config/api', () => ({ API_BASE_URL: 'http://api.test' }), { virtual: true });
jest.mock('../../CalendarView', () => {
    const React = require('react');
    return { __esModule: true, default: () => React.createElement('div', null, 'calendar') };
});

import AppointmentsSection, { ALL_ROWS_PER_PAGE } from '../AppointmentsSection';

const makeAppts = (n) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        title: `Visit ${i + 1}`,
        patient_name: `Patient ${String(i + 1).padStart(2, '0')}`,
        provider_name: 'Dr. Lee',
        appointment_datetime: '2026-11-02T14:00:00Z',
        description: `Reason ${i + 1}`,
        duration_minutes: 30,
        status: 'scheduled',
    }));

const setup = (results, over = {}) => {
    const props = {
        appointmentsTab: 'all',
        setAppointmentsTab: jest.fn(),
        appointmentsQuery: '',
        setAppointmentsQuery: jest.fn(),
        todaysAppointments: [],
        appointmentsResults: results,
        onStatusUpdate: jest.fn(),
        onViewDetails: jest.fn(),
        onAppointmentStatusUpdate: jest.fn(),
        onApproveRequest: jest.fn(),
        onDenyRequest: jest.fn(),
        ...over,
    };
    const utils = render(<AppointmentsSection {...props} />);
    return { ...utils, props };
};

test('shows 10 rows per page, with the range and no rows-per-page choice', () => {
    expect(ALL_ROWS_PER_PAGE).toBe(10);
    setup(makeAppts(25));
    expect(screen.getAllByRole('row')).toHaveLength(11); // header + 10
    expect(screen.getByTestId('appointments-range')).toHaveTextContent('Showing 1-10 of 25');
    expect(screen.getByText('25 appointments')).toBeInTheDocument();
    expect(screen.queryByText('Rows per page')).not.toBeInTheDocument();
    expect(screen.getByText('Patient 01')).toBeInTheDocument();
    expect(screen.queryByText('Patient 11')).not.toBeInTheDocument();
});

test('the page bar moves between pages', () => {
    setup(makeAppts(25));
    fireEvent.click(screen.getByRole('button', { name: /go to page 3/i }));
    expect(screen.getByTestId('appointments-range')).toHaveTextContent('Showing 21-25 of 25');
    expect(screen.getAllByRole('row')).toHaveLength(6); // header + 5
    expect(screen.getByText('Patient 25')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /go to first page/i }));
    expect(screen.getByText('Patient 01')).toBeInTheDocument();
});

test('ten or fewer appointments show no page buttons', () => {
    setup(makeAppts(7));
    expect(screen.getByTestId('appointments-range')).toHaveTextContent('Showing 1-7 of 7');
    expect(screen.queryByRole('button', { name: /go to page/i })).not.toBeInTheDocument();
});

test('a new search goes back to page 1', () => {
    const { rerender, props } = setup(makeAppts(25));
    fireEvent.click(screen.getByRole('button', { name: /go to page 2/i }));
    expect(screen.getByTestId('appointments-range')).toHaveTextContent('Showing 11-20 of 25');
    rerender(<AppointmentsSection {...props} appointmentsQuery="visit" appointmentsResults={makeAppts(12)} />);
    expect(screen.getByTestId('appointments-range')).toHaveTextContent('Showing 1-10 of 12');
});

test('typing in the search box and clearing it', () => {
    const { props } = setup(makeAppts(3), { appointmentsQuery: 'lee' });
    fireEvent.change(screen.getByLabelText('Search appointments'), { target: { value: 'kim' } });
    expect(props.setAppointmentsQuery).toHaveBeenCalledWith('kim');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(props.setAppointmentsQuery).toHaveBeenCalledWith('');
});

test('no matches explains and offers to clear the search', () => {
    const { props } = setup([], { appointmentsQuery: 'zzz' });
    expect(screen.getByText(/No appointments match/)).toBeInTheDocument();
    // the box's X button and this one share a name; the text one is the empty-state button
    fireEvent.click(screen.getByText('Clear search'));
    expect(props.setAppointmentsQuery).toHaveBeenCalledWith('');
});

test('no appointments at all says so', () => {
    setup([]);
    expect(screen.getByText('No appointments yet')).toBeInTheDocument();
    expect(screen.queryByTestId('appointments-range')).not.toBeInTheDocument();
});

test('clicking a row opens its details', () => {
    setup(makeAppts(3));
    fireEvent.click(screen.getByRole('row', { name: 'Details for Patient 02' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Appointment Details')).toBeInTheDocument();
    expect(within(dialog).getByText(/Patient 02/)).toBeInTheDocument();
});

test('the sub-tabs are all present', () => {
    setup(makeAppts(1));
    ['Calendar View', "Today's Appointments", 'All Appointments', 'Pending Requests'].forEach((n) =>
        expect(screen.getByRole('tab', { name: n })).toBeInTheDocument()
    );
});
