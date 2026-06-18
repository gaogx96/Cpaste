import { useState, type FC } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Tag, FileText } from "lucide-react";
import { useSmartGroups, useGroupRules, useGroupExamples } from "../hooks/useSmartGroups";
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
    <div className="settings-group">
      <div className="settings-group-header" onClick={onToggle}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        <span className="settings-group-title">智能分组</span>
        <span className="settings-group-badge">{groups.length}</span>
      </div>

      {!collapsed && (
        <div className="settings-group-content">
          {/* Create button */}
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setShowCreate(!showCreate)}
            style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Plus size={14} /> 新建分组
          </button>

          {/* Create form */}
          {showCreate && (
            <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 8 }}>
              <input
                className="input"
                placeholder="分组名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8 }}>
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
          )}

          {/* Group list */}
          {loading && <div style={{ padding: 12, color: 'var(--text-secondary)' }}>加载中...</div>}

          {!loading && groups.length === 0 && (
            <div style={{ padding: 12, color: 'var(--text-secondary)' }}>
              暂无分组，点击上方按钮创建
            </div>
          )}

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
  const { examples, loading: examplesLoading, addExample, removeExample } = useGroupExamples(expanded ? group.id : null);

  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleType, setNewRuleType] = useState("keyword");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [showAddExample, setShowAddExample] = useState(false);
  const [newExampleText, setNewExampleText] = useState("");

  return (
    <div className="smart-group-card" style={{
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      marginBottom: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        className="smart-group-header"
        onClick={onToggleExpand}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: group.color || '#64748b', flexShrink: 0,
        }} />
        <span style={{ flex: 1, fontWeight: 500 }}>{group.name}</span>
        {group.entry_count !== undefined && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{group.entry_count} 条</span>
        )}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="btn btn-xs btn-ghost"
            title={group.enabled ? "已启用" : "已禁用"}
            onClick={async () => {
              await onUpdate({ id: group.id, enabled: !group.enabled });
            }}
          >
            {group.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          </button>
          <button
            className="btn btn-xs btn-ghost"
            title="删除"
            onClick={async () => {
              if (confirm(`确定删除分组「${group.name}」？历史记录将移出该分组。`)) {
                await onDelete(group.id);
              }
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '0 12px 12px' }}>
          {/* Auto-match toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={group.auto_match_enabled}
              onChange={async (e) => {
                await onUpdate({ id: group.id, auto_match_enabled: e.target.checked });
              }}
            />
            参与自动识别
          </label>

          {/* Sensitive toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={group.is_sensitive}
              onChange={async (e) => {
                await onUpdate({ id: group.id, is_sensitive: e.target.checked });
              }}
            />
            敏感分组
          </label>

          {/* Rules */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Tag size={13} />
              <span style={{ fontWeight: 500, fontSize: 13 }}>规则</span>
              <button className="btn btn-xs btn-ghost" onClick={() => setShowAddRule(!showAddRule)}>
                <Plus size={12} /> 添加
              </button>
            </div>

            {showAddRule && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                <select
                  value={newRuleType}
                  onChange={(e) => setNewRuleType(e.target.value)}
                  style={{ fontSize: 12, padding: '2px 4px' }}
                >
                  <option value="keyword">关键词</option>
                  <option value="regex">正则</option>
                  <option value="prefix">前缀</option>
                  <option value="suffix">后缀</option>
                  <option value="contains">包含</option>
                </select>
                <input
                  placeholder="规则内容"
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                  style={{ flex: 1, fontSize: 12, padding: '2px 4px' }}
                />
                <button
                  className="btn btn-xs btn-primary"
                  onClick={async () => {
                    if (!newRulePattern.trim()) return;
                    try {
                      await addRule({ rule_type: newRuleType, pattern: newRulePattern.trim() });
                      setNewRulePattern("");
                      setShowAddRule(false);
                    } catch (e: any) {
                      alert(e?.toString() || "添加失败");
                    }
                  }}
                >
                  添加
                </button>
              </div>
            )}

            {rulesLoading && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>加载中...</div>}

            {!rulesLoading && rules.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 20 }}>暂无规则</div>
            )}

            {rules.map((rule) => (
              <div key={rule.id} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12, padding: '2px 0 2px 20px',
              }}>
                <span style={{
                  background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3,
                  fontSize: 11, minWidth: 40, textAlign: 'center',
                }}>
                  {rule.rule_type}
                </span>
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

          {/* Examples */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <FileText size={13} />
              <span style={{ fontWeight: 500, fontSize: 13 }}>示例</span>
              <button className="btn btn-xs btn-ghost" onClick={() => setShowAddExample(!showAddExample)}>
                <Plus size={12} /> 添加
              </button>
            </div>

            {showAddExample && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                <textarea
                  placeholder="示例文本（如 book_id: 123456）"
                  value={newExampleText}
                  onChange={(e) => setNewExampleText(e.target.value)}
                  style={{ flex: 1, fontSize: 12, padding: '2px 4px', minHeight: 32, resize: 'vertical' }}
                />
                <button
                  className="btn btn-xs btn-primary"
                  onClick={async () => {
                    if (!newExampleText.trim()) return;
                    await addExample({ example_text: newExampleText.trim() });
                    setNewExampleText("");
                    setShowAddExample(false);
                  }}
                  style={{ alignSelf: 'flex-start' }}
                >
                  添加
                </button>
              </div>
            )}

            {examplesLoading && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>加载中...</div>}

            {!examplesLoading && examples.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 20 }}>暂无示例</div>
            )}

            {examples.map((ex) => (
              <div key={ex.id} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12, padding: '2px 0 2px 20px',
              }}>
                <code style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ex.example_text}
                </code>
                <button className="btn btn-xs btn-ghost" onClick={() => removeExample(ex.id)}
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
