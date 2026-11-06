import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LandingPageV1Desktop1920Px as LandingPage } from './LandingPage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('../components/Header', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/Footer', () => ({ __esModule: true, default: () => null }));

beforeEach(() => mockNavigate.mockClear());

test('speaks to clinics, nursing homes and hospitals and names the services', () => {
  render(<LandingPage />);
  expect(screen.getByText('Smarter Platform. Better Outcomes. That is POWER.')).toBeInTheDocument();
  expect(screen.getByText('For clinics, nursing homes and hospitals')).toBeInTheDocument();
  ['Patient Portal', 'Registration', 'Notes', 'Surgery', 'Scheduler', 'Staffing', 'Communicator', 'Telehealth', 'Dictate', 'MDS'].forEach(
    (name) => expect(screen.getByRole('button', { name })).toBeInTheDocument()
  );
});

test('has the four feature rows and the four assistants', () => {
  render(<LandingPage />);
  [
    'Keep the whole day organized',
    'From the front desk to the operating room',
    'Cover the floor and code the MDS',
    'Share it with the team, use it anywhere',
  ].forEach((t) => expect(screen.getByRole('heading', { name: t })).toBeInTheDocument());
  expect(screen.getByRole('heading', { name: 'AI assistants that answer from your own data' })).toBeInTheDocument();
  expect(screen.getByText('Which documents do I need to code?')).toBeInTheDocument();
});

test('the service chips and the second hero button open the Overview page', () => {
  render(<LandingPage />);
  fireEvent.click(screen.getByRole('button', { name: 'MDS' }));
  fireEvent.click(screen.getByRole('button', { name: 'See what is included' }));
  expect(mockNavigate).toHaveBeenCalledWith('/overview');
  expect(mockNavigate).toHaveBeenCalledTimes(2);
});

test('keeps the plans and the data-ownership section', () => {
  render(<LandingPage />);
  expect(screen.getByText('100% your data')).toBeInTheDocument();
  expect(screen.getByText('Choose Your Plan')).toBeInTheDocument();
  expect(screen.queryByText(/scheduling software/i)).toBeNull();
});
