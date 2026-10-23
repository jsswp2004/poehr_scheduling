import { canText, initials, lastActive, memberName, phoneText, rangeText, roleLabel, textBlockedReason } from '../teamHelpers';

const NOW = new Date(2026, 9, 22, 21, 30);
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo, d, h, mi).toISOString();

describe('names and roles', () => {
    test('roleLabel', () => {
        expect(roleLabel('doctor')).toBe('Doctor');
        expect(roleLabel('system_admin')).toBe('System admin');
        expect(roleLabel('lab_tech')).toBe('Lab tech');
        expect(roleLabel('')).toBe('Team member');
    });
    test('initials skip a Dr. title', () => {
        expect(initials('Dr. Amara Okafor')).toBe('AO');
        expect(initials('Nina Alvarez Gomez')).toBe('NA');
        expect(initials('cher')).toBe('C');
        expect(initials('')).toBe('?');
    });
    test('memberName', () => {
        expect(memberName({ full_name: 'A B' })).toBe('A B');
        expect(memberName({ first_name: 'A', last_name: 'B' })).toBe('A B');
        expect(memberName({ username: 'ab' })).toBe('ab');
        expect(memberName(null)).toBe('Unknown user');
    });
});

describe('phoneText', () => {
    test('formats ten digits, with or without punctuation or a leading 1', () => {
        expect(phoneText('3015550142')).toBe('(301) 555-0142');
        expect(phoneText('301-555-0142')).toBe('(301) 555-0142');
        expect(phoneText('13015550142')).toBe('(301) 555-0142');
    });
    test('leaves other numbers alone and blanks stay blank', () => {
        expect(phoneText('+44 20 7946 0958')).toBe('+44 20 7946 0958');
        expect(phoneText('555')).toBe('555');
        expect(phoneText('')).toBe('');
        expect(phoneText(null)).toBe('');
    });
});

describe('lastActive', () => {
    test('online wins', () => {
        expect(lastActive({ is_online: true, last_seen: at(2026, 0, 1) }, NOW)).toEqual({ text: 'Active now', online: true });
    });
    test('minutes, hours, yesterday, date, other year, never', () => {
        expect(lastActive({ last_seen: new Date(NOW.getTime() - 20000).toISOString() }, NOW).text).toBe('Just now');
        expect(lastActive({ last_seen: at(2026, 9, 22, 21, 10) }, NOW).text).toBe('20 min ago');
        expect(lastActive({ last_seen: at(2026, 9, 22, 20, 0) }, NOW).text).toBe('1 hour ago');
        expect(lastActive({ last_seen: at(2026, 9, 22, 18, 30) }, NOW).text).toBe('3 hours ago');
        expect(lastActive({ last_seen: at(2026, 9, 21, 18, 42) }, NOW).text).toMatch(/^Yesterday, 6:42\sPM$/);
        expect(lastActive({ last_seen: at(2026, 9, 20, 9, 0) }, NOW).text).toBe('Oct 20');
        expect(lastActive({ last_seen: at(2025, 11, 5, 9, 0) }, NOW).text).toBe('Dec 5, 2025');
        expect(lastActive({}, NOW).text).toBe('Not seen yet');
        expect(lastActive({ last_seen: 'garbage' }, NOW).text).toBe('Not seen yet');
    });
});

describe('texting', () => {
    test('the server answer wins', () => {
        expect(canText({ can_text: true, sms_consent: false })).toBe(true);
        expect(canText({ can_text: false, sms_consent: true, phone_number: '3015550142' })).toBe(false);
    });
    test('without it, consent plus a phone number', () => {
        expect(canText({ sms_consent: true, phone_number: '3015550142' })).toBe(true);
        expect(canText({ sms_consent: true, phone_number: '  ' })).toBe(false);
        expect(canText({ sms_consent: false, phone_number: '3015550142' })).toBe(false);
    });
    test('reasons', () => {
        expect(textBlockedReason({ can_text: true })).toBe('');
        expect(textBlockedReason({ can_text: false, phone_number: '' })).toBe('No phone number on file');
        expect(textBlockedReason({ can_text: false, phone_number: '3015550142', first_name: 'Joel' })).toBe('Joel has not agreed to receive texts');
    });
});

test('rangeText', () => {
    expect(rangeText(1, 10, 34)).toBe('Showing 1-10 of 34');
    expect(rangeText(4, 10, 34)).toBe('Showing 31-34 of 34');
    expect(rangeText(1, 25, 8)).toBe('Showing 1-8 of 8');
    expect(rangeText(1, 10, 0)).toBe('No one to show');
});
