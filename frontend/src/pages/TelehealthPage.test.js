import React from 'react';
import { render } from '@testing-library/react';
import TelehealthPage from './TelehealthPage';

const mockApp = jest.fn(() => null);
jest.mock('../telehealth', () => ({
  __esModule: true,
  TelehealthApp: (props) => mockApp(props),
  PatientJoinPage: () => null,
}));
jest.mock('jwt-decode', () => ({ jwtDecode: jest.fn() }));

const { jwtDecode } = require('jwt-decode');

function renderAs(role) {
  jwtDecode.mockReturnValue({ role });
  render(<TelehealthPage />);
  return mockApp.mock.calls[mockApp.mock.calls.length - 1][0];
}

beforeEach(() => {
  mockApp.mockClear();
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue('token');
});

afterEach(() => jest.restoreAllMocks());

test.each([
  ['doctor', true, false],
  ['nurse', true, false],
  ['receptionist', false, true],
  ['registrar', false, true],
  ['admin', false, true],
  ['system_admin', false, true],
  ['patient', false, false],
])('%s gets conduct=%s manage=%s', (role, conduct, manage) => {
  const props = renderAs(role);
  expect(props.canConduct).toBe(conduct);
  expect(props.canManage).toBe(manage);
});

test('a bad token grants nothing', () => {
  jwtDecode.mockImplementation(() => {
    throw new Error('bad token');
  });
  render(<TelehealthPage />);
  const props = mockApp.mock.calls[0][0];
  expect(props.canConduct).toBe(false);
  expect(props.canManage).toBe(false);
});

test('the assistant is off unless the build turns it on', () => {
  expect(renderAs('doctor').assistant).toBe(false);
});
