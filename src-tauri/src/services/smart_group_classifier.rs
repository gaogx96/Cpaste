use regex::Regex;
use std::time::{Duration, Instant};

use crate::domain::models::{
    SmartGroup, SmartGroupExample, SmartGroupMatchResult, SmartGroupRule,
};

/// A compiled rule ready for matching — regex rules are compiled once at load time.
pub(crate) struct CompiledRule {
    rule: SmartGroupRule,
    regex: Option<Regex>,
}

/// A compiled example ready for matching — template patterns are generated once at load time.
pub(crate) struct CompiledExample {
    example: SmartGroupExample,
    /// Optional auto-generated structural template regex (e.g. `book_id:\s*\d+`)
    template: Option<Regex>,
}

pub struct CompiledGroup {
    pub group: SmartGroup,
    pub(crate) rules: Vec<CompiledRule>,
    pub(crate) examples: Vec<CompiledExample>,
}

pub struct SmartGroupConfig {
    pub groups: Vec<CompiledGroup>,
}

impl SmartGroupConfig {
    /// Build config from raw data. Compiles regexes and templates at load time.
    pub fn build(
        groups: Vec<SmartGroup>,
        rules: Vec<SmartGroupRule>,
        examples: Vec<SmartGroupExample>,
    ) -> Self {
        use std::collections::HashMap;

        // Index rules/examples by group_id
        let mut rules_by_group: HashMap<i64, Vec<SmartGroupRule>> = HashMap::new();
        for r in rules {
            rules_by_group.entry(r.group_id).or_default().push(r);
        }
        let mut examples_by_group: HashMap<i64, Vec<SmartGroupExample>> = HashMap::new();
        for e in examples {
            examples_by_group.entry(e.group_id).or_default().push(e);
        }

        let compiled = groups
            .into_iter()
            .map(|g| {
                let group_rules = rules_by_group.remove(&g.id).unwrap_or_default();
                let group_examples = examples_by_group.remove(&g.id).unwrap_or_default();

                CompiledGroup {
                    rules: group_rules
                        .into_iter()
                        .map(|rule| {
                            let regex = if rule.rule_type == "regex" {
                                Regex::new(&rule.pattern).ok()
                            } else {
                                None
                            };
                            CompiledRule { rule, regex }
                        })
                        .collect(),
                    examples: group_examples
                        .into_iter()
                        .map(|example| {
                            let template = generate_example_template(&example.example_text);
                            CompiledExample { example, template }
                        })
                        .collect(),
                    group: g,
                }
            })
            .collect();

        Self { groups: compiled }
    }

    /// True if there are no enabled auto-match groups with rules/examples.
    pub fn is_empty(&self) -> bool {
        self.groups.is_empty()
    }
}

/// Normalize text for matching: lowercase, trim, normalize whitespace.
fn normalize_text(text: &str) -> String {
    text.trim().to_lowercase()
}

/// Base scores per rule type.
fn base_score(rule_type: &str) -> f64 {
    match rule_type {
        "regex" => 80.0,
        "keyword" => 50.0,
        "prefix" => 45.0,
        "contains" => 40.0,
        "suffix" => 35.0,
        _ => 0.0,
    }
}

const GROUP_SCORE_CAP: f64 = 150.0;
const AUTO_MATCH_THRESHOLD: f64 = 60.0;
const AMBIGUOUS_GAP: f64 = 15.0;
const DEFAULT_BUDGET_MS: u64 = 30;
const MAX_CLASSIFY_CHARS: usize = 5000;
const MIN_EXAMPLE_LEN: usize = 3;

/// Generate a lightweight structural template regex from an example text.
/// E.g. `book_id: 123456` → `book_id:\s*\d+`
fn generate_example_template(text: &str) -> Option<Regex> {
    let trimmed = text.trim();
    if trimmed.len() < MIN_EXAMPLE_LEN {
        return None;
    }

    // Only generate templates for structured content
    let has_structure = trimmed.contains(|c: char| c.is_ascii_digit())
        || trimmed.contains('=')
        || trimmed.contains(':')
        || trimmed.contains('_')
        || trimmed.contains('-')
        || trimmed.contains('.');

    if !has_structure {
        return None;
    }

    // Build a simple structural pattern
    let pattern: String = trimmed
        .chars()
        .map(|c| {
            if c.is_ascii_digit() {
                "\\d+".to_string()
            } else if c.is_ascii_alphabetic() {
                "[A-Za-z]+".to_string()
            } else if c.is_whitespace() {
                "\\s*".to_string()
            } else {
                regex::escape(&c.to_string())
            }
        })
        .collect();

    // Avoid overly long or trivial patterns
    if pattern.len() > 200 || pattern.len() < 3 {
        return None;
    }

    Regex::new(&format!("(?i){}", pattern)).ok()
}

/// Check if a rule matches the normalized text.
fn rule_matches(rule: &CompiledRule, norm: &str) -> bool {
    match rule.rule.rule_type.as_str() {
        "keyword" => {
            let keyword = rule.rule.pattern.trim().to_lowercase();
            if keyword.is_empty() {
                return false;
            }
            norm.contains(&keyword)
        }
        "regex" => {
            if let Some(ref re) = rule.regex {
                re.is_match(norm)
            } else {
                false
            }
        }
        "prefix" => {
            let prefix = rule.rule.pattern.trim().to_lowercase();
            if prefix.is_empty() {
                return false;
            }
            norm.starts_with(&prefix)
        }
        "suffix" => {
            let suffix = rule.rule.pattern.trim().to_lowercase();
            if suffix.is_empty() {
                return false;
            }
            norm.ends_with(&suffix)
        }
        "contains" => {
            let sub = rule.rule.pattern.trim().to_lowercase();
            if sub.is_empty() {
                return false;
            }
            norm.contains(&sub)
        }
        _ => false,
    }
}

/// Check if an example matches the text (includes + template).
fn example_matches(compiled: &CompiledExample, norm: &str) -> (bool /* includes */, bool /* template */) {
    let example_text = compiled.example.example_text.trim().to_lowercase();
    let includes = example_text.len() >= MIN_EXAMPLE_LEN && norm.contains(&example_text);
    let template = compiled
        .template
        .as_ref()
        .map(|re| re.is_match(norm))
        .unwrap_or(false);
    (includes, template)
}

/// Run classification with a time budget.
/// Returns the best `SmartGroupMatchResult`.
pub fn classify(
    content: &str,
    content_type: &str,
    config: &SmartGroupConfig,
    budget: Option<Duration>,
) -> SmartGroupMatchResult {
    if config.is_empty() {
        return SmartGroupMatchResult::none("no groups configured");
    }

    if content_type == "image" || content_type == "files" {
        return SmartGroupMatchResult::none("non-text content");
    }

    let budget = budget.unwrap_or_else(|| Duration::from_millis(DEFAULT_BUDGET_MS));
    let started = Instant::now();

    // Clip text for classification
    let text: String = content.chars().take(MAX_CLASSIFY_CHARS).collect();
    let norm = normalize_text(&text);

    if norm.is_empty() {
        return SmartGroupMatchResult::none("empty content");
    }

    let mut results: Vec<(f64, &CompiledGroup, Vec<String>)> = Vec::new();

    for compiled_group in &config.groups {
        // Budget check per group
        if started.elapsed() > budget {
            return SmartGroupMatchResult::none("classification timeout");
        }

        let mut score = 0.0_f64;
        let mut reasons: Vec<String> = Vec::new();

        // Score rules
        for compiled_rule in &compiled_group.rules {
            if started.elapsed() > budget {
                return SmartGroupMatchResult::none("classification timeout");
            }

            if !compiled_rule.rule.enabled {
                continue;
            }

            if rule_matches(compiled_rule, &norm) {
                let s = base_score(&compiled_rule.rule.rule_type) * compiled_rule.rule.weight;
                score += s;
                reasons.push(format!(
                    "{}:{} ({})",
                    compiled_rule.rule.rule_type, compiled_rule.rule.pattern, s
                ));
            }
        }

        // Score examples
        for compiled_example in &compiled_group.examples {
            if started.elapsed() > budget {
                return SmartGroupMatchResult::none("classification timeout");
            }

            let (includes, template) = example_matches(compiled_example, &norm);
            if includes {
                score += 40.0;
                reasons.push(format!("example_contains:{}", compiled_example.example.example_text));
            }
            if template {
                score += 60.0;
                reasons.push("example_template".to_string());
            }
        }

        // Apply group score cap
        score = score.min(GROUP_SCORE_CAP);

        if score > 0.0 {
            results.push((score, compiled_group, reasons));
        }
    }

    if results.is_empty() {
        return SmartGroupMatchResult::none("no rule matched");
    }

    // Sort by score descending
    results.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());

    let (top_score, top_group, top_reasons) = &results[0];

    if *top_score < AUTO_MATCH_THRESHOLD {
        return SmartGroupMatchResult::none("score below threshold");
    }

    // Check ambiguity gap
    if results.len() > 1 {
        let second_score = results[1].0;
        if top_score - second_score < AMBIGUOUS_GAP {
            return SmartGroupMatchResult::none("ambiguous match");
        }
    }

    let confidence = (top_score / 100.0).min(1.0);

    SmartGroupMatchResult {
        smart_group_id: Some(top_group.group.id),
        smart_group_name: top_group.group.name.clone(),
        confidence,
        reason: top_reasons.join("; "),
        match_type: "auto".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_keyword_match() {
        let group = SmartGroup {
            id: 1, name: "Book IDs".into(), description: "".into(), color: "#000".into(),
            icon: "".into(), enabled: true, auto_match_enabled: true, is_sensitive: false,
            sort_order: 0, created_at: 0, updated_at: 0,
        };
        let rules = vec![SmartGroupRule {
            id: 1, group_id: 1, rule_type: "keyword".into(), pattern: "book_id".into(),
            weight: 1.0, enabled: true, created_at: 0, updated_at: 0,
        }];
        let config = SmartGroupConfig::build(vec![group], rules, vec![]);

        let result = classify("book_id: 123456", "text", &config, None);
        assert!(result.smart_group_id.is_some());
        assert_eq!(result.smart_group_name, "Book IDs");
        assert!(result.confidence > 0.0);
    }

    #[test]
    fn test_regex_match() {
        let group = SmartGroup {
            id: 2, name: "Table Names".into(), description: "".into(), color: "#000".into(),
            icon: "".into(), enabled: true, auto_match_enabled: true, is_sensitive: false,
            sort_order: 0, created_at: 0, updated_at: 0,
        };
        let rules = vec![SmartGroupRule {
            id: 2, group_id: 2, rule_type: "regex".into(), pattern: r"^dwd_".into(),
            weight: 1.0, enabled: true, created_at: 0, updated_at: 0,
        }];
        let config = SmartGroupConfig::build(vec![group], rules, vec![]);

        let result = classify("dwd_content_publish", "text", &config, None);
        assert!(result.smart_group_id.is_some());
        assert_eq!(result.smart_group_name, "Table Names");
    }

    #[test]
    fn test_no_match_below_threshold() {
        let group = SmartGroup {
            id: 3, name: "Test".into(), description: "".into(), color: "#000".into(),
            icon: "".into(), enabled: true, auto_match_enabled: true, is_sensitive: false,
            sort_order: 0, created_at: 0, updated_at: 0,
        };
        let rules = vec![SmartGroupRule {
            id: 3, group_id: 3, rule_type: "keyword".into(), pattern: "xyz_nonexistent".into(),
            weight: 1.0, enabled: true, created_at: 0, updated_at: 0,
        }];
        let config = SmartGroupConfig::build(vec![group], rules, vec![]);

        let result = classify("hello world", "text", &config, None);
        assert!(result.smart_group_id.is_none());
    }

    #[test]
    fn test_skip_image() {
        let group = SmartGroup {
            id: 4, name: "Any".into(), description: "".into(), color: "#000".into(),
            icon: "".into(), enabled: true, auto_match_enabled: true, is_sensitive: false,
            sort_order: 0, created_at: 0, updated_at: 0,
        };
        let config = SmartGroupConfig::build(vec![group], vec![], vec![]);
        let result = classify("something", "image", &config, None);
        assert!(result.smart_group_id.is_none());
        assert_eq!(result.reason, "non-text content");
    }

    #[test]
    fn test_example_template_match() {
        let group = SmartGroup {
            id: 5, name: "IDs".into(), description: "".into(), color: "#000".into(),
            icon: "".into(), enabled: true, auto_match_enabled: true, is_sensitive: false,
            sort_order: 0, created_at: 0, updated_at: 0,
        };
        let examples = vec![SmartGroupExample {
            id: 1, group_id: 5, example_text: "book_id: 123456".into(),
            note: "".into(), enabled: true, created_at: 0, updated_at: 0,
        }];
        let config = SmartGroupConfig::build(vec![group], vec![], examples);

        let result = classify("drama_id: ABC_789", "text", &config, None);
        // Should match the template (contains _ and : and digits)
        assert!(result.smart_group_id.is_some());
    }

    #[test]
    fn test_budget_timeout() {
        let group = SmartGroup {
            id: 6, name: "Slow".into(), description: "".into(), color: "#000".into(),
            icon: "".into(), enabled: true, auto_match_enabled: true, is_sensitive: false,
            sort_order: 0, created_at: 0, updated_at: 0,
        };
        let config = SmartGroupConfig::build(vec![group], vec![], vec![]);
        // Use extremely short budget
        let result = classify("test", "text", &config, Some(Duration::from_nanos(1)));
        // Should timeout and return none
        assert!(result.smart_group_id.is_none());
    }
}
