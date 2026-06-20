import { invoke } from "@tauri-apps/api/core";
import type { SmartGroup, SmartGroupRule, SmartGroupExample } from "../../../shared/types/smartGroup";
import type { ClipboardEntry } from "../../../shared/types/clipboard";

// ─── Group CRUD ───

export const createSmartGroup = async (params: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  enabled?: boolean;
  auto_match_enabled?: boolean;
  is_sensitive?: boolean;
  sort_order?: number;
}): Promise<number> => {
  return invoke("create_smart_group", {
    name: params.name,
    description: params.description,
    color: params.color,
    icon: params.icon,
    enabled: params.enabled,
    autoMatchEnabled: params.auto_match_enabled,
    isSensitive: params.is_sensitive,
    sortOrder: params.sort_order,
  });
};

export const updateSmartGroup = async (params: {
  id: number;
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  enabled?: boolean;
  auto_match_enabled?: boolean;
  is_sensitive?: boolean;
  sort_order?: number;
}): Promise<void> => {
  return invoke("update_smart_group", {
    id: params.id,
    name: params.name,
    description: params.description,
    color: params.color,
    icon: params.icon,
    enabled: params.enabled,
    autoMatchEnabled: params.auto_match_enabled,
    isSensitive: params.is_sensitive,
    sortOrder: params.sort_order,
  });
};

export const deleteSmartGroup = async (id: number): Promise<void> => {
  return invoke("delete_smart_group", { id });
};

export const listSmartGroups = async (): Promise<SmartGroup[]> => {
  return invoke("list_smart_groups");
};

export const getSmartGroupDetail = async (id: number): Promise<SmartGroup | null> => {
  return invoke("get_smart_group_detail", { id });
};

export const getSmartGroupCount = async (groupId: number): Promise<number> => {
  return invoke("get_smart_group_count", { groupId });
};

// ─── Rule CRUD ───

export const createSmartGroupRule = async (params: {
  groupId: number;
  ruleType: string;
  pattern: string;
  weight?: number;
}): Promise<number> => {
  return invoke("create_smart_group_rule", params);
};

export const deleteSmartGroupRule = async (id: number): Promise<void> => {
  return invoke("delete_smart_group_rule", { id });
};

export const listSmartGroupRules = async (groupId: number): Promise<SmartGroupRule[]> => {
  return invoke("list_smart_group_rules", { groupId });
};

// ─── Example CRUD ───

export const createSmartGroupExample = async (params: {
  groupId: number;
  exampleText: string;
  note?: string;
}): Promise<number> => {
  return invoke("create_smart_group_example", params);
};

export const deleteSmartGroupExample = async (id: number): Promise<void> => {
  return invoke("delete_smart_group_example", { id });
};

export const listSmartGroupExamples = async (groupId: number): Promise<SmartGroupExample[]> => {
  return invoke("list_smart_group_examples", { groupId });
};

export const addClipboardEntryAsGroupExample = async (entryId: number, groupId: number): Promise<number> => {
  return invoke("add_clipboard_entry_as_group_example", { entryId, groupId });
};

// ─── Clipboard Entry Group Operations ───

export const assignEntryToGroup = async (entryId: number, groupId: number): Promise<void> => {
  return invoke("assign_clipboard_entry_to_group", { entryId, groupId });
};

export const removeEntryFromGroup = async (entryId: number): Promise<void> => {
  return invoke("remove_clipboard_entry_from_group", { entryId });
};

export const updateEntryNote = async (entryId: number, note: string): Promise<void> => {
  return invoke("update_clipboard_entry_note", { entryId, note });
};

/** Re-run classification on existing unclassified entries */
export const reclassifyEntries = async (): Promise<number> => {
  return invoke("reclassify_entries");
};

/** Export a group's entries as Markdown. Returns { content, filename }. */
export const exportGroupMarkdown = async (groupId: number): Promise<{ content: string; filename: string }> => {
  const raw: string = await invoke("export_group_markdown", { groupId });
  return JSON.parse(raw);
};

export const getClipboardHistoryByGroup = async (
  groupId: number | null,
  limit?: number,
  offset?: number
): Promise<ClipboardEntry[]> => {
  return invoke("get_clipboard_history_by_group", { groupId, limit, offset });
};
