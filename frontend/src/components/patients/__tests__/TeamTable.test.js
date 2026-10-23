import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }), { virtual: true });
jest.mock('../../MessagesButton', () => {
    const React = require('react');
    return { __esModule: true, default: ({ onClick }) => React.createElement('button', { onClick }, 'Open inbox') };
});

import TeamTable from '../TeamTable';

const at = (h) => new Date(Date.now() - h * 3600000).toISOString();
const MEMBERS = [
    { id: 1, full_name: 'Dr. Priya Patel', first_name: 'Priya', last_name: 'Patel', role: 'doctor', email: 'p.patel@clinic.example', phone_number: '3015550112', is_online: true, can_text: true, sms_consent: true, sms_consent_date: '2026-03-12T10:00:00Z', organization_name: 'Riverside' },
    { id: 2, full_name: 'Joel Baptiste', first_name: 'Joel', last_name: 'Baptiste', role: 'nurse', email: 'j.baptiste@clinic.example', phone_number: '3015550177', is_online: false, last_seen: at(30), can_text: false, sms_consent: false, organization_name: 'Riverside' },
    { id: 3, full_name: 'Carla Mendes', first_name: 'Carla', last_name: 'Mendes', role: 'receptionist', email: '', phone_number: '', is_online: false, last_seen: null, can_text: false, organization_name: 'Riverside' },
];
const COUNTS = { all: 34, online: 12, doctor: 8, nurse: 14, registrar: 5, admin: 3, other: 4 };

const setup = (over = {}) => {
    const props = {
        team: MEMBERS,
        loadingTeam: false,
        hasLoadedTeam: true,
        teamSearch: '',
        setTeamSearch: jest.fn(),
        teamRole: 'all',
        setTeamRole: jest.fn(),
        teamOnline: false,
        setTeamOnline: jest.fn(),
        teamPage: 1,
        setTeamPage: jest.fn(),
        teamPageSize: 10,
        setTeamPageSize: jest.fn(),
        teamTotalSize: 34,
        teamTotalPages: 4,
        roleCounts: COUNTS,
        onSendText: jest.fn(),
        onOpenEmailModal: jest.fn(),
        onMessage: jest.fn(),
        onOpenMessages: jest.fn(),
        ...over,
    };
    render(<TeamTable {...props} />);
    return props;
};

describe('list', () => {
    test('shows each person with role, email, formatted phone and last active', () => {
        setup();
        expect(screen.getByText('Dr. Priya Patel')).toBeInTheDocument();
        expect(screen.getByText('Doctor')).toBeInTheDocument();
        expect(screen.getByText('p.patel@clinic.example')).toBeInTheDocument();
        expect(screen.getByText('(301) 555-0112')).toBeInTheDocument();
        expect(screen.queryByText('3015550112')).toBeNull();
        expect(screen.getByText('Active now')).toBeInTheDocument();
        expect(screen.getByText('No email on file')).toBeInTheDocument();
        expect(screen.getByText('No phone')).toBeInTheDocument();
    });

    test('the summary line counts people and who is online', () => {
        setup();
        expect(screen.getByText(/34 people/)).toBeInTheDocument();
        expect(screen.getByText('12 online now')).toBeInTheDocument();
    });

    test('the organization shows only when asked for', () => {
        const { unmount } = render(<TeamTable {...{ team: MEMBERS, hasLoadedTeam: true, setTeamSearch() {}, teamPage: 1, teamPageSize: 10, teamTotalSize: 3, teamTotalPages: 1 }} />);
        expect(screen.queryByText('Riverside')).toBeNull();
        unmount();
        render(<TeamTable {...{ team: MEMBERS, hasLoadedTeam: true, setTeamSearch() {}, teamPage: 1, teamPageSize: 10, teamTotalSize: 3, teamTotalPages: 1, showOrganization: true }} />);
        expect(screen.getAllByText('Riverside').length).toBe(3);
    });

    test('the range and rows per page', () => {
        const props = setup();
        expect(screen.getByTestId('team-range')).toHaveTextContent('Showing 1-10 of 34');
        fireEvent.mouseDown(screen.getByRole('combobox'));
        fireEvent.click(screen.getByRole('option', { name: '25' }));
        expect(props.setTeamPageSize).toHaveBeenCalledWith(25);
    });

    test('paging', () => {
        const props = setup({ teamPage: 1 });
        fireEvent.click(screen.getByRole('button', { name: /page 2/i }));
        expect(props.setTeamPage).toHaveBeenCalledWith(2);
    });
});

describe('search and filters', () => {
    test('the search box stays on screen while the list is loading, rows stay too', () => {
        setup({ loadingTeam: true });
        expect(screen.getByLabelText('Search team')).toBeInTheDocument();
        expect(screen.getByText('Dr. Priya Patel')).toBeInTheDocument();
        expect(screen.queryByTestId('team-skeleton')).toBeNull();
    });

    test('the first load shows placeholders, with the search box', () => {
        setup({ team: [], loadingTeam: true, hasLoadedTeam: false });
        expect(screen.getByTestId('team-skeleton')).toBeInTheDocument();
        expect(screen.getByLabelText('Search team')).toBeInTheDocument();
    });

    test('typing waits a moment before asking the server, and keeps the text', async () => {
        const props = setup();
        const box = screen.getByLabelText('Search team');
        fireEvent.change(box, { target: { value: 'jeff' } });
        expect(box).toHaveValue('jeff');
        expect(props.setTeamSearch).not.toHaveBeenCalled();
        await waitFor(() => expect(props.setTeamSearch).toHaveBeenCalledWith('jeff'));
    });

    test('the clear button empties the search at once', () => {
        const props = setup({ teamSearch: 'jeff' });
        fireEvent.click(screen.getByLabelText('Clear search'));
        expect(screen.getByLabelText('Search team')).toHaveValue('');
        expect(props.setTeamSearch).toHaveBeenCalledWith('');
    });

    test('role chips show counts and choose the role', () => {
        const props = setup({ teamRole: 'nurse' });
        const group = screen.getByRole('group', { name: 'Filter by role' });
        expect(within(group).getByRole('button', { name: /Doctors\s*8/ })).toBeInTheDocument();
        expect(within(group).getByRole('button', { name: /Nurses\s*14/ })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(within(group).getByRole('button', { name: /Doctors/ }));
        expect(props.setTeamRole).toHaveBeenCalledWith('doctor');
    });

    test('Online only', () => {
        const props = setup();
        fireEvent.click(screen.getByLabelText('Online only'));
        expect(props.setTeamOnline).toHaveBeenCalledWith(true);
    });

    test('no results says what was searched and clears everything', () => {
        const props = setup({ team: [], teamTotalSize: 0, teamTotalPages: 0, teamSearch: 'zzz', teamRole: 'nurse', teamOnline: true });
        expect(screen.getByText(/No one matches/)).toHaveTextContent('zzz');
        fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
        expect(props.setTeamSearch).toHaveBeenCalledWith('');
        expect(props.setTeamRole).toHaveBeenCalledWith('all');
        expect(props.setTeamOnline).toHaveBeenCalledWith(false);
    });

    test('an empty team with no filters says so plainly', () => {
        setup({ team: [], teamTotalSize: 0, teamTotalPages: 0 });
        expect(screen.getByText('No team members yet')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Clear search/ })).toBeNull();
    });
});

describe('actions', () => {
    test('Message, Text and Email act on that person and do not open the details', () => {
        const props = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Message Dr. Priya Patel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text Dr. Priya Patel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Email Dr. Priya Patel' }));
        expect(props.onMessage).toHaveBeenCalledWith(MEMBERS[0]);
        expect(props.onSendText).toHaveBeenCalledWith(MEMBERS[0]);
        expect(props.onOpenEmailModal).toHaveBeenCalledWith(MEMBERS[0]);
        expect(screen.queryByTestId('drawer-name')).toBeNull();
    });

    test('Text is off for someone who has not agreed, and Email is off without an address', () => {
        const props = setup();
        const text = screen.getByRole('button', { name: 'Text Joel Baptiste' });
        expect(text).toBeDisabled();
        fireEvent.click(text);
        expect(props.onSendText).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Email Carla Mendes' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Text Carla Mendes' })).toBeDisabled();
    });

    test('the inbox button still opens secure messages', () => {
        const props = setup();
        fireEvent.click(screen.getByText('Open inbox'));
        expect(props.onOpenMessages).toHaveBeenCalled();
    });
});

describe('details panel', () => {
    test('opens on a click, shows contact and texting, and closes', async () => {
        setup();
        fireEvent.click(screen.getByLabelText('Details for Dr. Priya Patel'));
        expect(await screen.findByTestId('drawer-name')).toHaveTextContent('Dr. Priya Patel');
        const panel = screen.getByRole('dialog');
        expect(within(panel).getByText('p.patel@clinic.example')).toBeInTheDocument();
        expect(within(panel).getByText('(301) 555-0112')).toBeInTheDocument();
        expect(within(panel).getByText(/Agreed to texts/)).toBeInTheDocument();
        fireEvent.click(within(panel).getByLabelText('Close details'));
        await waitFor(() => expect(screen.queryByTestId('drawer-name')).toBeNull());
    });

    test('explains why texting is off', async () => {
        setup();
        fireEvent.click(screen.getByLabelText('Details for Joel Baptiste'));
        const panel = await screen.findByRole('dialog');
        expect(within(panel).getByText('Joel has not agreed to receive texts')).toBeInTheDocument();
        expect(within(panel).getByRole('button', { name: 'Text' })).toBeDisabled();
    });

    test('Enter on a row opens it', async () => {
        setup();
        fireEvent.keyDown(screen.getByLabelText('Details for Carla Mendes'), { key: 'Enter' });
        expect(await screen.findByTestId('drawer-name')).toHaveTextContent('Carla Mendes');
    });

    test('Message from the panel acts on that person', async () => {
        const props = setup();
        fireEvent.click(screen.getByLabelText('Details for Dr. Priya Patel'));
        const panel = await screen.findByRole('dialog');
        fireEvent.click(within(panel).getByRole('button', { name: 'Message' }));
        expect(props.onMessage).toHaveBeenCalledWith(MEMBERS[0]);
    });
});

describe('small screens', () => {
    const original = window.matchMedia;
    beforeEach(() => {
        window.matchMedia = (query) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false; } });
    });
    afterEach(() => {
        window.matchMedia = original;
    });

    test('people show as cards, with the same actions', () => {
        const props = setup();
        expect(screen.queryByRole('table')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Message Joel Baptiste' }));
        expect(props.onMessage).toHaveBeenCalledWith(MEMBERS[1]);
        expect(screen.getByRole('button', { name: 'Text Joel Baptiste' })).toBeDisabled();
    });
});

describe('TeamTable header row', () => {
    test('shows the title, count and Back action together, and no separate Role column', () => {
        setup({ title: 'Team', backAction: <button type="button">Back</button> });
        expect(screen.getByTestId('view-title')).toHaveTextContent('Team');
        expect(screen.getByText(/34 people/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Role' })).toBeNull();
    });
});
