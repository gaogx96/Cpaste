use tauri::State;

use crate::database::{is_text_type, DbState};
use crate::domain::models::SmartGroup;
use crate::error::AppResult;
use crate::services::smart_group_classifier::{self, SmartGroupConfig};

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
    db: State<'_, DbState>,
    group_id: i64,
) -> AppResult<i64> {
    db.smart_group_repo
        .get_group_count(group_id)
        .map_err(|e| crate::error::AppError::Internal(e))
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

/// Re-run classification on existing entries and update their smart_group_id.
/// Called after rules/examples change so existing items get matched too.
#[tauri::command]
pub fn reclassify_entries(db: State<'_, DbState>) -> AppResult<i64> {
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

    // 2. Load all text-type entries that don't have smart_group_id set yet
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
                .assign_entry_to_group(entry.id, group_id, &result.smart_group_name)
                .is_ok()
            {
                updated_count += 1;
            }
        }
    }

    Ok(updated_count)
}
