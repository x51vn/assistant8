import { useEffect, useRef } from 'preact/hooks';
import { loadAllPrompts } from '../api/settingsApi.js';
import { allPrompts } from '../state/settingsState.js';

/**
 * Load unified prompts once for the authenticated user.
 * Clears in-memory prompt state when the user logs out or changes.
 * @param {{id?: string}|null|undefined} user
 */
export function usePromptsBootstrap(user) {
  const loadedUserIdRef = useRef(null);

  useEffect(() => {
    const userId = user?.id || null;

    if (!userId) {
      loadedUserIdRef.current = null;
      allPrompts.value = {};
      return;
    }

    if (loadedUserIdRef.current && loadedUserIdRef.current !== userId) {
      allPrompts.value = {};
    }

    if (
      loadedUserIdRef.current === userId &&
      allPrompts.value &&
      Object.keys(allPrompts.value).length > 0
    ) {
      return;
    }

    let cancelled = false;
    loadedUserIdRef.current = userId;

    loadAllPrompts({ preferCache: true })
      .then((prompts) => {
        if (!cancelled && loadedUserIdRef.current === userId) {
          allPrompts.value = prompts || {};
        }
      })
      .catch((error) => {
        console.warn('[PromptsBootstrap] Failed to load prompts:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);
}
