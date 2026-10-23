import { renderHook, act } from '@testing-library/react';

jest.mock('axios', () => ({ get: jest.fn() }), { virtual: true });
jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }), { virtual: true });
jest.mock('../../utils/auth', () => ({ getValidToken: async () => 'tok', clearAuthData: jest.fn() }), { virtual: true });
jest.mock('../../config/api', () => ({ API_BASE_URL: 'http://api' }), { virtual: true });

import axios from 'axios';
import { toast } from 'react-toastify';
import { useTeam } from '../useTeam';

const reply = (names, extra = {}) => ({
    data: { count: names.length, results: names.map((n, i) => ({ id: i + 1, first_name: n, last_name: 'X' })), role_counts: { all: names.length, online: 1 }, ...extra },
});

beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockResolvedValue(reply(['Ann', 'Bo']));
});

test('loads the first page and keeps the chip counts', async () => {
    const { result } = renderHook(() => useTeam(jest.fn()));
    expect(result.current.hasLoadedTeam).toBe(false);
    await act(async () => {
        await result.current.fetchTeam();
    });
    expect(result.current.team.map((m) => m.full_name)).toEqual(['Ann X', 'Bo X']);
    expect(result.current.roleCounts).toEqual({ all: 2, online: 1 });
    expect(result.current.hasLoadedTeam).toBe(true);
    expect(result.current.loadingTeam).toBe(false);
    expect(axios.get.mock.calls[0][1].params).toEqual({ search: '', page: 1, page_size: 10 });
});

test('sends the role, online and page size choices', async () => {
    const { result } = renderHook(() => useTeam(jest.fn()));
    act(() => {
        result.current.setTeamRole('nurse');
        result.current.setTeamOnline(true);
        result.current.setTeamPageSize(25);
        result.current.setTeamSearch('lee');
    });
    await act(async () => {
        await result.current.fetchTeam();
    });
    expect(axios.get.mock.calls[0][1].params).toEqual({ search: 'lee', page: 1, page_size: 25, role: 'nurse', online: 1 });
});

test('"all" sends no role, and changing a filter returns to page 1', async () => {
    const { result } = renderHook(() => useTeam(jest.fn()));
    act(() => result.current.setTeamPage(3));
    expect(result.current.teamPage).toBe(3);
    act(() => result.current.setTeamRole('doctor'));
    expect(result.current.teamPage).toBe(1);
    act(() => result.current.setTeamPage(2));
    act(() => result.current.setTeamOnline(true));
    expect(result.current.teamPage).toBe(1);
    act(() => result.current.setTeamPage(2));
    act(() => result.current.setTeamSearch('x'));
    expect(result.current.teamPage).toBe(1);
    act(() => result.current.setTeamPage(2));
    act(() => result.current.setTeamPageSize(50));
    expect(result.current.teamPage).toBe(1);
    act(() => result.current.setTeamRole('all'));
    await act(async () => {
        await result.current.fetchTeam();
    });
    expect(axios.get.mock.calls[0][1].params.role).toBeUndefined();
});

test('total pages follow the page size', async () => {
    axios.get.mockResolvedValue(reply(['A'], { count: 34 }));
    const { result } = renderHook(() => useTeam(jest.fn()));
    await act(async () => {
        await result.current.fetchTeam();
    });
    expect(result.current.teamTotalPages).toBe(4);
    act(() => result.current.setTeamPageSize(25));
    expect(result.current.teamTotalPages).toBe(2);
});

test('an older, slower answer never replaces a newer one', async () => {
    let releaseFirst;
    axios.get
        .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = () => resolve(reply(['Old'])))))
        .mockImplementationOnce(() => Promise.resolve(reply(['New'])));
    const { result } = renderHook(() => useTeam(jest.fn()));
    let first;
    await act(async () => {
        first = result.current.fetchTeam();
        await Promise.resolve();
    });
    await act(async () => {
        await result.current.fetchTeam();
    });
    await act(async () => {
        releaseFirst();
        await first;
    });
    expect(result.current.team.map((m) => m.first_name)).toEqual(['New']);
    expect(result.current.loadingTeam).toBe(false);
});

test('a failed load tells the person and keeps what was shown', async () => {
    const { result } = renderHook(() => useTeam(jest.fn()));
    await act(async () => {
        await result.current.fetchTeam();
    });
    axios.get.mockRejectedValueOnce(new Error('down'));
    await act(async () => {
        await result.current.fetchTeam();
    });
    expect(toast.error).toHaveBeenCalledWith('Failed to fetch team members');
    expect(result.current.team).toHaveLength(2);
});
