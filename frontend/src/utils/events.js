/**
 * Utility functions for custom events and state management
 */

/**
 * Notifies the navbar that a profile has been updated
 * Call this function whenever a user profile is updated or when logging in
 */
export const notifyProfileUpdated = () => {
  // Dispatch a custom event that the navbar is listening for
  window.dispatchEvent(new Event('profile-updated'));
};

/**
 * Forces a refresh of the user's auth state across the app
 */
export const refreshAuthState = () => {
  // Dispatch storage event to trigger any listeners
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'access_token',
    newValue: localStorage.getItem('access_token')
  }));
};
