import { useCallback, useEffect, useState } from "react";
import type { SmartGroup, SmartGroupRule, SmartGroupExample } from "../../../shared/types/smartGroup";
import * as api from "../api/smartGroupApi";

export const useSmartGroups = () => {
  const [groups, setGroups] = useState<SmartGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listSmartGroups();
      // Fetch entry count for each group
      const withCounts = await Promise.all(
        list.map(async (g) => {
          try {
            const count = await api.getSmartGroupCount(g.id);
            return { ...g, entry_count: count };
          } catch {
            return g;
          }
        })
      );
      setGroups(withCounts);
    } catch (e) {
      console.error("Failed to load smart groups", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createGroup = useCallback(
    async (params: {
      name: string;
      description?: string;
      color?: string;
      auto_match_enabled?: boolean;
      is_sensitive?: boolean;
    }) => {
      await api.createSmartGroup(params);
      await refresh();
    },
    [refresh]
  );

  const updateGroup = useCallback(
    async (params: {
      id: number;
      name?: string;
      description?: string;
      color?: string;
      enabled?: boolean;
      auto_match_enabled?: boolean;
      is_sensitive?: boolean;
    }) => {
      await api.updateSmartGroup(params);
      await refresh();
    },
    [refresh]
  );

  const deleteGroup = useCallback(
    async (id: number) => {
      await api.deleteSmartGroup(id);
      await refresh();
    },
    [refresh]
  );

  return {
    groups,
    loading,
    refresh,
    createGroup,
    updateGroup,
    deleteGroup,
  };
};

/** Hook for managing rules of a specific group */
export const useGroupRules = (groupId: number | null) => {
  const [rules, setRules] = useState<SmartGroupRule[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (groupId === null) return;
    setLoading(true);
    try {
      const list = await api.listSmartGroupRules(groupId);
      setRules(list);
    } catch (e) {
      console.error("Failed to load rules", e);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addRule = useCallback(
    async (params: { ruleType: string; pattern: string; weight?: number }) => {
      if (groupId === null) return;
      await api.createSmartGroupRule({ groupId, ...params });
      await refresh();
    },
    [groupId, refresh]
  );

  const removeRule = useCallback(
    async (ruleId: number) => {
      await api.deleteSmartGroupRule(ruleId);
      await refresh();
    },
    [refresh]
  );

  return { rules, loading, refresh, addRule, removeRule };
};

/** Hook for managing examples of a specific group */
export const useGroupExamples = (groupId: number | null) => {
  const [examples, setExamples] = useState<SmartGroupExample[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (groupId === null) return;
    setLoading(true);
    try {
      const list = await api.listSmartGroupExamples(groupId);
      setExamples(list);
    } catch (e) {
      console.error("Failed to load examples", e);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addExample = useCallback(
    async (params: { exampleText: string; note?: string }) => {
      if (groupId === null) return;
      await api.createSmartGroupExample({ groupId, ...params });
      await refresh();
    },
    [groupId, refresh]
  );

  const removeExample = useCallback(
    async (exampleId: number) => {
      await api.deleteSmartGroupExample(exampleId);
      await refresh();
    },
    [refresh]
  );

  return { examples, loading, refresh, addExample, removeExample };
};
