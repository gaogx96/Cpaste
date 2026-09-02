import { useEffect, useRef } from "react";

interface UseSearchFetchTriggerOptions {
  debouncedSearch: string;
  isComposing: boolean;
  typeFilter: string | null;
  groupFilter: number | null;
  fetchHistory: (reset?: boolean) => void;
}

export const useSearchFetchTrigger = ({
  debouncedSearch,
  isComposing,
  typeFilter,
  groupFilter,
  fetchHistory
}: UseSearchFetchTriggerOptions) => {
  // 持有最新 fetchHistory 引用，避免因引用变化重复触发 effect
  const fetchRef = useRef(fetchHistory);

  // ① 必须声明在请求触发 effect 之前，保证 fetch 时 ref 已是最新
  useEffect(() => {
    fetchRef.current = fetchHistory;
  }, [fetchHistory]);

  // ② search 触发：受 isComposing 保护，避免输入法组合期间误触发
  useEffect(() => {
    if (!isComposing) {
      fetchRef.current(true);
    }
  }, [debouncedSearch, isComposing]);

  // ③ type + group 触发：无条件 reset（标签切换不受输入法状态约束）
  useEffect(() => {
    fetchRef.current(true);
  }, [typeFilter, groupFilter]);
};
