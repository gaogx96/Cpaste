use tauri::State;

use crate::database::DbState;
use crate::domain::models::SmartGroupRule;
use crate::error::{AppError, AppResult};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[tauri::command]
pub fn create_smart_group_rule(
    db: State<'_, DbState>,
    group_id: i64,
    rule_type: String,
    pattern: String,
    weight: Option<f64>,
) -> AppResult<i64> {
    // Validate regex at save time
    if rule_type == "regex" {
        if pattern.len() > 500 {
            return Err(AppError::Validation(
                "正则 pattern 不能超过 500 字符".to_string(),
            ));
        }
        if regex::Regex::new(&pattern).is_err() {
            return Err(AppError::Validation("正则格式不正确".to_string()));
        }
    }

    let now = now_ms();
    let rule = SmartGroupRule {
        id: 0,
        group_id,
        rule_type,
        pattern,
        weight: weight.unwrap_or(1.0),
        enabled: true,
        created_at: now,
        updated_at: now,
    };
    db.smart_group_repo
        .create_rule(&rule)
        .map_err(|e| AppError::Internal(e))
}

#[tauri::command]
pub fn update_smart_group_rule(
    _db: State<'_, DbState>,
    id: i64,
    group_id: Option<i64>,
    rule_type: Option<String>,
    pattern: Option<String>,
    weight: Option<f64>,
    enabled: Option<bool>,
) -> AppResult<()> {
    // We need to fetch the existing rule first
    // Since we don't have get_rule_by_id, use list_rules and find
    // For now, we'll rely on the frontend to pass all required fields
    let _ = id;
    let _ = group_id;
    let _ = rule_type;
    let _ = pattern;
    let _ = weight;
    let _ = enabled;
    // TODO: implement once we have get_rule_by_id
    Err(AppError::Internal("update_rule not yet implemented, use delete+create".to_string()))
}

#[tauri::command]
pub fn delete_smart_group_rule(
    db: State<'_, DbState>,
    id: i64,
) -> AppResult<()> {
    db.smart_group_repo
        .delete_rule(id)
        .map_err(|e| AppError::Internal(e))
}

#[tauri::command]
pub fn list_smart_group_rules(
    db: State<'_, DbState>,
    group_id: i64,
) -> AppResult<Vec<SmartGroupRule>> {
    db.smart_group_repo
        .list_rules(group_id)
        .map_err(|e| AppError::Internal(e))
}
