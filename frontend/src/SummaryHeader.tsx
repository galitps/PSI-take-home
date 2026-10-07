import type { RunSummary } from '../../src/frontend/api';

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

export function SummaryHeader({ summary }: { summary: RunSummary | null }) {
  if (!summary) {
    return (
      <section className="psi-metrics" aria-label="Run summary">
        <div className="psi-loading" style={{ gridColumn: '1 / -1' }}>Loading summary signals...</div>
      </section>
    );
  }

  const branchCosts = Object.entries(summary.branch_costs).sort((a, b) => b[1] - a[1]);

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
          <span>Branch cost</span><span>{branchCosts.length} branches</span>
        </div>
        <div className="psi-branch-costs">
          {branchCosts.length ? branchCosts.map(([branch, cost]) => (
            <span className="psi-cost-chip" key={branch}>
              <code title={branch}>{branch}</code><b>{formatCost(cost)}</b>
            </span>
          )) : <span className="psi-metric-sub">No branch costs yet</span>}
        </div>
      </div>
    </section>
  );
}