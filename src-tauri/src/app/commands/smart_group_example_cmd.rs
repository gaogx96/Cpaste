use tauri::{Manager, State};

use crate::database::DbState;
use crate::domain::models::SmartGroupExample;
use crate::error::{AppError, AppResult};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[tauri::command]
pub fn create_smart_group_example(
    db: State<'_, DbState>,
    group_id: i64,
    example_text: String,
    note: Option<String>,
) -> AppResult<i64> {
    let now = now_ms();
    let example = SmartGroupExample {
        id: 0,
        group_id,
        example_text,
        note: note.unwrap_or_default(),
        enabled: true,
        created_at: now,
        updated_at: now,
    };
    db.smart_group_repo
        .create_example(&example)
        .map_err(|e| AppError::Internal(e))
}

#[tauri::command]
pub fn delete_smart_group_example(
    db: State<'_, DbState>,
    id: i64,
) -> AppResult<()> {
    db.smart_group_repo
        .delete_example(id)
        .map_err(|e| AppError::Internal(e))
}

#[tauri::command]
pub fn list_smart_group_examples(
    db: State<'_, DbState>,
    group_id: i64,
) -> AppResult<Vec<SmartGroupExample>> {
    db.smart_group_repo
        .list_examples(group_id)
        .map_err(|e| AppError::Internal(e))
}

#[tauri::command]
pub fn add_clipboard_entry_as_group_example(
    db: State<'_, DbState>,
    entry_id: i64,
    group_id: i64,
) -> AppResult<i64> {
    db.smart_group_repo
        .add_entry_as_group_example(entry_id, group_id)
        .map_err(|e| AppError::Internal(e))
}
