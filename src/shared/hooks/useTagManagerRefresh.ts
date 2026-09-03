import { useEffect, useRef } from "react";

interface UseTagManagerRefreshOptions {
  showTagManager: boolean;
  settingsLoaded: boolean;
  persistentLimitEnabled: boolean;
  persistentLimit: number;
  fetchHistory: (reset?: boolean) => void;
}

export const useTagManagerRefresh = ({
  showTagManager,
  settingsLoaded,
  persistentLimitEnabled,
  persistentLimit,
  fetchHistory
}: UseTagManagerRefreshOptions) => {
  const fetchRef = useRef(fetchHistory);
  useEffect(() => {
    fetchRef.current = fetchHistory;
  }, [fetchHistory]);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (!showTagManager) {
      fetchRef.current(true);
    }
  }, [showTagManager, settingsLoaded, persistentLimitEnabled, persistentLimit]);
};
