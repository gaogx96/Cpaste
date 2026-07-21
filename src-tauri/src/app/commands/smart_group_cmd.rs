use tauri::State;

use crate::database::DbState;
use crate::domain::models::SmartGroup;
use crate::error::AppResult;
use crate::app_state::SessionHistory;
use crate::services::smart_group_classifier::{self, SmartGroupConfig};
use std::io::Write;
use tauri::{AppHandle, Emitter, Manager};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[tauri::command]
pub fn create_smart_group(
    db: State<'_, DbState>,
    name: String,
    description: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    enabled: Option<bool>,
    auto_match_enabled: Option<bool>,
    is_sensitive: Option<bool>,
    sort_order: Option<i64>,
) -> AppResult<i64> {
    let now = now_ms();
    let group = SmartGroup {
        id: 0,
        name,
        description: description.unwrap_or_default(),
        color: color.unwrap_or_else(|| "#64748b".to_string()),
        icon: icon.unwrap_or_default(),
        enabled: enabled.unwrap_or(true),
        auto_match_enabled: auto_match_enabled.unwrap_or(true),
        is_sensitive: is_sensitive.unwrap_or(false),
        sort_order: sort_order.unwrap_or(0),
        created_at: now,
        updated_at: now,
    };
    db.smart_group_repo
        .create_group(&group)
        .map_err(|e| crate::error::AppError::Internal(e))
}

#[tauri::command]
pub fn update_smart_group(
    db: State<'_, DbState>,
    id: i64,
    name: Option<String>,
    description: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    enabled: Option<bool>,
    auto_match_enabled: Option<bool>,
    is_sensitive: Option<bool>,
    sort_order: Option<i64>,
) -> AppResult<()> {
    let mut group = db
        .smart_group_repo
        .get_group_by_id(id)
        .map_err(|e| crate::error::AppError::Internal(e))?
        .ok_or_else(|| crate::error::AppError::Validation("分组不存在".to_string()))?;

    if let Some(v) = name {
        group.name = v;
    }
    if let Some(v) = description {
        group.description = v;
    }
    if let Some(v) = color {
        group.color = v;
    }
    if let Some(v) = icon {
        group.icon = v;
    }
    if let Some(v) = enabled {
        group.enabled = v;
    }
    if let Some(v) = auto_match_enabled {
        group.auto_match_enabled = v;
    }
    if let Some(v) = is_sensitive {
        group.is_sensitive = v;
    }
    if let Some(v) = sort_order {
        group.sort_order = v;
    }
    group.updated_at = now_ms();

    db.smart_group_repo
        .update_group(&group)
        .map_err(|e| crate::error::AppError::Internal(e))
}

/// Batch reorder smart groups by updating sort_order.
/// `orders` is a list of (group_id, sort_order) pairs.
#[tauri::command]
pub fn reorder_smart_groups(
    db: State<'_, DbState>,
    orders: Vec<(i64, i64)>,
) -> AppResult<()> {
    db.smart_group_repo
        .reorder_groups(&orders)
        .map_err(|e| crate::error::AppError::Internal(e))
}

#[tauri::command]
pub fn delete_smart_group(db: State<'_, DbState>, id: i64) -> AppResult<()> {
    db.smart_group_repo
        .delete_group(id)
        .map_err(|e| crate::error::AppError::Internal(e))
}

#[tauri::command]
pub fn list_smart_groups(db: State<'_, DbState>) -> AppResult<Vec<SmartGroup>> {
    db.smart_group_repo
        .list_groups()
        .map_err(|e| crate::error::AppError::Internal(e))
}

#[tauri::command]
pub fn get_smart_group_detail(db: State<'_, DbState>, id: i64) -> AppResult<Option<SmartGroup>> {
    db.smart_group_repo
        .get_group_by_id(id)
        .map_err(|e| crate::error::AppError::Internal(e))
}

#[tauri::command]
pub fn get_smart_group_count(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    group_id: i64,
) -> AppResult<i64> {
    // 1. Reclassify (updates both DB and session entries)
    let _reclassified = reclassify_unclassified_with_session(&app, &db, group_id);
    // 2. Count session entries that match (this is what the frontend filter sees)
    let session = app.state::<SessionHistory>();
    let total_count = {
        let guard = session.0.lock().unwrap();
        guard.iter().filter(|e| e.smart_group_id == Some(group_id)).count() as i64
    };
    Ok(total_count)
}

// ─── Clipboard Entry Group Operations ───

#[tauri::command]
pub fn assign_clipboard_entry_to_group(
    db: State<'_, DbState>,
    entry_id: i64,
    group_id: i64,
) -> AppResult<()> {
    let group = db
        .smart_group_repo
        .get_group_by_id(group_id)
        .map_err(|e| crate::error::AppError::Internal(e))?
        .ok_or_else(|| crate::error::AppError::Validation("分组不存在".to_string()))?;

    db.smart_group_repo
        .assign_entry_to_group(entry_id, group_id, &group.name)
        .map_err(|e| crate::error::AppError::Internal(e))
}

#[tauri::command]
pub fn remove_clipboard_entry_from_group(
    db: State<'_, DbState>,
    entry_id: i64,
) -> AppResult<()> {
    db.smart_group_repo
        .remove_entry_from_group(entry_id)
        .map_err(|e| crate::error::AppError::Internal(e))
}

#[tauri::command]
pub fn update_clipboard_entry_note(
    db: State<'_, DbState>,
    entry_id: i64,
    note: String,
) -> AppResult<()> {
    db.smart_group_repo
        .update_entry_note(entry_id, &note)
        .map_err(|e| crate::error::AppError::Internal(e))
}

#[tauri::command]
pub fn get_clipboard_history_by_group(
    db: State<'_, DbState>,
    group_id: Option<i64>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> AppResult<Vec<crate::domain::models::ClipboardEntry>> {
    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);
    db.smart_group_repo
        .get_entries_by_group(group_id, limit, offset)
        .map_err(|e| crate::error::AppError::Internal(e))
}

/// Export all entries in a smart group as a Markdown file.
#[tauri::command]
pub fn export_group_markdown(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    group_id: i64,
) -> Result<String, String> {
    let mut entries = db.smart_group_repo
        .get_entries_by_group(Some(group_id), 10000, 0)
        .map_err(|e| e.to_string())?;

    // Also include session entries that match this group
    let session = app.state::<SessionHistory>();
    {
        let guard = session.0.lock().unwrap();
        for entry in guard.iter() {
            if entry.smart_group_id == Some(group_id) {
                entries.push(entry.clone());
            }
        }
    }
    // Deduplicate by ID
    entries.sort_by_key(|e| std::cmp::Reverse(e.timestamp));
    let mut seen = std::collections::HashSet::new();
    entries.retain(|e| seen.insert(e.id));

    let group_name = db.smart_group_repo
        .get_group_by_id(group_id)
        .map_err(|e| e.to_string())?
        .map(|g| g.name)
        .unwrap_or_else(|| format!("group-{}", group_id));

    if entries.is_empty() {
        return Err("该分组下没有数据".to_string());
    }

    let mut md = String::new();
    md.push_str(&format!("# {}\n\n", group_name));
    md.push_str(&format!("> {} 条内容\n\n---\n\n", entries.len()));

    for (i, entry) in entries.iter().enumerate() {
        if entry.content_type == "image" {
            md.push_str(&format!("> 图片: {}...\n\n", entry.content.chars().take(80).collect::<String>()));
        } else {
            let text = entry.content.chars().take(2000).collect::<String>();
            md.push_str(&format!("{}\n\n", text));
            if entry.content.len() > 2000 {
                md.push_str("> *内容已截断*\n\n");
            }
        }
        if i < entries.len() - 1 {
            md.push_str("---\n\n");
        }
    }

    let default_name = format!("{}_{}.md",
        group_name.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_"),
        chrono::Local::now().format("%Y%m%d")
    );

    Ok(serde_json::json!({
        "content": md,
        "filename": default_name
    }).to_string())
}

/// Re-run classification on existing entries and update their smart_group_id.
/// Called after rules/examples change so existing items get matched too.
#[tauri::command]
pub fn reclassify_entries(
    app_handle: AppHandle,
    db: State<'_, DbState>,
) -> AppResult<i64> {
    // 1. Load groups, rules, examples
    let groups = db.smart_group_repo
        .get_enabled_auto_match_groups()
        .map_err(|e| crate::error::AppError::Internal(e))?;

    if groups.is_empty() {
        return Ok(0);
    }

    let group_ids: Vec<i64> = groups.iter().map(|g| g.id).collect();

    let rules = db.smart_group_repo
        .list_all_rules_for_groups(&group_ids)
        .map_err(|e| crate::error::AppError::Internal(e))?;

    let examples = db.smart_group_repo
        .list_all_examples_for_groups(&group_ids)
        .map_err(|e| crate::error::AppError::Internal(e))?;

    let config = SmartGroupConfig::build(groups, rules, examples);

    // 2. Reset auto-classifications so all entries (except manually assigned)
    //    are re-evaluated with the new rules.
    let _ = db.smart_group_repo.reset_auto_classifications();

    // 3. Load all text-type entries that don't have smart_group_id set yet
    let entries = db.smart_group_repo
        .get_unclassified_entries()
        .map_err(|e| crate::error::AppError::Internal(e))?;

    if entries.is_empty() {
        return Ok(0);
    }

    let mut updated_count = 0i64;

    for entry in &entries {
        let result = smart_group_classifier::classify(
            &entry.content,
            &entry.content_type,
            &config,
            None,
        );

        if let Some(group_id) = result.smart_group_id {
            if db.smart_group_repo
                .set_entry_classification(
                    entry.id,
                    Some(group_id),
                    &result.smart_group_name,
                    result.confidence,
                    &result.reason,
                    &result.match_type,
                )
                .is_ok()
            {
                updated_count += 1;
            }
        }
    }

    // Notify frontend to refresh history so entries show updated smart_group_id
    let _ = app_handle.emit("clipboard-changed", ());

    Ok(updated_count)
}

/// Simple reclassification: match DB entries + session entries against a group.
/// Session entries are in-memory and not in the database, so we must process them separately.
pub fn reclassify_unclassified_with_session(
    app: &tauri::AppHandle,
    db: &State<'_, DbState>,
    target_group_id: i64,
) -> i64 {
    let mut group = match db.smart_group_repo.get_group_by_id(target_group_id) {
        Ok(Some(g)) => {
            if !g.enabled { return 0; }
            g
        }
        Ok(None) => return 0,
        Err(_) => return 0,
    };

    if !group.auto_match_enabled {
        group.auto_match_enabled = true;
        let _ = db.smart_group_repo.update_group(&group);
    }

    let rules = match db.smart_group_repo.list_all_rules_for_groups(&[target_group_id]) {
        Ok(r) => r,
        Err(_) => return 0,
    };
    let examples = match db.smart_group_repo.list_all_examples_for_groups(&[target_group_id]) {
        Ok(e) => e,
        Err(_) => return 0,
    };

    let config = crate::services::smart_group_classifier::SmartGroupConfig::build(
        vec![group], rules, examples,
    );

    // 1. Process DB entries (persistent mode)
    let mut count = 0i64;
    if let Ok(entries) = db.smart_group_repo.get_unclassified_entries() {
        for entry in &entries {
            let result = crate::services::smart_group_classifier::classify(
                &entry.content, &entry.content_type, &config, None,
            );
            if result.smart_group_id == Some(target_group_id) {
                let _ = db.smart_group_repo.set_entry_classification(
                    entry.id, Some(target_group_id), &result.smart_group_name,
                    result.confidence, &result.reason, &result.match_type);
                count += 1;
            }
        }
    }

    // 2. Process session entries (non-persistent mode)
    let session = app.state::<SessionHistory>();
    let mut session_entries: Vec<_> = {
        let guard = session.0.lock().unwrap();
        guard.iter().cloned().collect()
    };

    let session_matched = session_entries.iter_mut().filter_map(|entry| {
        let result = crate::services::smart_group_classifier::classify(
            &entry.content, &entry.content_type, &config, None,
        );
        if result.smart_group_id == Some(target_group_id) {
            entry.smart_group_id = Some(target_group_id);
            entry.smart_group_name = result.smart_group_name.clone();
            Some(entry.id)
        } else {
            None
        }
    }).count();

    // Update session entries in-place with classified group info and emit events
    {
        let mut guard = session.0.lock().unwrap();
        for entry in guard.iter_mut() {
            if let Some(s_entry) = session_entries.iter().find(|s| s.id == entry.id) {
                if s_entry.smart_group_id.is_some() {
                    entry.smart_group_id = s_entry.smart_group_id;
                    entry.smart_group_name.clone_from(&s_entry.smart_group_name);
                    let _ = app.emit("clipboard-updated", s_entry.clone());
                }
            }
        }
    }

    count + session_matched as i64
}

/// Simple helper: write content to a file (used for export).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let mut file = std::fs::File::create(&path).map_err(|e| format!("创建文件失败: {}", e))?;
    file.write_all(content.as_bytes()).map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(())
}
