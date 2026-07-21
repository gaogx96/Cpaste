use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::models::{SmartGroup, SmartGroupExample, SmartGroupRule};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub struct SmartGroupRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SmartGroupRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    // ─── Groups CRUD ───

    pub fn create_group(&self, group: &SmartGroup) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        conn.execute(
            "INSERT INTO smart_groups (name, description, color, icon, enabled, auto_match_enabled, is_sensitive, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                group.name,
                group.description,
                group.color,
                group.icon,
                group.enabled as i32,
                group.auto_match_enabled as i32,
                group.is_sensitive as i32,
                group.sort_order,
                now,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_group(&self, group: &SmartGroup) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        conn.execute(
            "UPDATE smart_groups SET name = ?1, description = ?2, color = ?3, icon = ?4,
             enabled = ?5, auto_match_enabled = ?6, is_sensitive = ?7, sort_order = ?8,
             updated_at = ?9 WHERE id = ?10",
            params![
                group.name,
                group.description,
                group.color,
                group.icon,
                group.enabled as i32,
                group.auto_match_enabled as i32,
                group.is_sensitive as i32,
                group.sort_order,
                now,
                group.id,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn reorder_groups(&self, orders: &[(i64, i64)]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        conn.execute("BEGIN TRANSACTION", [])
            .map_err(|e| e.to_string())?;
        for (group_id, sort_order) in orders {
            conn.execute(
                "UPDATE smart_groups SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
                params![sort_order, now, group_id],
            )
            .map_err(|e| {
                let _ = conn.execute("ROLLBACK", []);
                e.to_string()
            })?;
        }
        conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_group(&self, group_id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        // Move clipboard entries out of this group first
        conn.execute(
            "UPDATE clipboard_history SET smart_group_id = NULL, smart_group_name = '',
             group_confidence = 0.0, group_reason = 'group deleted', group_match_type = '',
             group_manual_override = 0
             WHERE smart_group_id = ?1",
            params![group_id],
        )
        .map_err(|e| e.to_string())?;
        // Foreign key CASCADE will delete rules, examples, and assignment logs
        conn.execute("DELETE FROM smart_groups WHERE id = ?1", params![group_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_groups(&self) -> Result<Vec<SmartGroup>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, description, color, icon, enabled, auto_match_enabled,
                        is_sensitive, sort_order, created_at, updated_at
                 FROM smart_groups ORDER BY sort_order ASC, id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(SmartGroup {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    color: row.get(3)?,
                    icon: row.get(4)?,
                    enabled: row.get::<_, i32>(5)? != 0,
                    auto_match_enabled: row.get::<_, i32>(6)? != 0,
                    is_sensitive: row.get::<_, i32>(7)? != 0,
                    sort_order: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut groups = Vec::new();
        for row in rows {
            groups.push(row.map_err(|e| e.to_string())?);
        }
        Ok(groups)
    }

    pub fn get_group_by_id(&self, group_id: i64) -> Result<Option<SmartGroup>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, description, color, icon, enabled, auto_match_enabled,
                        is_sensitive, sort_order, created_at, updated_at
                 FROM smart_groups WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map(params![group_id], |row| {
                Ok(SmartGroup {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    color: row.get(3)?,
                    icon: row.get(4)?,
                    enabled: row.get::<_, i32>(5)? != 0,
                    auto_match_enabled: row.get::<_, i32>(6)? != 0,
                    is_sensitive: row.get::<_, i32>(7)? != 0,
                    sort_order: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(group)) => Ok(Some(group)),
            _ => Ok(None),
        }
    }

    pub fn get_enabled_auto_match_groups(&self) -> Result<Vec<SmartGroup>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, description, color, icon, enabled, auto_match_enabled,
                        is_sensitive, sort_order, created_at, updated_at
                 FROM smart_groups
                 WHERE enabled = 1 AND auto_match_enabled = 1
                 ORDER BY sort_order ASC, id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(SmartGroup {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    color: row.get(3)?,
                    icon: row.get(4)?,
                    enabled: row.get::<_, i32>(5)? != 0,
                    auto_match_enabled: row.get::<_, i32>(6)? != 0,
                    is_sensitive: row.get::<_, i32>(7)? != 0,
                    sort_order: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut groups = Vec::new();
        for row in rows {
            groups.push(row.map_err(|e| e.to_string())?);
        }
        Ok(groups)
    }

    pub fn get_group_count(&self, group_id: i64) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT COUNT(*) FROM clipboard_history WHERE smart_group_id = ?1",
            params![group_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    }

    pub fn get_ungrouped_count(&self) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT COUNT(*) FROM clipboard_history WHERE smart_group_id IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    }

    // ─── Rules CRUD ───

    pub fn create_rule(&self, rule: &SmartGroupRule) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        conn.execute(
            "INSERT INTO smart_group_rules (group_id, rule_type, pattern, weight, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                rule.group_id,
                rule.rule_type,
                rule.pattern,
                rule.weight,
                rule.enabled as i32,
                now,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_rule(&self, rule: &SmartGroupRule) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        conn.execute(
            "UPDATE smart_group_rules SET group_id = ?1, rule_type = ?2, pattern = ?3,
             weight = ?4, enabled = ?5, updated_at = ?6 WHERE id = ?7",
            params![
                rule.group_id,
                rule.rule_type,
                rule.pattern,
                rule.weight,
                rule.enabled as i32,
                now,
                rule.id,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_rule(&self, rule_id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM smart_group_rules WHERE id = ?1",
            params![rule_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_rules(&self, group_id: i64) -> Result<Vec<SmartGroupRule>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, group_id, rule_type, pattern, weight, enabled, created_at, updated_at
                 FROM smart_group_rules WHERE group_id = ?1 ORDER BY id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![group_id], |row| {
                Ok(SmartGroupRule {
                    id: row.get(0)?,
                    group_id: row.get(1)?,
                    rule_type: row.get(2)?,
                    pattern: row.get(3)?,
                    weight: row.get(4)?,
                    enabled: row.get::<_, i32>(5)? != 0,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut rules = Vec::new();
        for row in rows {
            rules.push(row.map_err(|e| e.to_string())?);
        }
        Ok(rules)
    }

    pub fn list_all_rules_for_groups(&self, group_ids: &[i64]) -> Result<Vec<SmartGroupRule>, String> {
        if group_ids.is_empty() {
            return Ok(Vec::new());
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let placeholders: Vec<String> = group_ids.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT id, group_id, rule_type, pattern, weight, enabled, created_at, updated_at
             FROM smart_group_rules WHERE group_id IN ({}) AND enabled = 1 ORDER BY group_id, id",
            placeholders.join(",")
        );
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            group_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params_refs.as_slice(), |row| {
                Ok(SmartGroupRule {
                    id: row.get(0)?,
                    group_id: row.get(1)?,
                    rule_type: row.get(2)?,
                    pattern: row.get(3)?,
                    weight: row.get(4)?,
                    enabled: row.get::<_, i32>(5)? != 0,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut rules = Vec::new();
        for row in rows {
            rules.push(row.map_err(|e| e.to_string())?);
        }
        Ok(rules)
    }

    // ─── Examples CRUD ───

    pub fn create_example(&self, example: &SmartGroupExample) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        conn.execute(
            "INSERT INTO smart_group_examples (group_id, example_text, note, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                example.group_id,
                example.example_text,
                example.note,
                example.enabled as i32,
                now,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_example(&self, example: &SmartGroupExample) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        conn.execute(
            "UPDATE smart_group_examples SET group_id = ?1, example_text = ?2, note = ?3,
             enabled = ?4, updated_at = ?5 WHERE id = ?6",
            params![
                example.group_id,
                example.example_text,
                example.note,
                example.enabled as i32,
                now,
                example.id,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_example(&self, example_id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM smart_group_examples WHERE id = ?1",
            params![example_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_examples(&self, group_id: i64) -> Result<Vec<SmartGroupExample>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, group_id, example_text, note, enabled, created_at, updated_at
                 FROM smart_group_examples WHERE group_id = ?1 ORDER BY id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![group_id], |row| {
                Ok(SmartGroupExample {
                    id: row.get(0)?,
                    group_id: row.get(1)?,
                    example_text: row.get(2)?,
                    note: row.get(3)?,
                    enabled: row.get::<_, i32>(4)? != 0,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut examples = Vec::new();
        for row in rows {
            examples.push(row.map_err(|e| e.to_string())?);
        }
        Ok(examples)
    }

    pub fn list_all_examples_for_groups(&self, group_ids: &[i64]) -> Result<Vec<SmartGroupExample>, String> {
        if group_ids.is_empty() {
            return Ok(Vec::new());
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let placeholders: Vec<String> = group_ids.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT id, group_id, example_text, note, enabled, created_at, updated_at
             FROM smart_group_examples WHERE group_id IN ({}) AND enabled = 1 ORDER BY group_id, id",
            placeholders.join(",")
        );
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            group_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params_refs.as_slice(), |row| {
                Ok(SmartGroupExample {
                    id: row.get(0)?,
                    group_id: row.get(1)?,
                    example_text: row.get(2)?,
                    note: row.get(3)?,
                    enabled: row.get::<_, i32>(4)? != 0,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut examples = Vec::new();
        for row in rows {
            examples.push(row.map_err(|e| e.to_string())?);
        }
        Ok(examples)
    }

    // ─── Clipboard Entry Group Operations ───

    pub fn assign_entry_to_group(&self, entry_id: i64, group_id: i64, group_name: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // Get old group_id for audit log
        let old_group_id: Option<i64> = conn
            .query_row(
                "SELECT smart_group_id FROM clipboard_history WHERE id = ?1",
                params![entry_id],
                |row| row.get(0),
            )
            .ok()
            .flatten();

        conn.execute(
            "UPDATE clipboard_history SET smart_group_id = ?1, smart_group_name = ?2,
             group_confidence = 1.0, group_reason = 'manual override',
             group_match_type = 'manual', group_manual_override = 1
             WHERE id = ?3",
            params![group_id, group_name, entry_id],
        )
        .map_err(|e| e.to_string())?;

        // Audit log
        let now = now_ms();
        conn.execute(
            "INSERT INTO smart_group_assignment_logs (clipboard_id, old_group_id, new_group_id, action, reason, created_at)
             VALUES (?1, ?2, ?3, 'manual_move', '', ?4)",
            params![entry_id, old_group_id, group_id, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn remove_entry_from_group(&self, entry_id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let old_group_id: Option<i64> = conn
            .query_row(
                "SELECT smart_group_id FROM clipboard_history WHERE id = ?1",
                params![entry_id],
                |row| row.get(0),
            )
            .ok()
            .flatten();

        conn.execute(
            "UPDATE clipboard_history SET smart_group_id = NULL, smart_group_name = '',
             group_confidence = 0.0, group_reason = 'manual removed from group',
             group_match_type = 'manual_remove', group_manual_override = 1
             WHERE id = ?1",
            params![entry_id],
        )
        .map_err(|e| e.to_string())?;

        // Audit log
        let now = now_ms();
        conn.execute(
            "INSERT INTO smart_group_assignment_logs (clipboard_id, old_group_id, new_group_id, action, reason, created_at)
             VALUES (?1, ?2, NULL, 'manual_remove', '', ?3)",
            params![entry_id, old_group_id, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn update_entry_note(&self, entry_id: i64, note: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE clipboard_history SET note = ?1 WHERE id = ?2",
            params![note, entry_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_entries_by_group(
        &self,
        group_id: Option<i64>,
        limit: i32,
        offset: i32,
    ) -> Result<Vec<crate::domain::models::ClipboardEntry>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let repo = crate::infrastructure::repository::clipboard_repo::SqliteClipboardRepository::new(
            self.conn.clone(),
        );
        repo.get_entries_by_group_with_conn(&conn, group_id, limit, offset)
    }

    pub fn add_entry_as_group_example(&self, entry_id: i64, group_id: i64) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let content: String = conn
            .query_row(
                "SELECT content FROM clipboard_history WHERE id = ?1",
                params![entry_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        let now = now_ms();
        conn.execute(
            "INSERT INTO smart_group_examples (group_id, example_text, note, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, 1, ?4, ?5)",
            params![
                group_id,
                content,
                format!("from clipboard entry #{}", entry_id),
                now,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_unclassified_entries(&self) -> Result<Vec<crate::domain::models::ClipboardEntry>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let repo = crate::infrastructure::repository::clipboard_repo::SqliteClipboardRepository::new(
            self.conn.clone(),
        );
        repo.get_unclassified_entries_with_conn(&conn)
    }

    /// Clear smart_group_id for all entries that are NOT manually assigned,
    /// so they will be re-evaluated by the next reclassification.
    pub fn reset_auto_classifications(&self) -> Result<usize, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let count = conn.execute(
            "UPDATE clipboard_history SET
                smart_group_id = NULL,
                smart_group_name = '',
                group_confidence = 0.0,
                group_reason = '',
                group_match_type = ''
             WHERE (group_manual_override IS NULL OR group_manual_override = 0)
               AND smart_group_id IS NOT NULL",
            [],
        )
        .map_err(|e| e.to_string())?;
        Ok(count)
    }

    pub fn set_entry_classification(
        &self,
        entry_id: i64,
        group_id: Option<i64>,
        group_name: &str,
        confidence: f64,
        reason: &str,
        match_type: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE clipboard_history SET smart_group_id = ?1, smart_group_name = ?2,
             group_confidence = ?3, group_reason = ?4, group_match_type = ?5
             WHERE id = ?6 AND (group_manual_override IS NULL OR group_manual_override = 0)",
            params![group_id, group_name, confidence, reason, match_type, entry_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}
