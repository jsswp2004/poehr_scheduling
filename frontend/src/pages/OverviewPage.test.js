import React from 'react';
import { render, screen } from '@testing-library/react';
import OverviewPage from './OverviewPage';

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../components/Header', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/Footer', () => ({ __esModule: true, default: () => null }));

test('keeps its title and shows every service except the lab interface', () => {
  render(<OverviewPage />);
  expect(
    screen.getByRole('heading', { name: 'Discover the complete POWER healthcare management suite' })
  ).toBeInTheDocument();
  [
    'POWER Patient Portal',
    'POWER Registration',
    'POWER Notes',
    'POWER MDS',
    'POWER Scheduler',
    'POWER Staffing',
    'POWER Surgery',
    'POWER Communicator',
    'POWER Telehealth',
    'POWER Dictate',
  ].forEach((name) => expect(screen.getByRole('heading', { name })).toBeInTheDocument());
  expect(screen.queryByText(/lab interface/i)).toBeNull();
  expect(screen.queryByText('POWER Documentation')).toBeNull();
});

test('groups the services and lists what every plan includes', () => {
  render(<OverviewPage />);
  ['Clinical', 'Operations', 'Add-ons', 'Included with every plan'].forEach((name) =>
    expect(screen.getByRole('heading', { name })).toBeInTheDocument()
  );
  expect(screen.getByRole('button', { name: 'See pricing' })).toBeInTheDocument();
});

test('marks the four AI assistants and names the Staffing audiences', () => {
  render(<OverviewPage />);
  expect(screen.getAllByText('With AI Assistant')).toHaveLength(4);
  expect(
    screen.getByText(
      'For skilled nursing facilities, rehabilitation centers, clinics and hospitals'
    )
  ).toBeInTheDocument();
  expect(screen.getByText(/AI assistants in Scheduler, Staffing, Communicator and MDS/)).toBeInTheDocument();
  expect(screen.getByText('One platform for your clinic, nursing home or hospital')).toBeInTheDocument();
  ['Clinics', 'Skilled nursing facilities', 'Hospitals'].forEach((a) => expect(screen.getByText(a)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Talk to us' })).toBeInTheDocument();
  expect(screen.queryByText(/hipaa/i)).toBeNull();
});
