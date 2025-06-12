# Logging In & Out Guide

This guide explains how to securely access your POWER Scheduler account.

## Logging In
1. Open the **Login** page at `/login`.
2. Enter your username and password and submit the form.
3. Upon success the backend returns JSON Web Tokens (JWT). The frontend stores them:
   ```javascript
   localStorage.setItem('access_token', access);
   localStorage.setItem('refresh_token', refresh);
   ```
4. Your access token is automatically sent in the `Authorization: Bearer` header for authenticated requests. Tokens expire after one hour by default.

## Logging Out
1. Click the logout icon in the navigation bar.
2. Confirm the prompt. The `performLogout()` function removes your tokens and session data:
   ```javascript
   localStorage.removeItem('access_token');
   localStorage.removeItem('refresh_token');
   sessionStorage.clear();
   ```
3. After logout you are redirected to the solutions page.

## Token-Based Security
- POWER Scheduler uses JWT authentication as configured in `SIMPLE_JWT`:
   ```python
   SIMPLE_JWT = {
       'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
       'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
   }
   ```
- Always log out on shared devices to clear your tokens.
