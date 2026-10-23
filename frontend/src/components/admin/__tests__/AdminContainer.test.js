import { render, screen, fireEvent, within } from '@testing-library/react';
import AdminContainer from '../AdminContainer';

const ITEMS = [
    { id: 'calendar', label: 'Calendar Dashboard', description: "Today's schedule", group: 'daily', icon: 'FaCalendarCheck', path: '/patients' },
    { id: 'check-in', label: 'Check-in', description: 'Mark arriving patients as arrived', group: 'daily', icon: 'FaUserCheck', path: '/check-in', isNew: true },
    { id: 'note-builder', label: 'Note Builder', description: 'Clinical note templates', group: 'build', icon: 'FaClipboardList', path: '/note-builder' },
    { id: 'order-builder', label: 'Order Builder', description: 'Orders and order sets', group: 'build', icon: 'FaClipboardCheck', path: '/order-builder' },
    { id: 'profile', label: 'Profile', description: 'Your account', group: 'facility', icon: 'FaUserCog', path: '/profile' },
];

const setup = (over = {}) => {
    const props = { userRole: 'admin', loading: false, visibleNavItems: ITEMS, handleNavigate: jest.fn(), ...over };
    render(<AdminContainer {...props} />);
    return props;
};

describe('AdminContainer', () => {
    test('shows the title, the role and the tools in labeled groups', () => {
        setup();
        expect(screen.getByRole('heading', { name: 'Management Portal' })).toBeInTheDocument();
        expect(screen.getByText('Signed in as Administrator')).toBeInTheDocument();
        const daily = screen.getByRole('region', { name: 'Daily work' });
        expect(within(daily).getByRole('button', { name: /Calendar Dashboard/ })).toBeInTheDocument();
        expect(within(daily).getByText('NEW')).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Build and configure' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Facility and account' })).toBeInTheDocument();
    });

    test('a registrar only sees the groups that have tools for them', () => {
        setup({ userRole: 'registrar', visibleNavItems: ITEMS.slice(0, 2) });
        expect(screen.getByRole('region', { name: 'Daily work' })).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Build and configure' })).toBeNull();
    });

    test('clicking a card opens that tool', () => {
        const props = setup();
        fireEvent.click(screen.getByRole('button', { name: /Check-in/ }));
        expect(props.handleNavigate).toHaveBeenCalledWith('/check-in');
    });

    test('typing filters the tools and says how many match', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Find a tool'), { target: { value: 'builder' } });
        expect(screen.getByText(/2 tools match/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Note Builder/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Profile/ })).toBeNull();
        expect(screen.queryByRole('region', { name: 'Daily work' })).toBeNull();
    });

    test('no match shows a message and Clear search brings everything back', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Find a tool'), { target: { value: 'zzz' } });
        expect(screen.getByText(/No tool matches/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(screen.getByRole('button', { name: /Profile/ })).toBeInTheDocument();
    });

    test('Escape clears the box', () => {
        setup();
        const box = screen.getByLabelText('Find a tool');
        fireEvent.change(box, { target: { value: 'note' } });
        fireEvent.keyDown(box, { key: 'Escape' });
        expect(box).toHaveValue('');
    });

    test('shows a spinner while loading', () => {
        setup({ loading: true });
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
});
