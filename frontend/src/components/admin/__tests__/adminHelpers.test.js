import { filterTools, groupTools, roleLabel } from '../adminHelpers';

const TOOLS = [
    { id: 'a', label: 'Calendar Dashboard', description: "Today's schedule", group: 'daily' },
    { id: 'b', label: 'Note Builder', description: 'Clinical note templates', group: 'build' },
    { id: 'c', label: 'Order Builder', description: 'Orders and order sets', group: 'build' },
    { id: 'd', label: 'Profile', description: 'Your account', group: 'facility' },
];

describe('adminHelpers', () => {
    test('filterTools matches every word in the name or description', () => {
        expect(filterTools(TOOLS, '').length).toBe(4);
        expect(filterTools(TOOLS, 'builder').map((t) => t.id)).toEqual(['b', 'c']);
        expect(filterTools(TOOLS, 'note templates').map((t) => t.id)).toEqual(['b']);
        expect(filterTools(TOOLS, 'zzz')).toEqual([]);
    });

    test('groupTools keeps group order and drops empty groups', () => {
        const groups = groupTools(TOOLS.filter((t) => t.group !== 'daily'));
        expect(groups.map((g) => g.group.id)).toEqual(['build', 'facility']);
        expect(groups[0].tools).toHaveLength(2);
    });

    test('roleLabel', () => {
        expect(roleLabel('registrar')).toBe('Registrar');
        expect(roleLabel('nurse')).toBe('');
    });
});
