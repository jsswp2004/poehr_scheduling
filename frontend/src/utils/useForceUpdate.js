import { useState } from 'react';

/**
 * A custom hook that forces a component to re-render
 * This can be useful when you need to refresh a component without any state changes
 * @returns {Function} A function that when called will cause the component to re-render
 */
export default function useForceUpdate() {
  const [value, setValue] = useState(0);
  return () => setValue(val => val + 1);
}
