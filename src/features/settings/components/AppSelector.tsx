import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstalledAppOption } from "../../app/types";

const AppSelector = ({ type, installedApps, onSelect, theme, t, colorMode }: { type: string | null, installedApps: InstalledAppOption[], onSelect: (val: string) => void, theme: string, t: (key: string) => string, colorMode: string }) => {
    const [recommended, setRecommended] = useState<InstalledAppOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!type) {
            setRecommended([]);
            return;
        }

        const fetchRecommended = async () => {
            setLoading(true);
            try {
                let ext = "";
                let keywords: string[] = [];

                switch (type) {
                    case "image":
                        ext = ".png";
                        keywords = ["photo", "paint", "image", "adobe", "picture", "snip", "viewer", "画图", "照片", "看图"];
                        break;
                    case "text": case "code":
                        ext = ".txt";
                        keywords = ["text", "note", "code", "edit", "write", "office", "word", "记事本", "文档"];
                        break;
                    case "rich_text":
                        ext = ".html";
                        keywords = ["word", "office", "write", "writer", "wps", "browser", "chrome", "edge", "firefox", "document", "html"];
                        break;
                    case "html": case "link": case "url":
                        ext = ".html";
                        keywords = ["browser", "chrome", "edge", "firefox", "web", "internet"];
                        break;
                    case "rtf":
                        ext = ".rtf";
                        keywords = ["word", "office", "write"];
                        break;
                    case "file":
                        ext = ".txt";
                        break;
                    default: ext = "";
                }

                let recApps: InstalledAppOption[] = [];

                // 1. Fetch from System Registry (Backend)
                if (ext) {
                    try {
                        const rec = await invoke<{ name: string; path: string }[]>("get_associated_apps", { extension: ext });
                        recApps = rec.map((app) => ({ label: app.name, value: app.path }));
                    } catch (e) {
                        // Silent fail for feature recommendations
                    }
                }

                // 2. Client-side Keyword Match (Augmentation)
                const localMatches = installedApps.filter(app => {
                    const lower = app.label.toLowerCase();
                    const isMatch = keywords.some(k => lower.includes(k));
                    const alreadyIn = recApps.some(r => r.value === app.value);
                    return isMatch && !alreadyIn;
                });

                setRecommended([...recApps, ...localMatches]);
            } catch (e) {
                // Silent fail
            } finally {
                setLoading(false);
            }
        };

        fetchRecommended();
    }, [type, installedApps]);

    const otherApps = useMemo(() => {
        let others = installedApps.filter(app => !recommended.some(r => r.value === app.value));

        if (type) {
            const n_type = type;
            others = others.filter(app => {
                const name = app.label.toLowerCase();
                if (n_type === 'image') {
                    const block = ["music", "player", "sound", "video", "audio", "code", "terminal", "powershell", "cmd"];
                    if (block.some(k => name.includes(k))) return false;
                }
                else if (n_type === 'audio' || n_type === 'video') {
                    const block = ["photo", "image", "paint", "text", "note", "code", "word", "excel"];
                    if (block.some(k => name.includes(k))) return false;
                }
                return true;
            });
        }
        return others;
    }, [installedApps, recommended, type]);

    const allOptions = [...recommended, ...otherApps];

    const filteredOptions = useMemo(() => {
        if (!search.trim()) return allOptions;
        const lower = search.toLowerCase();
        return allOptions.filter(
            (app) =>
                app.label.toLowerCase().includes(lower) ||
                app.value.toLowerCase().includes(lower)
        );
    }, [allOptions, search]);

    const isModern = theme !== 'retro';
    const isDarkMode = colorMode === 'dark' || (colorMode === 'system' && document.documentElement.classList.contains('dark-mode'));

    return (
        <div style={{ position: "relative" }}>
            <input
                type="text"
                placeholder={loading ? t('searching_apps') : t('search_apps_placeholder')}
                value={open ? search : ""}
                onFocus={() => { setOpen(true); invoke("focus_clipboard_window").catch(console.error); }}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: isModern ? "8px" : "0",
                    border: isModern ? "1px solid rgba(128,128,128,0.2)" : (isDarkMode ? "2px solid #111" : "2px solid #373737"),
                    background: isModern
                        ? (isDarkMode ? 'rgba(30,30,30,0.75)' : 'rgba(255,255,255,0.6)')
                        : (isDarkMode ? '#202020' : '#fff'),
                    color: isDarkMode ? '#eaeaea' : 'inherit',
                    fontSize: "12px",
                    outline: "none",
                    cursor: "pointer",
                    boxSizing: "border-box",
                }}
            />
            {open && (
                <>
                    <div
                        style={{
                            position: "fixed",
                            top: 0, left: 0, right: 0, bottom: 0,
                            zIndex: 99998,
                        }}
                        onClick={() => { setOpen(false); setSearch(""); }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            zIndex: 99999,
                            maxHeight: "280px",
                            overflowY: "auto",
                            background: isModern
                                ? (isDarkMode ? 'rgba(25,25,25,0.95)' : 'rgba(255,255,255,0.95)')
                                : (isDarkMode ? '#1f1f1f' : '#fff'),
                            borderRadius: isModern ? "8px" : 0,
                            border: isModern
                                ? (isDarkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(128,128,128,0.2)")
                                : (isDarkMode ? "2px solid #111" : "2px solid #373737"),
                            backdropFilter: isModern ? "blur(12px)" : "none",
                            marginTop: "4px",
                            boxShadow: isModern
                                ? (isDarkMode ? '0 8px 32px rgba(0,0,0,0.45)' : '0 8px 32px rgba(0,0,0,0.15)')
                                : (isDarkMode ? '4px 4px 0 #000' : '4px 4px 0 #1a1a1a'),
                        }}
                    >
                        {recommended.length > 0 && !search && (
                            <div
                                style={{
                                    padding: "6px 12px 2px",
                                    fontSize: "11px",
                                    fontWeight: "bold",
                                    textTransform: "uppercase",
                                    color: isDarkMode ? '#b0b0b0' : 'var(--text-secondary)',
                                    borderBottom: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(128,128,128,0.1)",
                                    marginBottom: "4px",
                                }}
                            >
                                {t('system_recommended')}
                            </div>
                        )}
                        {filteredOptions.length === 0 ? (
                            <div style={{ padding: "8px 12px", opacity: 0.6, fontSize: "12px" }}>
                                {t("no_matching_apps")}
                            </div>
                        ) : (
                            filteredOptions.map((app, idx) => (
                                <div
                                    key={app.value}
                                    style={{
                                        padding: "8px 12px",
                                        cursor: "pointer",
                                        fontSize: "12px",
                                        background: "transparent",
                                        color: isDarkMode ? '#eaeaea' : 'var(--text-primary)',
                                        borderBottom: !search && recommended.length > 0 && idx === recommended.length - 1 && idx < filteredOptions.length - 1
                                            ? (isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(128,128,128,0.1)")
                                            : "none",
                                        borderTop: !search && recommended.length > 0 && idx === recommended.length
                                            ? (isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(128,128,128,0.1)")
                                            : "none",
                                    }}
                                    onMouseDown={() => {
                                        onSelect(app.value);
                                        setOpen(false);
                                        setSearch("");
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--accent-color)';
                                        e.currentTarget.style.color = '#fff';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = isDarkMode ? '#eaeaea' : 'var(--text-primary)';
                                    }}
                                >
                                    {app.label}
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default AppSelector;
