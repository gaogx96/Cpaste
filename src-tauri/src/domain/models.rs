use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClipboardEntry {
    pub id: i64,
    pub content_type: String, // 'text', 'image', 'code', 'file', 'video'
    pub content: String,
    #[serde(default)]
    pub html_content: Option<String>,
    pub source_app: String,
    #[serde(default)]
    pub source_app_path: Option<String>,
    pub timestamp: i64,
    pub preview: String,
    pub is_pinned: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub use_count: i32,
    #[serde(default)]
    pub is_external: bool, // New field to track if content is a file path
    #[serde(default)]
    pub pinned_order: i64, // For manual sorting of pinned items
    #[serde(default = "default_true")]
    pub file_preview_exists: bool, // Transient field: does the file exist on disk?

    // Smart group fields
    #[serde(default)]
    pub smart_group_id: Option<i64>,
    #[serde(default)]
    pub smart_group_name: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub group_confidence: f64,
    #[serde(default)]
    pub group_reason: String,
    #[serde(default)]
    pub group_match_type: String,
    #[serde(default)]
    pub group_manual_override: bool,
}

fn default_true() -> bool {
    true
}

impl Default for ClipboardEntry {
    fn default() -> Self {
        Self {
            id: 0,
            content_type: String::new(),
            content: String::new(),
            html_content: None,
            source_app: String::new(),
            source_app_path: None,
            timestamp: 0,
            preview: String::new(),
            is_pinned: false,
            tags: Vec::new(),
            use_count: 0,
            is_external: false,
            pinned_order: 0,
            file_preview_exists: true,
            smart_group_id: None,
            smart_group_name: String::new(),
            note: String::new(),
            group_confidence: 0.0,
            group_reason: String::new(),
            group_match_type: String::new(),
            group_manual_override: false,
        }
    }
}

// ─── Smart Group Models ───

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmartGroup {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub color: String,
    pub icon: String,
    pub enabled: bool,
    pub auto_match_enabled: bool,
    pub is_sensitive: bool,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmartGroupRule {
    pub id: i64,
    pub group_id: i64,
    pub rule_type: String, // keyword | regex | prefix | suffix | contains
    pub pattern: String,
    pub weight: f64,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmartGroupExample {
    pub id: i64,
    pub group_id: i64,
    pub example_text: String,
    pub note: String,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmartGroupMatchResult {
    pub smart_group_id: Option<i64>,
    pub smart_group_name: String,
    pub confidence: f64,
    pub reason: String,
    pub match_type: String,
}

impl SmartGroupMatchResult {
    pub fn none(reason: &str) -> Self {
        Self {
            smart_group_id: None,
            smart_group_name: String::new(),
            confidence: 0.0,
            reason: reason.to_string(),
            match_type: String::new(),
        }
    }
}
