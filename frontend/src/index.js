import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
// Import Font Awesome initialization
import './utils/fontAwesome';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    secondary: { main: '#9c27b0' },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Frontend rebuild trigger - Force Azure Container Update #2
