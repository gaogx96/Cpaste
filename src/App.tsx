import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ToastContainer from "./shared/components/ToastContainer";
import ConfirmDialog from "./shared/components/ConfirmDialog";

import { translations } from "./locales";
import AppHeader from "./features/app/components/AppHeader";
import AppMainContent from "./features/app/components/AppMainContent";
import { useAppState } from "./features/app/hooks/useAppState";
import type { SmartGroup } from "./shared/types/smartGroup";
import { useSettingsPanelProps } from "./features/settings/hooks/useSettingsPanelProps";
import { useDebounce } from "./shared/hooks/useDebounce";
import { useHistoryFetch } from "./shared/hooks/useHistoryFetch";
import { useHotkeyConfig } from "./shared/hooks/useHotkeyConfig";
import { useInputFocus } from "./shared/hooks/useInputFocus";
import { useSearchScroll } from "./shared/hooks/useSearchScroll";
import { useSettingsApply } from "./shared/hooks/useSettingsApply";
import { useSettingsInit } from "./shared/hooks/useSettingsInit";
import { useSettingsPostInit } from "./shared/hooks/useSettingsPostInit";
import { useSettingsSync } from "./shared/hooks/useSettingsSync";
import { useTagColors } from "./shared/hooks/useTagColors";
import { useClipboardEvents } from "./shared/hooks/useClipboardEvents";
import { useClipboardActions } from "./shared/hooks/useClipboardActions";
import { useSoundEffects } from "./shared/hooks/useSoundEffects";
import { useWindowPinnedListener } from "./shared/hooks/useWindowPinnedListener";
import { useCustomBackground } from "./shared/hooks/useCustomBackground";
import { useToastListener } from "./shared/hooks/useToastListener";
import { useAppBootstrap } from "./shared/hooks/useAppBootstrap";
import { useAppActions } from "./shared/hooks/useAppActions";
import { useNavigationSync } from "./shared/hooks/useNavigationSync";
import { useContextMenuBlock } from "./shared/hooks/useContextMenuBlock";
import { useSettingsPanelReset } from "./shared/hooks/useSettingsPanelReset";
import { useTagManagerRefresh } from "./shared/hooks/useTagManagerRefresh";
import { matchesHotkey } from "./shared/hooks/useHotkeyMatching";
import { usePinnedSort } from "./shared/hooks/usePinnedSort";
import { useFilteredHistory } from "./shared/hooks/useFilteredHistory";
import { useKeyboardNavigation } from "./shared/hooks/useKeyboardNavigation";
import { useListSelectionReset } from "./shared/hooks/useListSelectionReset";
import { useSearchFetchTrigger } from "./shared/hooks/useSearchFetchTrigger";
import { useScrollToSelection } from "./shared/hooks/useScrollToSelection";
import { useClipboardItemRenderer } from "./shared/hooks/useClipboardItemRenderer";
import { useOverlays } from "./shared/hooks/useOverlays";
import type { ClipboardEntry } from "./shared/types";
import type { QuickPasteHint, VirtualClipboardListHandle } from "./features/clipboard/types";

/** Must match privacy blur checks in `useClipboardItemRenderer` / `ClipboardItem`. */
const BUILTIN_SENSITIVE_TAG_NAMES = ["sensitive", "密码", "password"] as const;
import type { QuickPasteModifier } from "./features/app/types";
import { isMacPlatform } from "./shared/lib/platform";
import { isTauriRuntime } from "./shared/lib/tauriRuntime";

const insertHistoryItem = (list: ClipboardEntry[], item: ClipboardEntry) => {
  const next = list.slice();
  const isPinned = !!item.is_pinned;
  let insertIndex = 0;

  if (isPinned) {
    while (insertIndex < next.length) {
      const current = next[insertIndex];
      if (!current.is_pinned) break;
      if (current.timestamp < item.timestamp) break;
      insertIndex++;
    }
  } else {
    while (insertIndex < next.length && next[insertIndex].is_pinned) {
      insertIndex++;
    }
    while (insertIndex < next.length) {
      const current = next[insertIndex];
      if (current.is_pinned) {
        insertIndex++;
        continue;
      }
      if (current.timestamp < item.timestamp) break;
      insertIndex++;
    }
  }

  next.splice(insertIndex, 0, item);
  return next;
};

const QUICK_PASTE_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

const buildQuickPasteHintsById = (
  items: ClipboardEntry[],
  quickPasteModifier: QuickPasteModifier
): Record<number, QuickPasteHint> => {
  if (quickPasteModifier === "disabled") {
    return {};
  }

  const modifierLabels: Record<Exclude<QuickPasteModifier, "disabled">, string> = isMacPlatform()
    ? {
        ctrl: "⌃",
        alt: "⌥",
        shift: "⇧",
        win: "⌘"
      }
    : {
        ctrl: "Ctrl+",
        alt: "Alt+",
        shift: "Shift+",
        win: "Win+"
      };
  const pinnedItems = items.filter((item) => item.is_pinned).slice(0, QUICK_PASTE_KEYS.length);

  return pinnedItems.reduce<Record<number, QuickPasteHint>>((acc, item, index) => {
    acc[item.id] = {
      slot: index + 1,
      combo: `${modifierLabels[quickPasteModifier]}${QUICK_PASTE_KEYS[index]}`
    };
    return acc;
  }, {});
};

const App = () => {
  const appState = useAppState();
  const {
    showSettings,
    setShowSettings,
    settingsSubpage,
    setSettingsSubpage,
    showTagManager,
    setShowTagManager,
    tagManagerEnabled,
    setTagManagerEnabled,
    setCollapsedGroups,
    history,
    setHistory,
    search,
    setSearch,
    isComposing,
    setIsComposing,
    searchIsFocused,
    setSearchIsFocused,
    showTagFilter,
    setShowTagFilter,
    tagInput,
    setTagInput,
    showEmojiPanel,
    setShowEmojiPanel,
    emojiFavorites,
    setEmojiFavorites,
    editingTagsId,
    setEditingTagsId,
    revealedIds,
    setRevealedIds,
    setAutoStart,
    deduplicate,
    setDeduplicate,
    persistent,
    setPersistent,
    persistentLimitEnabled,
    setPersistentLimitEnabled,
    persistentLimit,
    setPersistentLimit,
    appSettings,
    setAppSettings,
    setDefaultApps,
    setInstalledApps,
    setDataPath,
    hotkey,
    setHotkey,
    richPasteHotkey,
    setRichPasteHotkey,
    searchHotkey,
    setSearchHotkey,
    sequentialHotkey,
    setSequentialHotkey,
    sequentialMode,
    setSequentialModeState,
    isRecordingSequential,
    setIsRecordingSequential,
    quickPasteModifier,
    setQuickPasteModifier,
    isRecording,
    setIsRecording,
    isRecordingRich,
    setIsRecordingRich,
    isRecordingSearch,
    setIsRecordingSearch,
    deleteAfterPaste,
    setDeleteAfterPaste,
    moveToTopAfterPaste,
    setMoveToTopAfterPaste,
    setCleanupRules,
    setAppCleanupPolicies,
    captureFiles,
    setCaptureFiles,
    captureRichText,
    setCaptureRichText,
    richTextSnapshotPreview,
    setRichTextSnapshotPreview,
    setSilentStart,
    followMouse: _followMouse,
    setFollowMouse,
    showAppBorder,
    setShowAppBorder,
    winClipboardDisabled: _winClipboardDisabled,
    setWinClipboardDisabled,
    registryWinVEnabled: _registryWinVEnabled,
    setRegistryWinVEnabled,
    pasteMethod: _pasteMethod,
    setPasteMethod,
    theme,
    setTheme,
    colorMode,
    setColorMode,
    showSourceAppIcon,
    setShowSourceAppIcon,

    compactMode,
    setCompactMode,
    clipboardItemFontSize,
    setClipboardItemFontSize,
    clipboardTagFontSize,
    setClipboardTagFontSize,
    emojiPanelEnabled,
    setEmojiPanelEnabled,
    emojiPanelTab,
    setEmojiPanelTab,
    language,
    setLanguage,
    settingsLoaded,
    setSettingsLoaded,
    isWindowPinned,
    setIsWindowPinned,
    showSearchBox,
    setShowSearchBox,
    scrollTopButtonEnabled,
    setScrollTopButtonEnabled,
    arrowKeySelection,
    setArrowKeySelection,
    setHideTrayIcon,
    setHideDockIcon,
    customBackground,
    setCustomBackground,
    customBackgroundOpacity,
    setCustomBackgroundOpacity,
    surfaceOpacity,
    setSurfaceOpacity,
    selectedIndex,
    setSelectedIndex,
    isKeyboardMode,
    setIsKeyboardMode,
    isLoadingMore,
    setIsLoadingMore,
    hasMore,
    setHasMore,
    currentOffset,
    setCurrentOffset,
    soundEnabled,
    setSoundEnabled,
    pasteSoundEnabled,
    setPasteSoundEnabled,
    soundVolume,
    setSoundVolume,
    processingAiId,
    typeFilter,
    setTypeFilter,
    groupFilter,
    setGroupFilter
  } = appState;

  const effectiveShowEmojiPanel = showEmojiPanel && emojiPanelEnabled;
  const effectiveShowTagManager = showTagManager && tagManagerEnabled;

  const debouncedSearch = useDebounce(search, 400);
  const searchInputRef = useInputFocus<HTMLInputElement>();
  const tagColors = useTagColors();
  const virtualListRef = useRef<VirtualClipboardListHandle | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [quickPasteHintsById, setQuickPasteHintsById] = useState<Record<number, QuickPasteHint>>(
    {}
  );
  const [smartGroups, setSmartGroups] = useState<SmartGroup[]>([]);
  useEffect(() => {
    invoke<SmartGroup[]>("list_smart_groups").then(setSmartGroups).catch(() => {});
  }, []);
  const PAGE_SIZE = 80;
  const { fetchHistory, loadMoreHistory } = useHistoryFetch({
    debouncedSearch,
    typeFilter,
    persistentLimitEnabled,
    persistentLimit,
    pageSize: PAGE_SIZE,
    currentOffset,
    historyLength: history.length,
    setHistory,
    setCurrentOffset,
    setHasMore,
    isLoadingMore,
    hasMore,
    setIsLoadingMore
  });

  const t = useCallback((key: string) => {
    const k = key as keyof typeof translations['zh'];
    return translations[language][k] || translations['en'][k] || key;
  }, [language]);

  const { handleListScroll: handleSearchScroll, handleMainWheel } = useSearchScroll({
    showSearchBox,
    setShowSearchBox,
    search,
    showSettings,
    showTagManager: effectiveShowTagManager,
    appSettings
  });

  const showScrollTopVisible = showScrollTop && scrollTopButtonEnabled;

  const handleHeaderBack = useCallback(() => {
    if (effectiveShowEmojiPanel) {
      setShowEmojiPanel(false);
      return;
    }
    if (effectiveShowTagManager) {
      setShowTagManager(false);
      return;
    }
    if (showSettings) {
      if (settingsSubpage !== "home") {
        setSettingsSubpage("home");
        return;
      }
      setShowSettings(false);
    }
  }, [
    effectiveShowEmojiPanel,
    effectiveShowTagManager,
    setShowEmojiPanel,
    setShowSettings,
    setSettingsSubpage,
    setShowTagManager,
    settingsSubpage,
    showSettings
  ]);

  const handleListScroll = useCallback((offset: number) => {
    handleSearchScroll(offset);
    setShowScrollTop(offset > 200);
  }, [handleSearchScroll]);

  const handleScrollTop = useCallback(() => {
    if (virtualListRef.current?.scrollToTop) {
      virtualListRef.current.scrollToTop();
      return;
    }
    virtualListRef.current?.scrollToItem(0);
  }, []);

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  const hotkeyParts = useMemo(
    () => (hotkey || '').split('+').map((part) => part.trim()).filter(Boolean),
    [hotkey]
  );

  // Compute all tags when tag manager / tag filter is open, or while editing an item's tags (quick-pick list)
  const allTags = useMemo(() => {
    if (!effectiveShowTagManager && !showTagFilter && editingTagsId === null) return [];

    const set = new Set<string>();
    for (const tag of BUILTIN_SENSITIVE_TAG_NAMES) {
      set.add(tag);
    }
    history.forEach((item) => {
      (item.tags || []).forEach((tag) => set.add(tag));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [history, effectiveShowTagManager, showTagFilter, editingTagsId]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (isRecording || isRecordingRich || isRecordingSearch) return;
      if (!hotkey || hotkey === t('not_set')) return;

      const activeEl = document.activeElement as HTMLElement | null;
      const isEditable = !!activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.isContentEditable
      );

      if (matchesHotkey(event, hotkey)) {
        event.preventDefault();
        invoke("toggle_window_cmd").catch(console.error);
        return;
      }

      if (!isEditable && hotkey.toUpperCase().includes('WIN') && matchesHotkey(event, hotkey, { ignoreWin: true })) {
        event.preventDefault();
        invoke("toggle_window_cmd").catch(console.error);
      }
    };

    window.addEventListener('keydown', handleKeydown, true);
    return () => window.removeEventListener('keydown', handleKeydown, true);
  }, [hotkey, isRecording, isRecordingRich, isRecordingSearch, t]);


  const { toasts, pushToast, confirmDialog, openConfirm, closeConfirm } = useOverlays();

  useSoundEffects({ soundEnabled, pasteSoundEnabled, soundVolume });

  const tagManagerSizeRef = useRef<{ width: number; height: number } | null>(null);

  const settings = useSettingsInit({
    setAppSettings,
    setHotkey,
    setTheme,
    setColorMode,
    setCompactMode,
    setLanguage
  });

  useSettingsPostInit({
    settings,
    tagManagerSizeRef,
    setCustomBackground,
    setCustomBackgroundOpacity,
    setSurfaceOpacity,
    setClipboardItemFontSize,
    setClipboardTagFontSize,
    setEmojiPanelEnabled,
    setTagManagerEnabled,
    setEmojiPanelTab,
    setEmojiFavorites,
    setPersistent,
    setPersistentLimitEnabled,
    setPersistentLimit,
    setDeduplicate,
    setCaptureFiles,
    setCaptureRichText,
    setRichTextSnapshotPreview,
    setCleanupRules,
    setAppCleanupPolicies,
    setSilentStart,
    setFollowMouse,
    setShowAppBorder,
    setRegistryWinVEnabled,
    setPasteMethod,
    setShowSourceAppIcon,

    setDeleteAfterPaste,
    setMoveToTopAfterPaste,
    setHideTrayIcon,
    setHideDockIcon,
    setShowSearchBox,
    setScrollTopButtonEnabled,
    setArrowKeySelection,
    setRichPasteHotkey,
    setSearchHotkey,
    setSequentialHotkey,
    setSequentialModeState,
    setQuickPasteModifier,
    setSoundEnabled,
    setPasteSoundEnabled,
    setSoundVolume,
    setIsWindowPinned,
    setSettingsLoaded
  });

  useEffect(() => {
    if (!isTauriRuntime()) return;

    const unlisten = listen("focus-search-input", () => {
      setShowSettings(false);
      setShowTagManager(false);
      setShowEmojiPanel(false);
      setShowSearchBox(true);
      setSearchIsFocused(true);
      invoke("activate_window_focus")
        .catch(console.error)
        .finally(() => {
          requestAnimationFrame(() => {
            searchInputRef.current?.focus();
          });
        });
    });

    return () => {
      unlisten.then((off) => off());
    };
  }, [
    setShowSettings,
    setShowTagManager,
    setShowEmojiPanel,
    setShowSearchBox,
    setSearchIsFocused,
    searchInputRef
  ]);

  useEffect(() => {
    if (!emojiPanelEnabled && showEmojiPanel) {
      setShowEmojiPanel(false);
    }
  }, [emojiPanelEnabled, showEmojiPanel, setShowEmojiPanel]);

  useEffect(() => {
    if (!tagManagerEnabled && showTagManager) {
      setShowTagManager(false);
    }
  }, [tagManagerEnabled, showTagManager, setShowTagManager]);

  useAppBootstrap({
    setDataPath,
    setInstalledApps,
    setAutoStart,
    setDefaultApps,
    setWinClipboardDisabled
  });

  useWindowPinnedListener({
    onPinnedChange: setIsWindowPinned
  });

  useContextMenuBlock();

  useSettingsApply({
    theme,
    colorMode,

    compactMode,
    settingsLoaded,
    clipboardItemFontSize,
    clipboardTagFontSize,
    surfaceOpacity,
    showAppBorder
  });

  useCustomBackground({ customBackground, customBackgroundOpacity, theme });

  useClipboardEvents({
    onUpdated: (updatedItem) => {
      setHistory(prev => {
        const withoutItem = prev.filter(item => item.id !== updatedItem.id);
        return insertHistoryItem(withoutItem, updatedItem);
      });
    },
    onRemoved: (id) => {
      setHistory(prev => prev.filter(item => item.id !== id));
    },
    onChanged: () => {
      fetchHistory(true);
    }
  });

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const seededHints = buildQuickPasteHintsById(history, quickPasteModifier);
    setQuickPasteHintsById(seededHints);

    if (quickPasteModifier === "disabled") {
      return () => {
        cancelled = true;
      };
    }

    invoke<ClipboardEntry[]>("get_clipboard_history", {
      limit: 256,
      offset: 0,
      contentType: null
    })
      .then((items) => {
        if (!cancelled) {
          setQuickPasteHintsById(buildQuickPasteHintsById(items, quickPasteModifier));
        }
      })
      .catch((error) => {
        console.error("Failed to refresh quick paste hints:", error);
        if (!cancelled) {
          setQuickPasteHintsById(seededHints);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [history, quickPasteModifier]);

  useToastListener({ pushToast });

  useSettingsPanelReset({ showSettings, setCollapsedGroups, setSettingsSubpage });

  useTagManagerRefresh({
    showTagManager: effectiveShowTagManager,
    settingsLoaded,
    persistentLimitEnabled,
    persistentLimit,
    fetchHistory
  });

  const saveAppSetting = useCallback(async (type: string, path: string) => {
    const key = `app.${type}`;
    console.log(`[THEME DEBUG] saveAppSetting called: key=${key}, value=${path}`);
    setAppSettings(prev => ({ ...prev, [key]: path }));

    // Sync theme-related settings to localStorage for instant startup (prevents flash)
    try {
      if (type === 'theme') localStorage.setItem('cpaste_theme', path);
      if (type === 'color_mode') localStorage.setItem('cpaste_color_mode', path);
      if (type === 'compact_mode') localStorage.setItem('cpaste_compact_mode', path);
    } catch (e) {
      // Ignore localStorage errors
    }

    try {
      await invoke("save_setting", { key, value: path });
      console.log(`[THEME DEBUG] saveAppSetting success: key=${key}`);
    } catch (err) {
      console.error("保存设置失败", err);
    }
  }, [setAppSettings]);

  const saveSetting = useCallback((key: string, val: string) => {
    invoke("save_setting", { key, value: val })
      .then(() => undefined)
      .catch(console.error);
  }, []);

  useSettingsSync({
    settingsLoaded,
    deduplicate,
    saveAppSetting,
    captureFiles,
    captureRichText,
    persistent,
    arrowKeySelection,
    soundVolume,
    setIsKeyboardMode,
    setSelectedIndex
  });

  const {
    checkHotkeyConflict,
    updateHotkey,
    updateRichPasteHotkey,
    updateSearchHotkey,
    updateSequentialHotkey
  } =
    useHotkeyConfig({
      hotkey,
      setHotkey,
      richPasteHotkey,
      setRichPasteHotkey,
      searchHotkey,
      setSearchHotkey,
      sequentialHotkey,
      setSequentialHotkey,
      sequentialMode,
      isRecording,
      setIsRecording,
      isRecordingRich,
      setIsRecordingRich,
      isRecordingSearch,
      setIsRecordingSearch,
      isRecordingSequential,
      setIsRecordingSequential,
      saveAppSetting,
      t,
      pushToast
    });

  useNavigationSync({ showSettings, showTagManager: effectiveShowTagManager, showEmojiPanel: effectiveShowEmojiPanel });

  const { copyToClipboard, openContent, deleteEntry, togglePin, handleUpdateTags } =
    useClipboardActions({
      t,
      pushToast,
      deleteAfterPaste,
      moveToTopAfterPaste,
      setSearch,
      setHistory,
      virtualListRef
    });

  const { clearHistory, handleResetSettings } = useAppActions({
    t,
    openConfirm,
    closeConfirm,
    pushToast,
    fetchHistory
  });

  /*
  const updateItemContent = async (id: number, newContent: string) => {
    try {
      await invoke("update_item_content", { id, newContent });
      // Local state will be refreshed by fetchHistory triggered by clipboard-changed event
    } catch (err) {
      console.error("Failed to update item content", err);
    }
  };
  */

  const filteredHistory = useFilteredHistory({
    history,
    search,
    typeFilter,
    groupFilter
  });

  const effectiveHasMore = hasMore && filteredHistory.length >= PAGE_SIZE;

  const { pinnedItems, unpinnedItems, handlePinnedReorder } = usePinnedSort({
    filteredHistory,
    history,
    setHistory
  });

  useListSelectionReset({ filteredHistory, setSelectedIndex });

  useSearchFetchTrigger({ debouncedSearch, isComposing, typeFilter, fetchHistory });

  useScrollToSelection({
    filteredHistory,
    selectedIndex,
    isKeyboardMode,
    pinnedCount: pinnedItems.length,
    virtualListRef
  });

  useKeyboardNavigation({
    filteredHistory,
    selectedIndex,
    setSelectedIndex,
    isKeyboardMode,
    setIsKeyboardMode,
    showSettings,
    showTagManager: effectiveShowTagManager,
    editingTagsId,
    arrowKeySelection,
    richPasteHotkey,
    searchInputRef,
    copyToClipboard,
    setSearch
  });


  const { renderItemContent } = useClipboardItemRenderer({
    revealedIds,
    isKeyboardMode,
    selectedIndex,
    isWindowPinned,
    editingTagsId,
    tagInput,
    allTags,
    tagColors,
    theme,
    language,
    t,
    showSourceAppIcon,
    compactMode,
    richTextSnapshotPreview,
    quickPasteHintsById,
    processingAiId,
    copyToClipboard,
    setSelectedIndex,
    setRevealedIds,
    openContent,
    togglePin,
    deleteEntry,
    setEditingTagsId,
    setTagInput,
    handleUpdateTags,
  });

  const settingsPanelProps = useSettingsPanelProps({
    t,
    theme,
    language,
    colorMode,
    hotkeyParts,
    checkHotkeyConflict,
    updateHotkey,
    updateRichPasteHotkey,
    updateSearchHotkey,
    updateSequentialHotkey,
    saveAppSetting,
    saveSetting,
    handleResetSettings,
    toggleGroup,
    state: appState
  });

  return (
    <div
      className="app-container"
    >
      <AppHeader
        t={t}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        showTagManager={effectiveShowTagManager}
        setShowTagManager={setShowTagManager}
        tagManagerEnabled={tagManagerEnabled}
        showEmojiPanel={effectiveShowEmojiPanel}
        setShowEmojiPanel={setShowEmojiPanel}
        emojiPanelEnabled={emojiPanelEnabled}
        isWindowPinned={isWindowPinned}
        setIsWindowPinned={setIsWindowPinned}
        clearHistory={clearHistory}
        showSearchBox={showSearchBox}
        search={search}
        setSearch={setSearch}
        setIsComposing={setIsComposing}
        searchInputRef={searchInputRef}
        showTagFilter={showTagFilter}
        setShowTagFilter={setShowTagFilter}
        allTags={allTags}
        searchIsFocused={searchIsFocused}
        setSearchIsFocused={setSearchIsFocused}
        setEditingTagsId={setEditingTagsId}
        theme={theme}
        colorMode={colorMode}
        settingsTitle={showSettings && settingsSubpage === "advanced" ? t("advanced_settings") : t("settings")}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        groupFilter={groupFilter}
        setGroupFilter={setGroupFilter}
        smartGroups={smartGroups}
        onBack={handleHeaderBack}
      />

      <main
        className={`main-content${effectiveShowTagManager ? " tag-manager-mode" : ""}`}
        style={{
          overflowY: (showSettings || effectiveShowTagManager) ? 'auto' : 'hidden',
          padding: effectiveShowTagManager ? '0' : undefined
        }}
        onWheel={handleMainWheel}
      >
        <AppMainContent
          t={t}
          theme={theme}
          showSettings={showSettings}
          showTagManager={effectiveShowTagManager}
          tagManagerEnabled={tagManagerEnabled}
          showEmojiPanel={effectiveShowEmojiPanel}
          settingsPanelProps={settingsPanelProps}
          emojiFavorites={emojiFavorites}
          setEmojiFavorites={setEmojiFavorites}
          emojiPanelTab={emojiPanelTab}
          setEmojiPanelTab={setEmojiPanelTab}
          saveSetting={saveSetting}
          filteredHistory={filteredHistory}
          search={search}
          pinnedItems={pinnedItems}
          unpinnedItems={unpinnedItems}
          compactMode={compactMode}
          selectedIndex={selectedIndex}
          isKeyboardMode={isKeyboardMode}
          virtualListRef={virtualListRef}
          handlePinnedReorder={handlePinnedReorder}
          renderItemContent={renderItemContent}
          loadMoreHistory={loadMoreHistory}
          handleListScroll={handleListScroll}
          hasMore={effectiveHasMore}
          isLoadingMore={isLoadingMore}
          showScrollTop={showScrollTopVisible}
          onScrollTop={handleScrollTop}
        />
      </main>

      <ToastContainer toasts={toasts} />

      <ConfirmDialog
        open={confirmDialog.show}
        title={confirmDialog.title}
        message={confirmDialog.message}
        theme={theme}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        onClose={closeConfirm}
        onConfirm={confirmDialog.onConfirm}
      />
    </div >
  );
}

export default App;
