export interface PSIAgentEvent {
  event_id: number;
  run_id: string;
  parent_run_id: string | null;
  event_type: 'llm_message' | 'tool_call' | 'sub_agent_spawn' | 'error';
  timestamp: number;
  duration_ms: number;
  tokens: { input: number; output: number };
  cost: number;
  payload: Record<string, any>;
}

export interface RunSummary {
  total_events: number;
  total_tokens: { input: number; output: number; combined: number };
  total_cost_usd: number;
  wall_time_ms: number;
  branch_costs: Record<string, number>;
}

export interface FilterParams {
  event_type?: string;
  tool_name?: string;
  errors_only?: boolean;
  q?: string;
}

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || ""}/api/run`;

export async function fetchRunSummary(): Promise<RunSummary> {
  const res = await fetch(`${API_BASE}/summary`);
  return res.json();
}

export async function fetchEvents(params?: FilterParams): Promise<{ total: number; events: PSIAgentEvent[] }> {
  const urlParams = new URLSearchParams();
  if (params?.event_type) urlParams.append("event_type", params.event_type);
  if (params?.tool_name) urlParams.append("tool_name", params.tool_name);
  if (params?.errors_only) urlParams.append("errors_only", "true");
  if (params?.q) urlParams.append("q", params.q);

  const res = await fetch(`${API_BASE}/events?${urlParams.toString()}`);
  return res.json();
}