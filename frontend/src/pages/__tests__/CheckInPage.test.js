import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import { getValidToken } from '../../utils/auth';
import CheckInPage from '../CheckInPage';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }), { virtual: true });
jest.mock('jwt-decode', () => ({ jwtDecode: jest.fn() }), { virtual: true });
jest.mock('../../utils/auth', () => ({ getValidToken: jest.fn(), clearAuthData: jest.fn() }), { virtual: true });
jest.mock('../../config/api', () => ({ API_BASE_URL: 'http://api' }), { virtual: true });
jest.mock('../../components/BackButton', () => ({ __esModule: true, default: () => null }));

const appt = (id, name, hour, extra = {}) => ({
    id,
    patient_name: name,
    appointment_datetime: `2026-10-23T${String(hour).padStart(2, '0')}:00:00`,
    provider_name: 'Dr. Priya Patel',
    unit_name: 'Riverside Family › Family Medicine',
    arrived: false,
    ...extra,
});

const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));
let navigate;

beforeEach(() => {
    navigate = jest.fn();
    useNavigate.mockReturnValue(navigate);
    getValidToken.mockResolvedValue('tok');
    jwtDecode.mockReturnValue({ role: 'registrar' });
});

const type = async (text) => {
    render(<CheckInPage />);
    await wait(0);
    fireEvent.change(screen.getByLabelText('Search by name'), { target: { value: text } });
};

describe('CheckInPage', () => {
    test('does not search until two letters are typed', async () => {
        await type('m');
        await wait(400);
        expect(axios.get).not.toHaveBeenCalled();
    });

    test('lists the matches with provider and place', async () => {
        axios.get.mockResolvedValue({ data: [appt(2, 'Maria Gomez', 10), appt(1, 'Maria Gonzalez', 9)] });
        await type('maria');
        const rows = await screen.findAllByTestId('checkin-row');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('Maria Gonzalez');
        expect(rows[0]).toHaveTextContent('Dr. Priya Patel');
        expect(rows[0]).toHaveTextContent('Family Medicine');
        expect(axios.get.mock.calls[0][1].params).toEqual({ query: 'maria' });
    });

    test('checks a person in without an alert or a reload, and shows who is checked in', async () => {
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        axios.get.mockResolvedValue({ data: [appt(1, 'Maria Gonzalez', 9)] });
        axios.patch.mockResolvedValue({ data: { id: 1, arrived: true } });
        await type('maria');
        fireEvent.click(await screen.findByRole('button', { name: 'Check in Maria Gonzalez' }));
        expect(await screen.findByTestId('checked-in-card')).toHaveTextContent('Maria Gonzalez is checked in');
        expect(axios.patch).toHaveBeenCalledWith('http://api/api/check-in/update-status/1/', { arrived: true }, expect.anything());
        expect(alertSpy).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Undo check-in for Maria Gonzalez' })).toBeInTheDocument();
        alertSpy.mockRestore();
    });

    test('Undo puts the person back to waiting', async () => {
        axios.get.mockResolvedValue({ data: [appt(1, 'Maria Gonzalez', 9)] });
        axios.patch.mockResolvedValueOnce({ data: { id: 1, arrived: true } }).mockResolvedValueOnce({ data: { id: 1, arrived: false } });
        await type('maria');
        fireEvent.click(await screen.findByRole('button', { name: 'Check in Maria Gonzalez' }));
        await screen.findByTestId('checked-in-card');
        fireEvent.click(screen.getByRole('button', { name: 'Undo check-in for Maria Gonzalez' }));
        await waitFor(() => expect(screen.queryByTestId('checked-in-card')).toBeNull());
        expect(axios.patch).toHaveBeenLastCalledWith('http://api/api/check-in/update-status/1/', { arrived: false }, expect.anything());
        expect(screen.getByRole('button', { name: 'Check in Maria Gonzalez' })).toBeEnabled();
    });

    test('a failed check-in says nothing changed and keeps the button', async () => {
        axios.get.mockResolvedValue({ data: [appt(1, 'Maria Gonzalez', 9)] });
        axios.patch.mockRejectedValue(new Error('boom'));
        await type('maria');
        fireEvent.click(await screen.findByRole('button', { name: 'Check in Maria Gonzalez' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not check in Maria. Nothing was changed.');
        expect(screen.getByRole('button', { name: 'Check in Maria Gonzalez' })).toBeEnabled();
        expect(screen.queryByTestId('checked-in-card')).toBeNull();
    });

    test('says so when nobody matches', async () => {
        axios.get.mockResolvedValue({ data: [] });
        await type('zzz');
        expect(await screen.findByText(/No appointment found for/)).toBeInTheDocument();
    });

    test('shows six matches and says how many more there are', async () => {
        axios.get.mockResolvedValue({ data: Array.from({ length: 8 }, (_, i) => appt(i + 1, `Maria ${i}`, 8 + i)) });
        await type('maria');
        expect(await screen.findAllByTestId('checkin-row')).toHaveLength(6);
        expect(screen.getByText(/2 more matches/)).toBeInTheDocument();
    });

    test('sends other roles back to the dashboard', async () => {
        jwtDecode.mockReturnValue({ role: 'nurse' });
        render(<CheckInPage />);
        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'));
    });
});
