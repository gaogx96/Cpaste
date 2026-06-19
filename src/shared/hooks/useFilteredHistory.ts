import { useMemo } from "react";
import type { ClipboardEntry } from "../types";

interface UseFilteredHistoryOptions {
  history: ClipboardEntry[];
  search: string;
  typeFilter: string | null;
  groupFilter: number | null;
  /** Entry IDs that match the current group filter (live-matched from backend) */
  matchedGroupEntryIds: Set<number>;
}

export const useFilteredHistory = ({
  history,
  search,
  typeFilter,
  groupFilter,
  matchedGroupEntryIds
}: UseFilteredHistoryOptions) => {
  return useMemo(() => {
    const lowerSearch = search.toLowerCase();

    const filtered = history.filter((item) => {
      if (typeFilter && item.content_type !== typeFilter) {
        return false;
      }
      if (groupFilter !== null && !matchedGroupEntryIds.has(item.id)) {
        return false;
      }

      let effectiveSearch = lowerSearch;
      const isTagSearch = effectiveSearch.startsWith("tag:");
      if (isTagSearch) {
        effectiveSearch = effectiveSearch.slice(4);
      }

      if (!effectiveSearch) return true;

      if (isTagSearch) {
        return item.tags?.some((tag) => tag.toLowerCase().includes(effectiveSearch)) ?? false;
      }

      return (
        item.content?.toLowerCase().includes(effectiveSearch) ||
        item.source_app?.toLowerCase().includes(effectiveSearch) ||
        item.tags?.some((tag) => tag.toLowerCase().includes(effectiveSearch)) ||
        item.note?.toLowerCase().includes(effectiveSearch) ||
        item.smart_group_name?.toLowerCase().includes(effectiveSearch)
      );
    });

    return filtered.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) {
        return a.is_pinned ? -1 : 1;
      }
      if (a.is_pinned) {
        if ((a.pinned_order || 0) !== (b.pinned_order || 0)) {
          return (b.pinned_order || 0) - (a.pinned_order || 0);
        }
        return b.timestamp - a.timestamp;
      }
      return b.timestamp - a.timestamp;
    });
  }, [history, search, typeFilter, groupFilter, matchedGroupEntryIds]);
};
