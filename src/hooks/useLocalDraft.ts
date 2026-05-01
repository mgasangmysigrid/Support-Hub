import { useState, useEffect, useCallback } from "react";

/**
 * A useState-like hook that auto-saves to localStorage.
 * On mount it restores the saved value; on change it persists it.
 * Call `clear()` to remove the draft (e.g. after successful submission).
 */
export function useLocalDraft<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return initial;
  });

  useEffect(() => {
    try {
      // Only persist non-empty / non-default values
      const serialized = JSON.stringify(value);
      const initialSerialized = JSON.stringify(initial);
      if (serialized !== initialSerialized) {
        localStorage.setItem(key, serialized);
      } else {
        localStorage.removeItem(key);
      }
    } catch {}
  }, [key, value]);

  const clear = useCallback(() => {
    localStorage.removeItem(key);
    setValue(initial);
  }, [key, initial]);

  return [value, setValue, clear];
}
