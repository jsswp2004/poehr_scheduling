import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { getValidToken, clearAuthData } from '../utils/auth';

export const useTeam = (navigate) => {
    const [team, setTeam] = useState([]);
    const [loadingTeam, setLoadingTeam] = useState(true);
    const [teamSearch, setTeamSearch] = useState('');
    const [teamPage, setTeamPage] = useState(1);
    const [teamTotalSize, setTeamTotalSize] = useState(0);

    const rowsPerPage = 10;
    const teamTotalPages = Math.ceil(teamTotalSize / rowsPerPage);

    const fetchTeam = async (pageParam = teamPage, searchParam = teamSearch) => {
        setLoadingTeam(true);
        try {
            const validToken = await getValidToken();
            if (!validToken) {
                console.error('No valid token for fetching team');
                clearAuthData();
                navigate('/login');
                return;
            }

            const res = await axios.get('http://127.0.0.1:8000/api/users/team/', {
                headers: { Authorization: `Bearer ${validToken}` },
                params: {
                    search: searchParam,
                    page: pageParam,
                    page_size: rowsPerPage,
                },
            });

            const teamWithFullName = res.data.results.map((u) => ({
                ...u,
                full_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Unknown User',
            }));
            setTeam(teamWithFullName);
            setTeamTotalSize(res.data.count);
        } catch (err) {
            console.error('Failed to fetch team:', err);
            toast.error('Failed to fetch team members');
        } finally {
            setLoadingTeam(false);
        }
    };

    return {
        team,
        loadingTeam,
        teamSearch,
        setTeamSearch,
        teamPage,
        setTeamPage,
        teamTotalSize,
        teamTotalPages,
        rowsPerPage,
        fetchTeam,
    };
};
