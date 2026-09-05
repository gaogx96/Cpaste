import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Dispatch, SetStateAction } from "react";
import type { ClipboardEntry } from "../types";

interface HistoryPage {
  items: ClipboardEntry[];
  has_more: boolean;
  next_offset: number;
}

interface UseHistoryFetchOptions {
  debouncedSearch: string;
  typeFilter: string | null;
  groupFilter: number | null;
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
  groupFilter,
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
        // reset 时显式使用 offset=0，不读闭包里的旧 offset
        const baseOffset = reset ? 0 : Math.min(currentOffsetRef.current, historyLengthRef.current);

        const hasSearch = debouncedSearch && debouncedSearch.trim().length > 0;

        if (hasSearch) {
          let term = debouncedSearch;
          let tagOnly = false;
          if (term.startsWith("tag:")) {
            term = term.slice(4);
            tagOnly = true;
          }

          let data: ClipboardEntry[] = [];
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

          if (seq !== fetchSeqRef.current) {
            return;
          }
          // Search results are not paginated; always replace list and stop infinite loading.
          setHistory(data);
          setCurrentOffset(data.length);
          setHasMore(false);
          currentOffsetRef.current = data.length;
          historyLengthRef.current = data.length;
        } else {
          // 消费后端分页对象 {items, has_more, next_offset}，不再自己推断游标
          // 注意：Tauri v2 会把 camelCase 参数名自动映射到后端 snake_case，
          // 所以必须用 smartGroupId / contentType，而不是 smart_group_id / content_type
          const page = await invoke<HistoryPage>("get_clipboard_history", {
            limit: pageSize,
            offset: baseOffset,
            contentType: typeFilter || undefined,
            smartGroupId: groupFilter ?? undefined
          });

          if (seq !== fetchSeqRef.current) {
            return;
          }

          if (reset) {
            setHistory(page.items);
            setCurrentOffset(page.next_offset);
            setHasMore(page.has_more);
            currentOffsetRef.current = page.next_offset;
            historyLengthRef.current = page.items.length;
          } else {
            // 丢弃切换标签（reset）之前发起的 loadMore 结果，防止旧标签数据污染新标签列表
            if (seq <= resetSeqRef.current) {
              return;
            }
            // append with stable id dedup (session items use negative IDs that never collide with DB)
            const incomingIds = new Set(page.items.map((item) => item.id));
            setHistory((prev) => {
              const filtered = page.items.filter((item) => !prev.some((p) => p.id === item.id));
              if (filtered.length === 0) return prev;
              return [...prev, ...filtered];
            });
            setCurrentOffset(page.next_offset);
            setHasMore(page.has_more);
            currentOffsetRef.current = page.next_offset;
            historyLengthRef.current = historyLengthRef.current + incomingIds.size;
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
      groupFilter,
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
