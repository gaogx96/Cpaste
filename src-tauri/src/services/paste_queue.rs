use crate::app_state::PasteQueue;
use crate::database::DbState;
use crate::domain::models::ClipboardEntry;
use crate::infrastructure::repository::clipboard_repo::ClipboardRepository;
use crate::services::clipboard_ops::{clear_recent_paste_marker, remember_recent_paste};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct PasteQueueItem {
    pub id: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PasteQueueResponse {
    pub items: VecDeque<PasteQueueItem>,
    pub last_action_was_paste: bool,
    pub last_pasted_fingerprint: Option<String>,
}

#[tauri::command]
pub fn get_paste_queue(
    app_handle: AppHandle,
    state: State<'_, PasteQueue>,
) -> PasteQueueResponse {
    let guard = state.0.lock().unwrap();
    PasteQueueResponse {
        items: guard
            .items
            .iter()
            .map(|id| PasteQueueItem { id: *id })
            .collect(),
        last_action_was_paste: guard.last_action_was_paste,
        last_pasted_fingerprint: guard.last_pasted_fingerprint.clone(),
    }
}

#[tauri::command]
pub fn set_paste_queue(
    app_handle: AppHandle,
    state: State<'_, PasteQueue>,
    ids: Vec<i64>,
) {
    let mut guard = state.0.lock().unwrap();
    guard.items = ids.into_iter().collect();
    guard.last_action_was_paste = false;
    guard.last_pasted_fingerprint = None;
}

#[tauri::command]
pub async fn paste_next_step(app_handle: AppHandle) {
    let queue_state = app_handle.state::<PasteQueue>();
    let next_id = {
        let mut guard = queue_state.0.lock().unwrap();
        if guard.items.is_empty() {
            return;
        }
        let id = guard.items.pop_front().unwrap();
        guard.last_action_was_paste = true;
        id
    };

    // Fetch the full entry from DB or session
    let db = app_handle.state::<DbState>();
    let (content, content_type, html_content) = if next_id > 0 {
        // From DB
        if let Ok(Some(entry)) = db.repo.get_entry_by_id(next_id) {
            (entry.content, entry.content_type, entry.html_content)
        } else {
            return;
        }
    } else {
        // From session
        let session = app_handle.state::<crate::app_state::SessionHistory>();
        let session_items = session.0.lock().unwrap();
        if let Some(item) = session_items.iter().find(|i| i.id == next_id) {
            (
                item.content.clone(),
                item.content_type.clone(),
                item.html_content.clone(),
            )
        } else {
            return;
        }
    };

    // Paste the content via clipboard manipulation
    let result = crate::services::clipboard_ops::paste_text_directly(
        app_handle.clone(),
        content.clone(),
    )
    .await;

    if result.is_ok() {
        clear_recent_paste_marker(&app_handle);
        remember_recent_paste(&app_handle, &content, &content_type, html_content.as_deref());
    }

    // If there are more items, emit event to show next paste hint
    let remaining = {
        let guard = queue_state.0.lock().unwrap();
        guard.items.len()
    };

    if remaining > 0 {
        let _ = app_handle.emit("paste-queue-progress", remaining);
    } else {
        let _ = app_handle.emit("paste-queue-complete", ());
    }
}
