import { useState, type FC } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Plus, Trash2, ChevronDown, ChevronRight, Tag, FileText } from "lucide-react";
import { useSmartGroups, useGroupRules } from "../hooks/useSmartGroups";
import * as api from "../api/smartGroupApi";
import type { SmartGroup } from "../../../shared/types/smartGroup";

interface SmartGroupSettingsGroupProps {
  t: (key: string) => string;
  collapsed: boolean;
  onToggle: () => void;
}

const SmartGroupSettingsGroup: FC<SmartGroupSettingsGroupProps> = ({ t: _t, collapsed, onToggle }) => {
  const { groups, loading, createGroup, updateGroup, deleteGroup } = useSmartGroups();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);

  return (
    <div className={`settings-group ${collapsed ? 'collapsed' : ''}`}>
      <div className="group-header" onClick={onToggle}>
        <h3>智能分组</h3>
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </div>
      {!collapsed && (
        <div className="group-content">
          {/* Create button */}
          <div className="setting-item">
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setShowCreate(!showCreate)}
              style={{ gap: 4 }}
            >
              <Plus size={14} /> 新建分组
            </button>
          </div>

          {/* Create form */}
          {showCreate && (
            <div className="setting-item">
              <div className="item-label-group">
                <span className="item-label">分组名称</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  className="search-input"
                  placeholder="输入分组名称"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={async () => {
                      if (!newName.trim()) return;
                      await createGroup({ name: newName.trim() });
                      setNewName("");
                      setShowCreate(false);
                    }}
                  >
                    创建
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setShowCreate(false); setNewName(""); }}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Group count / empty state */}
          <div className="setting-item no-border" style={{ justifyContent: 'center', padding: '6px 0' }}>
            {loading ? (
              <span className="hint">加载中...</span>
            ) : groups.length === 0 ? (
              <span className="hint">暂无分组，点击上方按钮创建</span>
            ) : (
              <span className="hint">共 {groups.length} 个分组</span>
            )}
          </div>

          {/* Group list */}
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              expanded={expandedGroup === group.id}
              onToggleExpand={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
              onUpdate={updateGroup}
              onDelete={deleteGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Group Card ───

const GroupCard: FC<{
  group: SmartGroup;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (params: any) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}> = ({ group, expanded, onToggleExpand, onUpdate, onDelete }) => {
  const { rules, loading: rulesLoading, addRule, removeRule } = useGroupRules(expanded ? group.id : null);

  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleType, setNewRuleType] = useState("keyword");
  const [newRulePattern, setNewRulePattern] = useState("");

  // Tauri WebView2 focus workaround: re-focus window to ensure keyboard events reach the input
  const ensureFocus = () => {
    try { getCurrentWindow().setFocus(); } catch {}
  };

  return (
    <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
      {/* Card header */}
      <div
        onClick={onToggleExpand}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          padding: '6px 0', userSelect: 'none',
        }}
      >
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: group.color || '#64748b', flexShrink: 0,
        }} />
        <span className="item-label" style={{ flex: 1, margin: 0 }}>{group.name}</span>
        {group.entry_count !== undefined && (
          <span className="hint">{group.entry_count} 条</span>
        )}
        <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <label className="switch" style={{ margin: 0 }}>
            <input
              className="cb" type="checkbox" checked={group.enabled}
              onChange={async () => { await onUpdate({ id: group.id, enabled: !group.enabled }); }}
            />
            <div className="toggle"><div className="left" /><div className="right" /></div>
          </label>
          <button className="btn btn-xs btn-ghost" title="导出为 Markdown"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const path = await api.exportGroupMarkdown(group.id);
                if (path) alert(`导出成功：${path}`);
              } catch (e: any) {
                if (e !== '已取消') alert(e?.toString() || '导出失败');
              }
            }}>
            <FileText size={12} />
          </button>
          <button className="btn btn-xs btn-ghost" title="删除"
            onClick={async (e) => {
              e.stopPropagation();
              if (confirm(`确定删除分组「${group.name}」？`)) await onDelete(group.id);
            }}
            style={{ color: 'var(--danger-color, #ef4444)' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ paddingTop: 4 }}>
          {/* Rules section */}
          <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'stretch', borderBottom: 'none', gap: 6, padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag size={14} />
              <span className="item-label" style={{ margin: 0, flex: 1 }}>匹配规则</span>
              <button className="btn btn-xs btn-ghost" onClick={() => setShowAddRule(true)}>
                <Plus size={12} /> 添加规则
              </button>
            </div>

            {showAddRule && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <select
                    value={newRuleType}
                    onChange={(e) => setNewRuleType(e.target.value)}
                  >
                    <option value="keyword">关键词</option>
                    <option value="regex">正则</option>
                    <option value="prefix">前缀</option>
                    <option value="suffix">后缀</option>
                    <option value="contains">包含</option>
                  </select>
                  <input
                    type="text"
                    placeholder="输入规则内容"
                    value={newRulePattern}
                    onChange={(e) => setNewRulePattern(e.target.value)}
                    onMouseDown={ensureFocus}
                    onFocus={ensureFocus}
                    onClick={ensureFocus}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-xs btn-primary"
                    onClick={async () => {
                      if (!newRulePattern.trim()) return;
                      try {
                        await addRule({ ruleType: newRuleType, pattern: newRulePattern.trim() });
                        setNewRulePattern("");
                        setShowAddRule(false);
                      } catch (e: any) { alert(e?.toString() || "添加失败"); }
                    }}>
                    添加
                  </button>
                </div>
              </div>
            )}

            {rulesLoading && <span className="hint">加载中...</span>}
            {!rulesLoading && rules.length === 0 && !showAddRule && (
              <span className="hint">暂无规则，点击上方按钮添加</span>
            )}
            {rules.map((rule) => (
              <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <span className="hint" style={{
                  background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4,
                  fontSize: 11, minWidth: 40, textAlign: 'center',
                }}>{rule.rule_type}</span>
                <code style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rule.pattern}
                </code>
                <button className="btn btn-xs btn-ghost" onClick={() => removeRule(rule.id)}
                  style={{ color: 'var(--danger-color, #ef4444)' }}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
};

export default SmartGroupSettingsGroup;
