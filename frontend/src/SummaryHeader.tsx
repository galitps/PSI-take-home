import { useState } from 'react';
import type { PSIAgentEvent, RunSummary } from './api';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatCost(value: number) {
  return `$${value.toFixed(4)}`;
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

type BranchSummary = {
  runId: string;
  label: string;
  cost: number;
  parentRunId: string | null;
  eventCount: number;
  inputTokens: number;
  outputTokens: number;
  startTime: number;
  endTime: number;
  directChildCount: number;
  eventTypes: string[];
};

function buildBranchSummaries(events: PSIAgentEvent[], summary: RunSummary): BranchSummary[] {
  const runs = new Map<string, PSIAgentEvent[]>();
  const parents = new Map<string, string>();
  const labels = new Map<string, string>();

  for (const event of events) {
    const runId = event.run_id || 'run_main';
    const runEvents = runs.get(runId) || [];
    runEvents.push(event);
    runs.set(runId, runEvents);

    if (
      event.event_type !== 'sub_agent_spawn' &&
      event.parent_run_id &&
      event.parent_run_id !== runId
    ) {
      parents.set(runId, event.parent_run_id);
    }

    const childRunId = event.payload?.child_run_id;
    if (typeof childRunId === 'string' && childRunId !== runId) {
      parents.set(childRunId, runId);
      if (typeof event.payload.child_agent_name === 'string') {
        labels.set(childRunId, event.payload.child_agent_name);
      }
    }
  }

  return Object.entries(summary.branch_costs)
    .map(([runId, cost]) => {
      const runEvents = runs.get(runId) || [];
      const firstMessage = runEvents.find((event) => event.payload?.content);
      const messageLabel = firstMessage?.payload?.content?.match(/^\[([^\]]+)\]/)?.[1];
      const timestamps = runEvents.map((event) => event.timestamp).filter(Boolean);
      const eventTypes = [...new Set(runEvents.map((event) => event.event_type))];

      return {
        runId,
        label: labels.get(runId) || messageLabel || (parents.has(runId) ? runId : 'Main agent'),
        cost,
        parentRunId: parents.get(runId) || null,
        eventCount: runEvents.length,
        inputTokens: runEvents.reduce((total, event) => total + (event.tokens?.input || 0), 0),
        outputTokens: runEvents.reduce((total, event) => total + (event.tokens?.output || 0), 0),
        startTime: timestamps.length ? Math.min(...timestamps) : 0,
        endTime: timestamps.length ? Math.max(...timestamps) : 0,
        directChildCount: [...parents.values()].filter((parentId) => parentId === runId).length,
        eventTypes,
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

export function SummaryHeader({
  summary,
  events,
}: {
  summary: RunSummary | null;
  events: PSIAgentEvent[];
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  if (!summary) {
    return (
      <section className="psi-metrics" aria-label="Run summary">
        <div className="psi-loading" style={{ gridColumn: '1 / -1' }}>Loading summary signals...</div>
      </section>
    );
  }

  const branches = buildBranchSummaries(events, summary);
  const selectedBranch = branches.find((branch) => branch.runId === selectedRunId) || branches[0];

  return (
    <section className="psi-metrics" aria-label="Run summary">
      <div className="psi-metric">
        <div className="psi-metric-label">Total tokens</div>
        <div className="psi-metric-value">{formatNumber(summary.total_tokens.combined)}</div>
        <div className="psi-metric-sub">
          {formatNumber(summary.total_tokens.input)} input · {formatNumber(summary.total_tokens.output)} output
        </div>
      </div>

      <div className="psi-metric">
        <div className="psi-metric-label">Total cost</div>
        <div className="psi-metric-value">{formatCost(summary.total_cost_usd)}</div>
        <div className="psi-metric-sub">Across {summary.total_events} events</div>
      </div>

      <div className="psi-metric">
        <div className="psi-metric-label">Wall-clock</div>
        <div className="psi-metric-value">{formatDuration(summary.wall_time_ms)}</div>
        <div className="psi-metric-sub">End-to-end execution</div>
      </div>

      <div className="psi-branches">
        <div className="psi-branches-head">
          <span>Branch costs</span><span>{branches.length} branches · select for details</span>
        </div>
        {branches.length ? (
          <div className="psi-branch-browser">
            <div className="psi-branch-menu" role="listbox" aria-label="Run branches">
              {branches.map((branch) => (
                <button
                  aria-selected={selectedBranch?.runId === branch.runId}
                  className={`psi-branch-option${selectedBranch?.runId === branch.runId ? ' selected' : ''}`}
                  key={branch.runId}
                  onClick={() => setSelectedRunId(branch.runId)}
                  role="option"
                  type="button"
                >
                  <span className="psi-branch-option-label">{branch.label}</span>
                  <b>{formatCost(branch.cost)}</b>
                </button>
              ))}
            </div>
            {selectedBranch && (
              <div className="psi-branch-detail" aria-live="polite">
                <div className="psi-branch-detail-heading">
                  <strong>{selectedBranch.label}</strong>
                  <b>{formatCost(selectedBranch.cost)}</b>
                </div>
                <code className="psi-branch-detail-id">{selectedBranch.runId}</code>
                <div className="psi-branch-detail-stats">
                  <span>{formatNumber(selectedBranch.eventCount)} events</span>
                  <span>{formatNumber(selectedBranch.inputTokens + selectedBranch.outputTokens)} tokens</span>
                  <span>{formatDuration(selectedBranch.endTime - selectedBranch.startTime)}</span>
                  <span>{selectedBranch.directChildCount} direct child branches</span>
                </div>
                <div className="psi-branch-detail-parent">
                  Parent: {selectedBranch.parentRunId || 'none (top-level branch)'}
                </div>
                <div className="psi-branch-detail-types">
                  Event types: {selectedBranch.eventTypes.length ? selectedBranch.eventTypes.join(', ') : 'No events'}
                </div>
              </div>
            )}
          </div>
        ) : <span className="psi-metric-sub">No branch costs yet</span>}
      </div>
    </section>
  );
}