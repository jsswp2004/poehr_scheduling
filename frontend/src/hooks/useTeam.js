import { useState, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { getValidToken, clearAuthData } from '../utils/auth';
import { API_BASE_URL } from '../config/api';

export const useTeam = (navigate) => {
    const [team, setTeam] = useState([]);
    const [loadingTeam, setLoadingTeam] = useState(true);
    // true once the first list has arrived; later loads keep the old rows on screen instead of a spinner
    const [hasLoadedTeam, setHasLoadedTeam] = useState(false);
    const [teamSearch, setTeamSearchState] = useState('');
    const [teamPage, setTeamPage] = useState(1);
    const [teamTotalSize, setTeamTotalSize] = useState(0);
    const [teamRole, setTeamRoleState] = useState('all');
    const [teamOnline, setTeamOnlineState] = useState(false);
    const [teamPageSize, setTeamPageSizeState] = useState(10);
    const [roleCounts, setRoleCounts] = useState(null);
    const latest = useRef(0);

    const teamTotalPages = Math.ceil(teamTotalSize / teamPageSize);

    // Changing what is searched or filtered starts again from page 1.
    const setTeamSearch = (value) => {
        setTeamSearchState(value);
        setTeamPage(1);
    };
    const setTeamRole = (value) => {
        setTeamRoleState(value);
        setTeamPage(1);
    };
    const setTeamOnline = (value) => {
        setTeamOnlineState(value);
        setTeamPage(1);
    };
    const setTeamPageSize = (value) => {
        setTeamPageSizeState(value);
        setTeamPage(1);
    };

    const fetchTeam = async (pageParam = teamPage, searchParam = teamSearch) => {
        const id = ++latest.current;
        setLoadingTeam(true);
        try {
            const validToken = await getValidToken();
            if (!validToken) {
                console.error('No valid token for fetching team');
                clearAuthData();
                navigate('/login');
                return;
            }

            const params = { search: searchParam, page: pageParam, page_size: teamPageSize };
            if (teamRole && teamRole !== 'all') params.role = teamRole;
            if (teamOnline) params.online = 1;

            const res = await axios.get(`${API_BASE_URL}/api/users/team/`, {
                headers: { Authorization: `Bearer ${validToken}` },
                params,
            });
            if (id !== latest.current) return; // a newer request has been made since

            const teamWithFullName = res.data.results.map((u) => ({
                ...u,
                full_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Unknown User',
            }));
            setTeam(teamWithFullName);
            setTeamTotalSize(res.data.count);
            setRoleCounts(res.data.role_counts || null);
            setHasLoadedTeam(true);
        } catch (err) {
            if (id !== latest.current) return;
            console.error('Failed to fetch team:', err);
            toast.error('Failed to fetch team members');
        } finally {
            if (id === latest.current) setLoadingTeam(false);
        }
    };

    return {
        team,
        loadingTeam,
        hasLoadedTeam,
        teamSearch,
        setTeamSearch,
        teamPage,
        setTeamPage,
        teamTotalSize,
        teamTotalPages,
        teamRole,
        setTeamRole,
        teamOnline,
        setTeamOnline,
        teamPageSize,
        setTeamPageSize,
        roleCounts,
        rowsPerPage: teamPageSize,
        fetchTeam,
    };
};
