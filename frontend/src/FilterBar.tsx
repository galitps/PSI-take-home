import { useEffect, useState } from 'react';
import type { FilterParams } from './api';

interface FilterBarProps {
  onFilterChange: (filters: FilterParams) => void;
  totalEventsCount: number;
  filteredEventsCount: number;
}

export function FilterBar({ onFilterChange, totalEventsCount, filteredEventsCount }: FilterBarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [eventType, setEventType] = useState('all');
  const [toolName, setToolName] = useState('all');
  const [errorsOnly, setErrorsOnly] = useState(false);

  // Debounce free-text search input to prevent firing rapid API calls on every keystroke
  useEffect(() => {
    const handler = setTimeout(() => {
      onFilterChange({
        q: searchTerm,
        event_type: eventType,
        tool_name: toolName,
        errors_only: errorsOnly
      });
    }, 250);

    return () => clearTimeout(handler);
  }, [searchTerm, eventType, toolName, errorsOnly, onFilterChange]);

  return (
    <div className="psi-filterbar">
      <label className="psi-search">
        <span className="psi-search-mark" aria-hidden="true">⌕</span>
        <input
          aria-label="Search events"
          type="text"
          placeholder="Search messages, tools, inputs, files..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </label>

      <select
        aria-label="Filter by event type"
        className="psi-type-button"
        value={eventType}
        onChange={(e) => setEventType(e.target.value)}
      >
        <option value="all">All Event Types</option>
        <option value="llm_message">LLM Messages</option>
        <option value="tool_call">Tool Calls</option>
        <option value="sub_agent_spawn">Sub-agent Spawns</option>
        <option value="error">Errors</option>
      </select>

      <select
        aria-label="Filter by tool"
        className="psi-type-button"
        value={toolName}
        onChange={(e) => setToolName(e.target.value)}
      >
        <option value="all">All Tools</option>
        <option value="git_diff_applier">git_diff_applier</option>
        <option value="file_writer">file_writer</option>
        <option value="bash_executor">bash_executor</option>
        <option value="browser_scraper">browser_scraper</option>
        <option value="python_repl">python_repl</option>
      </select>

      <button
        aria-pressed={errorsOnly}
        className={`psi-error-button${errorsOnly ? ' active' : ''}`}
        onClick={() => setErrorsOnly((active) => !active)}
        type="button"
      >
        <span className="psi-toggle" aria-hidden="true" />Errors only
      </button>

      <span className="psi-filter-match">
        <strong className="psi-count">{filteredEventsCount}</strong> / {totalEventsCount} events
      </span>
    </div>
  );
}