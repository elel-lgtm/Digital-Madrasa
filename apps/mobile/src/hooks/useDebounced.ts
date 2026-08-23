import { useEffect, useState } from 'react';

/**
 * Delays a fast-changing value. Used on search inputs so we don't fire a
 * request per keystroke — meaningful on a metered connection.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
