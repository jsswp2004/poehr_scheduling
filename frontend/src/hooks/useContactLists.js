import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

/** The signed-in user's contact lists (named groups of contacts). */
export const useContactLists = (token) => {
    const [lists, setLists] = useState([]);

    const headers = { Authorization: `Bearer ${token}` };

    const fetchLists = useCallback(async () => {
        if (!token) return;
        try {
            const res = await axios.get(`${API_BASE_URL}/api/communicator/lists/`, { headers: { Authorization: `Bearer ${token}` } });
            setLists(Array.isArray(res.data) ? res.data : res.data.results || []);
        } catch (err) {
            console.error('Failed to load lists:', err);
        }
    }, [token]);

    useEffect(() => { fetchLists(); }, [fetchLists]);

    // Returns the new list, or throws an Error whose message is safe to show.
    const createList = async (name) => {
        try {
            const res = await axios.post(`${API_BASE_URL}/api/communicator/lists/`, { name }, { headers });
            await fetchLists();
            return res.data;
        } catch (err) {
            const d = err.response && err.response.data;
            throw new Error((d && ((d.name && d.name[0]) || d.error || d.detail)) || 'Could not create the list.');
        }
    };

    const addMembers = async (listId, contactIds) => {
        await axios.post(`${API_BASE_URL}/api/communicator/lists/${listId}/members/`, { add: contactIds }, { headers });
        await fetchLists();
    };

    return { lists, fetchLists, createList, addMembers };
};
