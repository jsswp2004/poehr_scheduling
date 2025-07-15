/**
 * Utility functions for custom events and state management
 */

/**
 * Notifies the navbar that a profile has been updated
 * Call this function whenever a user profile is updated or when logging in
 */
export const notifyProfileUpdated = (profileData = null) => {
  // Dispatch a custom event that the navbar and auth context are listening for
  const event = new CustomEvent('profile-updated', {
    detail: profileData
  });
  window.dispatchEvent(event);
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
