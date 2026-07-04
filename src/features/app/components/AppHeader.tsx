import { useEffect, useState, type RefObject } from "react";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import {
  ChevronLeft,
  Pin,
  PinOff,
  Search,
  Settings as SettingsIcon,
  Smile,
  Tag,
  Trash2,
  X
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getTagColor, getTagTextColor } from "../../../shared/lib/utils";
import type { SmartGroup } from "../../../shared/types/smartGroup";

/** Union type for all filter chips in the filter bar */
type FilterChip =
  | { kind: 'type'; typeKey: string }
  | { kind: 'smartGroup'; group: SmartGroup };

interface AppHeaderProps {
  t: (key: string) => string;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
  showTagManager: boolean;
  setShowTagManager: (val: boolean) => void;
  tagManagerEnabled: boolean;
  showEmojiPanel: boolean;
  setShowEmojiPanel: (val: boolean) => void;
  emojiPanelEnabled: boolean;
  isWindowPinned: boolean;
  setIsWindowPinned: (val: boolean) => void;
  clearHistory: () => void;
  showSearchBox: boolean;
  search: string;
  setSearch: (val: string) => void;
  setIsComposing: (val: boolean) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  showTagFilter: boolean;
  setShowTagFilter: (val: boolean) => void;
  allTags: string[];
  searchIsFocused: boolean;
  setSearchIsFocused: (val: boolean) => void;
  setEditingTagsId: (val: number | null) => void;
  theme: string;
  colorMode: string;
  settingsTitle: string;
  typeFilter: string | null;
  setTypeFilter: (val: string | null) => void;
  groupFilter: number | null;
  setGroupFilter: (val: number | null) => void;
  smartGroups: SmartGroup[];
  onSmartGroupReorder?: (newGroups: SmartGroup[]) => void;
  fetchHistory?: () => Promise<void>;
  onBack: () => void;
}

const AppHeader = ({
  t,
  showSettings,
  setShowSettings,
  showTagManager,
  setShowTagManager,
  tagManagerEnabled,
  showEmojiPanel,
  setShowEmojiPanel,
  emojiPanelEnabled,
  isWindowPinned,
  setIsWindowPinned,
  clearHistory,
  showSearchBox,
  search,
  setSearch,
  setIsComposing,
  searchInputRef,
  showTagFilter,
  setShowTagFilter,
  allTags,
  searchIsFocused,
  setSearchIsFocused,
  setEditingTagsId,
  theme,
  colorMode,
  settingsTitle,
  typeFilter,
  setTypeFilter,
  groupFilter,
  setGroupFilter,
  smartGroups,
  onSmartGroupReorder,
  fetchHistory,
  onBack,
}: AppHeaderProps) => {
  const getTypeName = (type: string) => {
    switch (type) {
      case "code": return t('type_code');
      case "link":
      case "url": return t('type_url');
      case "file": return t('type_file');
      case "image": return t('type_image');
      case "video": return t('type_video');
      case "rich_text": return t('type_rich_text');
      default: return t('type_text') || 'Text';
    }
  };

  // ── Unified filter-chip drag-reorder ──
  // Build initial chip list: type filters first, then enabled smart groups
  const TYPE_KEYS = ['text', 'image', 'file', 'url', 'code', 'video', 'rich_text'];
  const enabledGroups = smartGroups.filter(g => g.enabled);
  const buildChips = () => [
    ...TYPE_KEYS.map(tk => ({ kind: 'type' as const, typeKey: tk })),
    ...enabledGroups.map(g => ({ kind: 'smartGroup' as const, group: g })),
  ];

  const [filterChips, setFilterChips] = useState<FilterChip[]>(() => buildChips());
  // Sync when smartGroups change externally (settings page, etc.)
  // Preserves existing chip positions; only updates smart group data references.
  useEffect(() => {
    setFilterChips(prev => {
      const prevGroupIds = new Set(
        prev.filter((c): c is Extract<FilterChip, { kind: 'smartGroup' }> => c.kind === 'smartGroup')
          .map(c => c.group.id)
      );
      const curGroupIds = new Set(enabledGroups.map(g => g.id));
      const groupSetChanged = prevGroupIds.size !== curGroupIds.size ||
        [...prevGroupIds].some(id => !curGroupIds.has(id));

      if (groupSetChanged) {
        // Group added/removed → rebuild from scratch (type first, then groups)
        return [
          ...TYPE_KEYS.map(tk => ({ kind: 'type' as const, typeKey: tk })),
          ...enabledGroups.map(g => ({ kind: 'smartGroup' as const, group: g })),
        ];
      }
      // Only order changed → update references in-place, preserve chip positions
      const groupMap = new Map(enabledGroups.map(g => [g.id, g]));
      let changed = false;
      const next = prev.map(chip => {
        if (chip.kind === 'smartGroup' && groupMap.has(chip.group.id)) {
          const updated = { kind: 'smartGroup' as const, group: groupMap.get(chip.group.id)! };
          if (updated.group !== chip.group) changed = true;
          return updated;
        }
        return chip;
      });
      return changed ? next : prev;
    });
  }, [enabledGroups]);

  const handleFilterChipReorder = (reordered: FilterChip[]) => {
    setFilterChips(reordered);
    // Persist smart group order
    const newEnabled = reordered
      .filter((c): c is Extract<FilterChip, { kind: 'smartGroup' }> => c.kind === 'smartGroup')
      .map(c => c.group);
    onSmartGroupReorder?.(newEnabled);
  };
  // ───────────────────────────────────────

  return (
  <header className="window-drag-region">
    <div className="header-top">
      <div className="header-leading">
        {(showSettings || showTagManager || showEmojiPanel) && (
          <button className="btn-icon window-no-drag" onClick={onBack}>
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="header-drag-region" data-tauri-drag-region>
          <span className="header-title">
            {showEmojiPanel
              ? (t('emoji_panel') || '表情包')
              : showTagManager && tagManagerEnabled
                ? (t('tag_manager') || '标签管理')
                : showSettings
                  ? settingsTitle
                  : t('app_name')}
          </span>
        </div>
      </div>
      <div className="header-actions window-no-drag">
        {/* Pin Button - Always visible but single instance */}
        <button
          className={`btn-icon ${isWindowPinned ? 'active' : ''}`}
          title={t('pin')}
          onClick={() => {
            const newVal = !isWindowPinned;
            setIsWindowPinned(newVal);
            invoke("set_window_pinned", { pinned: newVal }).catch(console.error);
          }}
        >
          {isWindowPinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>

        {!showSettings && !showTagManager && !showEmojiPanel && (
          <>
            <button className="btn-icon" title={t('clear_history')} onClick={clearHistory}>
              <Trash2 size={16} />
            </button>
            {tagManagerEnabled && (
              <button className="btn-icon" title={t('tag_manager') || '标签管理'} onClick={() => setShowTagManager(true)}>
                <Tag size={16} />
              </button>
            )}
            {emojiPanelEnabled && (
              <button className="btn-icon" title={t('emoji_panel') || '表情包'} onClick={() => setShowEmojiPanel(true)}>
                <Smile size={16} />
              </button>
            )}
            <button className="btn-icon" title={t('settings')} onClick={() => setShowSettings(true)}>
              <SettingsIcon size={16} />
            </button>
          </>
        )}
        <button className="btn-icon" title={t('hide')} onClick={async () => {
          invoke("hide_window_cmd").catch(console.error);
        }}>
          <X size={16} />
        </button>
      </div>
    </div>

    {!showSettings && !showTagManager && !showEmojiPanel && (
      <AnimatePresence>
        {(showSearchBox || search.trim().length > 0) && (
          <motion.div
            initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
            animate={{
              height: "auto",
              opacity: 1,
              transitionEnd: { overflow: "visible" }
            }}
            exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
            transition={{ duration: 0.2, ease: "circOut" }}
            style={{ flexShrink: 0 }}
          >
            <div className="search-container window-no-drag">
              <div style={{ position: 'relative' }}>
                <Search size={14} className="search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  className={`search-input ${showTagFilter && allTags.length > 0 ? 'dropdown-open' : ''}`}
                  placeholder={t('search_placeholder')}
                  value={search}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={(e) => {
                    setIsComposing(false);
                    setSearch((e.target as HTMLInputElement).value);
                  }}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                  onMouseDown={() => {
                    invoke("activate_window_focus").catch(console.error);
                  }}
                  onClick={() => { setShowTagFilter(true); setEditingTagsId(null); }}
                  onFocus={() => {
                    invoke("activate_window_focus").catch(console.error);
                    setShowTagFilter(true);
                    setSearchIsFocused(true);
                    setEditingTagsId(null);
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowTagFilter(false);
                      setSearchIsFocused(false);
                    }, 200);
                  }}
                  style={{ color: colorMode === 'dark' ? '#ffffff' : undefined }}
                />
                {showTagFilter && searchIsFocused && allTags.length > 0 && (
                  <div className="tags-dropdown">
                    <div className="tags-label">{t('tags') || "Tags"}</div>
                    <div className="tags-list">
                      {allTags.map(tag => {
                        const tagBackground = getTagColor(tag, theme);
                        return (
                          <span
                            className="tag-chip"
                            key={tag}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSearch("tag:" + tag);
                              setShowTagFilter(false);
                            }}
                            data-tag={tag}
                            style={{ background: tagBackground, color: getTagTextColor(tagBackground) }}
                          >
                            {tag}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div
                className="hide-scrollbar"
                style={{
                  display: 'flex',
                  gap: '6px',
                  padding: '8px 0 0 0',
                  overflowX: 'auto',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                }}
                onWheel={(e) => {
                  if (e.deltaY !== 0) {
                    e.currentTarget.scrollLeft += e.deltaY;
                  }
                }}
              >
                {filterChips.length > 0 && (
                  <Reorder.Group
                    axis="x"
                    values={filterChips}
                    onReorder={handleFilterChipReorder}
                    as="div"
                    style={{
                      display: 'flex',
                      gap: '6px',
                      padding: 0,
                      margin: 0,
                    }}
                    transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                  >
                    {filterChips.map((chip, index) => {
                      const isFirst = index === 0;
                      if (chip.kind === 'type') {
                        const isActive = typeFilter === chip.typeKey;
                        return (
                          <Reorder.Item
                            key={chip.typeKey}
                            value={chip}
                            as="div"
                            className={`btn-icon ${isActive ? 'active' : ''}`}
                            whileDrag={{ scale: 1.06, boxShadow: '0 2px 10px rgba(0,0,0,0.18)' }}
                            onClick={() => { setTypeFilter(isActive ? null : chip.typeKey); setGroupFilter(null); }}
                            style={{
                              width: 'auto',
                              padding: '4px 8px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                              opacity: isActive ? 1 : 0.7,
                              borderLeft: isFirst ? '1px solid var(--border-color)' : undefined,
                              marginLeft: isFirst ? 6 : 0,
                              paddingLeft: isFirst ? 12 : 8,
                              cursor: 'grab',
                              listStyle: 'none',
                              userSelect: 'none',
                            }}
                            title={getTypeName(chip.typeKey)}
                          >
                            {getTypeName(chip.typeKey)}
                          </Reorder.Item>
                        );
                      } else {
                        // smartGroup chip
                        const g = chip.group;
                        const isActive = groupFilter === g.id;
                        return (
                          <Reorder.Item
                            key={`group-${g.id}`}
                            value={chip}
                            as="div"
                            className={`btn-icon ${isActive ? 'active' : ''}`}
                            whileDrag={{ scale: 1.06, boxShadow: '0 2px 10px rgba(0,0,0,0.18)' }}
                            onClick={() => { setGroupFilter(isActive ? null : g.id); setTypeFilter(null); fetchHistory?.(); }}
                            style={{
                              width: 'auto',
                              padding: '4px 8px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                              opacity: isActive ? 1 : 0.7,
                              borderLeft: isFirst ? '1px solid var(--border-color)' : undefined,
                              marginLeft: isFirst ? 6 : 0,
                              paddingLeft: isFirst ? 12 : 8,
                              cursor: 'grab',
                              listStyle: 'none',
                              userSelect: 'none',
                            }}
                            title={g.name}
                          >
                            {g.name}
                          </Reorder.Item>
                        );
                      }
                    })}
                  </Reorder.Group>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    )}
  </header>
);
};

export default AppHeader;
