export type ProviderType = 
  | 'GROQ' 
  | 'MISTRAL' 
  | 'GEMINI' 
  | 'COHERE' 
  | 'OPENROUTER' 
  | 'CEREBRAS'
  | 'FORGE_MCP'
  | (string & {});

export type ModelTier = 
  | 'FAST_CHAT' 
  | 'CODE_ENGINE' 
  | 'DEEP_REASONING' 
  | 'WEB_TOOLS' 
  | 'LONG_CONTEXT';

export interface TelemetryData {
  provider: ProviderType;
  model_id: string;
  ttft_ms: number;
  tokens_per_sec?: number;
}

export interface ToolCallEvent {
  tool: 'tavily_search' | 'jina_scrape' | 'ip_lookup' | 'forex' | string;
  status: 'running' | 'completed' | 'failed';
  data?: Record<string, any>;
}

export interface ChatAttachment {
  name: string;
  size?: number;
  type?: string;
  url?: string;
}

// Claude-Style Interactive Clarification & Action Cards
export interface ActionCardOption {
  id: string;
  label: string;
  action?: 'reply' | 'redirect' | 'forge_execute' | 'studio_open';
  target_module?: 'image_studio' | 'assessment_arena' | 'forge_studio' | string;
  payload?: any;
}

export interface ActionCardData {
  type: 'clarification' | 'module_redirect' | 'forge_action' | 'cooldown_alert';
  title?: string;
  message?: string;
  clarification_prompt?: string;
  options?: ActionCardOption[];
  target_module?: 'image_studio' | 'assessment_arena' | 'forge_studio' | string;
  requires_forge?: boolean;
  code?: string;
  language?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  telemetry?: TelemetryData;
  tools?: ToolCallEvent[];
  attachments?: ChatAttachment[];
  timestamp: string | number;
  cardData?: ActionCardData;
}