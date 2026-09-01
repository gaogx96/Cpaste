import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Dispatch, SetStateAction } from "react";
import type { ClipboardEntry } from "../types";

interface UseHistoryFetchOptions {
  debouncedSearch: string;
  typeFilter: string | null;
  persistentLimitEnabled: boolean;
  persistentLimit: number;
  pageSize: number;
  currentOffset: number;
  historyLength: number;
  setHistory: Dispatch<SetStateAction<ClipboardEntry[]>>;
  setCurrentOffset: Dispatch<SetStateAction<number>>;
  setHasMore: Dispatch<SetStateAction<boolean>>;
  isLoadingMore: boolean;
  hasMore: boolean;
  setIsLoadingMore: Dispatch<SetStateAction<boolean>>;
}

export const useHistoryFetch = ({
  debouncedSearch,
  typeFilter,
  persistentLimitEnabled,
  persistentLimit,
  pageSize,
  currentOffset,
  historyLength,
  setHistory,
  setCurrentOffset,
  setHasMore,
  isLoadingMore,
  hasMore,
  setIsLoadingMore
}: UseHistoryFetchOptions) => {
  const loadingRef = useRef(false);
  const fetchSeqRef = useRef(0);
  const lastRequestedOffsetRef = useRef<number | null>(null);
  const currentOffsetRef = useRef(currentOffset);
  const historyLengthRef = useRef(historyLength);
  // 正在执行中的 reset（切换标签/搜索）数量，用于阻止 reset 期间触发 loadMore
  const resettingCountRef = useRef(0);
  // 最近一次 reset 的 seq，晚于它的 loadMore 结果才有效（丢弃切换标签前遗留的加载）
  const resetSeqRef = useRef(0);

  useEffect(() => {
    currentOffsetRef.current = currentOffset;
  }, [currentOffset]);

  useEffect(() => {
    historyLengthRef.current = historyLength;
  }, [historyLength]);
  const fetchHistory = useCallback(
    async (reset = false) => {
      const seq = ++fetchSeqRef.current;
      if (reset) {
        resettingCountRef.current++;
        resetSeqRef.current = seq;
        lastRequestedOffsetRef.current = null;
        // 立即清零 offset refs，避免 reset 完成前 loadMore 用旧标签的 offset
        currentOffsetRef.current = 0;
        historyLengthRef.current = 0;
      }
      try {
        const baseOffset = reset
          ? 0
          : Math.min(currentOffsetRef.current, historyLengthRef.current);

        let data: ClipboardEntry[] = [];

        const hasSearch = debouncedSearch && debouncedSearch.trim().length > 0;

        if (hasSearch) {
          let term = debouncedSearch;
          let tagOnly = false;
          if (term.startsWith("tag:")) {
            term = term.slice(4);
            tagOnly = true;
          }

          try {
            data = await invoke<ClipboardEntry[]>("search_clipboard_history", {
              searchTerm: term,
              limit: 200,
              tagOnly
            });
          } catch (e) {
            console.error("Search failed, falling back", e);
            data = [];
          }

          if (seq !== fetchSeqRef.current) return;
          // Search results are not paginated; always replace list and stop infinite loading.
          setHistory(data);
          setCurrentOffset(data.length);
          setHasMore(false);
          currentOffsetRef.current = data.length;
          historyLengthRef.current = data.length;
        } else {
          const requestedLimit = pageSize + 1; // Use standard page size for DB limit
          const rawData = await invoke<ClipboardEntry[]>("get_clipboard_history", {
            limit: requestedLimit,
            offset: baseOffset,
            content_type: typeFilter || undefined
          });

          if (seq !== fetchSeqRef.current) return;

          const hasMoreNow = rawData.length > pageSize;
          const data = hasMoreNow ? rawData.slice(0, pageSize) : rawData;

          // Calculate how many DB items we actually retrieved (id > 0)
          // This is critical for the next offset to be correct
          const dbItemsCount = data.filter(item => item.id > 0).length;

          if (reset) {
            setHistory(data);
            setCurrentOffset(dbItemsCount);
            setHasMore(hasMoreNow);
            currentOffsetRef.current = dbItemsCount;
            historyLengthRef.current = data.length;
          } else {
            // 丢弃切换标签（reset）之前发起的 loadMore 结果，防止旧标签数据污染新标签列表
            if (seq <= resetSeqRef.current) return;
            let nextItems: ClipboardEntry[] = [];
            setHistory((prev) => {
              const existingIds = new Set(prev.map((item) => item.id));
              nextItems = data.filter((item) => !existingIds.has(item.id) || item.id === 0);

              if (nextItems.length === 0) return prev;
              return [...prev, ...nextItems];
            });

            setCurrentOffset(prev => prev + dbItemsCount);
            // If we didn't add any NEW items but the backend says there are more,
            // it means the items we got were already in our list (maybe shifted due to sorting).
            // We should keep hasMore true so the user can try to load further.
            setHasMore(hasMoreNow);
            currentOffsetRef.current = currentOffsetRef.current + dbItemsCount;
            historyLengthRef.current = historyLengthRef.current + dbItemsCount;
          }
        }
      } catch (err) {
        console.error("无法获取历史记录", err);
        setHasMore(false);
      } finally {
        if (reset) {
          resettingCountRef.current--;
        }
      }
    },
    [
      debouncedSearch,
      typeFilter,
      pageSize,
      persistentLimit,
      persistentLimitEnabled,
      setCurrentOffset,
      setHasMore,
      setHistory
    ]
  );

  const loadMoreHistory = useCallback(async () => {
    if (loadingRef.current || isLoadingMore || !hasMore) return;
    // 切换标签/搜索（reset）进行中时，跳过 loadMore，避免用旧 offset 请求污染新列表
    if (resettingCountRef.current > 0) return;
    if (debouncedSearch && debouncedSearch.trim().length > 0) return;

    const effectiveOffset = Math.min(currentOffsetRef.current, historyLengthRef.current);
    if (lastRequestedOffsetRef.current === effectiveOffset) return;
    lastRequestedOffsetRef.current = effectiveOffset;

    loadingRef.current = true;
    setIsLoadingMore(true);
    try {
      await fetchHistory(false);
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [debouncedSearch, fetchHistory, hasMore, isLoadingMore, setIsLoadingMore]);

  return { fetchHistory, loadMoreHistory };
};

