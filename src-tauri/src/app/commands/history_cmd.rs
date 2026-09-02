use crate::app_state::{AppDataDir, SessionHistory};
use crate::database::DbState;
use crate::domain::models::ClipboardEntry;
use crate::error::{AppError, AppResult};
use crate::infrastructure::repository::clipboard_repo::ClipboardRepository;
use crate::infrastructure::repository::tag_repo::TagRepository;
use crate::services::clipboard::{
    build_entry_preview, derive_rich_text_content, truncate_html_for_preview,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

fn normalize_rich_text_item_content(item: &mut ClipboardEntry) {
    if item.content_type != "rich_text" {
        return;
    }

    let normalized = derive_rich_text_content(&item.content, item.html_content.as_deref());
    if !normalized.trim().is_empty() {
        item.content = normalized;
    }
}

/// Paginated history response. Pagination cursor (has_more/next_offset) is driven
/// solely by DB rows; session items only augment the first page and never participate
/// in offset/has_more, so they cannot挤占 or skip DB rows.
#[derive(Serialize)]
pub struct HistoryPage {
    pub items: Vec<ClipboardEntry>,
    pub has_more: bool,
    pub next_offset: i64,
}

#[tauri::command]
pub fn get_clipboard_history(
    state: State<'_, DbState>,
    session: State<'_, SessionHistory>,
    limit: i32,
    offset: i32,
    content_type: Option<String>,
    smart_group_id: Option<i64>,
) -> AppResult<HistoryPage> {
    // 1. Query DB with limit+1 to detect has_more
    let mut db_items = state
        .repo
        .get_history(limit + 1, offset, content_type.as_deref(), smart_group_id)?;

    // 2. has_more is determined BEFORE session merge (DB-only)
    let has_more = db_items.len() > limit as usize;

    // 3. Truncate DB rows to limit
    db_items.truncate(limit as usize);

    // 4. next_offset advances only by consumed DB rows (session does not participate)
    let next_offset = offset as i64 + db_items.len() as i64;

    // 5. Merge session items ONLY on first page (offset == 0)
    let mut items = db_items;
    if offset == 0 {
        let session_items = session.inner().0.lock().unwrap();
        for item in session_items.iter().rev() {
            if let Some(ct) = content_type.as_deref() {
                if item.content_type != ct {
                    continue;
                }
            }
            if let Some(gid) = smart_group_id {
                if item.smart_group_id != Some(gid) {
                    continue;
                }
            }
            // Avoid duplicates: session items use negative IDs that never collide with DB (positive IDs)
            if !items.iter().any(|h| h.id == item.id) {
                items.push(item.clone());
            }
        }
    }

    // 6. Apply stable sorting (must match repository ORDER BY)
    items.sort_by(|a, b| {
        b.is_pinned
            .cmp(&a.is_pinned)
            .then_with(|| b.pinned_order.cmp(&a.pinned_order))
            .then_with(|| b.timestamp.cmp(&a.timestamp))
            .then_with(|| b.id.cmp(&a.id))
    });

    // 7. Truncate content for UI performance (do NOT truncate item count after session merge)
    for item in &mut items {
        normalize_rich_text_item_content(item);

        if (item.content_type == "text"
            || item.content_type == "code"
            || item.content_type == "url"
            || item.content_type == "rich_text")
            && item.content.chars().count() > 2000
        {
            item.content = format!(
                "{}... [Truncated for speed]",
                item.content.chars().take(2000).collect::<String>()
            );
        }

        if let Some(ref html) = item.html_content {
            if html.chars().count() > 5000 {
                item.html_content = truncate_html_for_preview(html);
            }
        }

        if item.content_type == "text"
            || item.content_type == "code"
            || item.content_type == "url"
            || item.content_type == "rich_text"
        {
            item.preview = build_entry_preview(
                &item.content_type,
                &item.content,
                item.html_content.as_deref(),
            );
        }
    }

    Ok(HistoryPage {
        items,
        has_more,
        next_offset,
    })
}

#[tauri::command]
pub fn search_clipboard_history(
    state: State<'_, DbState>,
    session: State<'_, SessionHistory>,
    search_term: String,
    limit: i32,
    tag_only: Option<bool>,
) -> AppResult<Vec<ClipboardEntry>> {
    let is_tag_only = tag_only.unwrap_or(false);
    let mut history = state.repo.search(&search_term, limit, is_tag_only)?;

    let term = search_term.to_lowercase();
    let session_items = session.inner().0.lock().unwrap();
    for item in session_items.iter().rev() {
        let matches = if is_tag_only {
            item.tags.iter().any(|t| t.to_lowercase().contains(&term))
        } else {
            item.content.to_lowercase().contains(&term)
                || item.source_app.to_lowercase().contains(&term)
                || item.tags.iter().any(|t| t.to_lowercase().contains(&term))
        };

        if matches {
            if !history.iter().any(|h| h.id == item.id && item.id != 0) {
                history.push(item.clone());
            }
        }
    }

    history.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then_with(|| b.id.cmp(&a.id)));
    if history.len() > limit as usize {
        history.truncate(limit as usize);
    }

    for item in &mut history {
        normalize_rich_text_item_content(item);

        if (item.content_type == "text"
            || item.content_type == "code"
            || item.content_type == "url"
            || item.content_type == "rich_text")
            && item.content.chars().count() > 2000
        {
            item.content = format!(
                "{}... [Truncated for speed]",
                item.content.chars().take(2000).collect::<String>()
            );
        }

        if let Some(ref html) = item.html_content {
            if html.chars().count() > 5000 {
                item.html_content = truncate_html_for_preview(html);
            }
        }

        if item.content_type == "text"
            || item.content_type == "code"
            || item.content_type == "url"
            || item.content_type == "rich_text"
        {
            item.preview = build_entry_preview(
                &item.content_type,
                &item.content,
                item.html_content.as_deref(),
            );
        }
    }

    Ok(history)
}

#[tauri::command]
pub fn delete_clipboard_entry(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    session: State<'_, SessionHistory>,
    app_data: State<'_, AppDataDir>,
    id: i64,
) -> AppResult<()> {
    {
        let mut session_items = session.inner().0.lock().unwrap();
        session_items.retain(|item| item.id != id);
    }

    if id > 0 {
        let data_dir = app_data.0.lock().unwrap();
        state.repo.delete(id, Some(&data_dir))?;
    }
    let _ = app_handle.emit("clipboard-changed", ());
    Ok(())
}

#[tauri::command]
pub fn clear_clipboard_history(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    session: State<'_, SessionHistory>,
    app_data: State<'_, AppDataDir>,
) -> AppResult<()> {
    {
        let mut session_items = session.inner().0.lock().unwrap();
        session_items.retain(|item| item.is_pinned || !item.tags.is_empty());
    }
    let data_dir = app_data.0.lock().unwrap();
    state.repo.clear(Some(&data_dir)).map_err(AppError::from)?;
    let _ = app_handle.emit("clipboard-changed", ());
    Ok(())
}

#[tauri::command]
pub fn get_tag_items(state: State<'_, DbState>, tag: String) -> AppResult<Vec<ClipboardEntry>> {
    let mut history = state
        .tag_repo
        .get_entries_by_tag(&tag)
        .map_err(AppError::from)?;

    for item in &mut history {
        normalize_rich_text_item_content(item);

        if (item.content_type == "text"
            || item.content_type == "code"
            || item.content_type == "url"
            || item.content_type == "rich_text")
            && item.content.chars().count() > 50000
        {
            item.content = format!(
                "{}... [Content Truncated]",
                item.content.chars().take(50000).collect::<String>()
            );
        }

        if item.content_type == "text"
            || item.content_type == "code"
            || item.content_type == "url"
            || item.content_type == "rich_text"
        {
            item.preview = build_entry_preview(
                &item.content_type,
                &item.content,
                item.html_content.as_deref(),
            );
        }
    }

    Ok(history)
}

#[tauri::command]
pub fn get_all_tags_info(
    state: State<'_, DbState>,
) -> AppResult<std::collections::HashMap<String, i32>> {
    state.tag_repo.get_all_with_counts().map_err(AppError::from)
}

#[tauri::command]
pub fn rename_tag_globally(
    state: State<'_, DbState>,
    session: State<'_, SessionHistory>,
    old_name: String,
    new_name: String,
) -> AppResult<()> {
    {
        let mut session_items = session.inner().0.lock().unwrap();
        for item in session_items.iter_mut() {
            for tag in item.tags.iter_mut() {
                if *tag == old_name {
                    *tag = new_name.clone();
                }
            }
            item.tags.sort();
            item.tags.dedup();
        }
    }

    state
        .tag_repo
        .rename(&old_name, &new_name)
        .map_err(AppError::from)
}

#[tauri::command]
pub fn delete_tag_from_all(
    state: State<'_, DbState>,
    session: State<'_, SessionHistory>,
    app_data: State<'_, AppDataDir>,
    tag_name: String,
) -> AppResult<()> {
    {
        let mut session_items = session.inner().0.lock().unwrap();
        session_items.retain(|item| !item.tags.contains(&tag_name));
    }

    let data_dir = app_data.0.lock().unwrap();
    state
        .tag_repo
        .delete_globally(&tag_name, Some(&data_dir))
        .map_err(AppError::from)
}

#[tauri::command]
pub fn create_new_tag(state: State<'_, DbState>, tag_name: String) -> AppResult<()> {
    state.tag_repo.create(&tag_name).map_err(AppError::from)
}

#[tauri::command]
pub fn get_clipboard_content(
    state: State<'_, DbState>,
    session: State<'_, SessionHistory>,
    id: i64,
) -> AppResult<String> {
    {
        let session_items = session.inner().0.lock().unwrap();
        if let Some(item) = session_items.iter().find(|i| i.id == id) {
            if item.content_type == "rich_text" {
                let normalized =
                    derive_rich_text_content(&item.content, item.html_content.as_deref());
                if !normalized.trim().is_empty() {
                    return Ok(normalized);
                }
            }
            return Ok(item.content.clone());
        }
    }

    if let Some((content, content_type, html_content)) = state
        .repo
        .get_entry_content_with_html(id)
        .map_err(AppError::from)?
    {
        if content_type == "rich_text" {
            let normalized = derive_rich_text_content(&content, html_content.as_deref());
            if !normalized.trim().is_empty() {
                return Ok(normalized);
            }
        }
        return Ok(content);
    }

    Err(AppError::Validation("Entry not found".to_string()))
}

#[tauri::command]
pub fn update_pinned_order(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    orders: Vec<(i64, i64)>,
) -> AppResult<()> {
    state
        .repo
        .update_pinned_order(orders)
        .map_err(AppError::from)?;
    let _ = app_handle.emit("clipboard-changed", ());
    Ok(())
}

#[tauri::command]
pub fn get_db_count(state: State<'_, DbState>) -> AppResult<i64> {
    state.repo.get_count().map_err(AppError::from)
}
