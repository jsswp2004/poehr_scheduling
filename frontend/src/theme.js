import { createTheme } from '@mui/material';

/*
 * POWER Scheduling theme. Values mirror the CSS variables in index.css.
 *
 * NOTE: shape.borderRadius is intentionally left at the MUI default (4).
 * Hundreds of `sx={{ borderRadius: 1|2|3 }}` usages multiply by it, so
 * changing it would reshape every one of them. Component radii are set
 * explicitly in the overrides below instead.
 */
const fontFamily = [
  '"Inter"',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
].join(',');

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2563eb',
      dark: '#1d4ed8',
      light: '#60a5fa',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#475569',
      dark: '#334155',
      light: '#64748b',
      contrastText: '#ffffff',
    },
    error: { main: '#dc2626', dark: '#b91c1c', light: '#ef4444' },
    warning: { main: '#d97706', dark: '#b45309', light: '#f59e0b' },
    success: { main: '#047857', dark: '#065f46', light: '#10b981' },
    info: { main: '#2563eb', dark: '#1d4ed8', light: '#60a5fa' },
    text: { primary: '#0f172a', secondary: '#475569' },
    divider: '#e2e8f0',
    background: { default: '#f8fafc', paper: '#ffffff' },
  },
  typography: {
    fontFamily,
    h1: { fontWeight: 800, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#f8fafc' },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          background:
            'linear-gradient(135deg, #0f172a 0%, #1e293b 70%, #334155 100%)',
          color: '#ffffff',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 12 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 8 },
        notchedOutline: { borderColor: '#cbd5e1' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' },
      },
    },
  },
});

export default theme;
