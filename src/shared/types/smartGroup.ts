export interface SmartGroup {
  id: number;
  name: string;
  description: string;
  color: string;
  icon: string;
  enabled: boolean;
  auto_match_enabled: boolean;
  is_sensitive: boolean;
  sort_order: number;
  created_at: number;
  updated_at: number;
  /** Client-side only: entry count for display */
  entry_count?: number;
}

export interface SmartGroupRule {
  id: number;
  group_id: number;
  rule_type: 'keyword' | 'regex' | 'prefix' | 'suffix' | 'contains';
  pattern: string;
  weight: number;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface SmartGroupExample {
  id: number;
  group_id: number;
  example_text: string;
  note: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface SmartGroupMatchResult {
  smart_group_id: number | null;
  smart_group_name: string;
  confidence: number;
  reason: string;
  match_type: string;
}
