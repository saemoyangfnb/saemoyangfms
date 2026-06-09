import { useEffect, useState } from 'react';

const KEY = 'dalbitgo_readable_mode';

export function useReadabilityMode() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(KEY) === 'true');

  useEffect(() => {
    if (enabled) {
      document.documentElement.classList.add('readable-mode');
    } else {
      document.documentElement.classList.remove('readable-mode');
    }
    localStorage.setItem(KEY, String(enabled));
  }, [enabled]);

  return { enabled, toggle: () => setEnabled(p => !p) };
}
