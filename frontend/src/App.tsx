import { useEffect, useMemo, useState } from 'react'
import { fetchEvents, fetchRunSummary } from '../../src/frontend/api'
import type { FilterParams, PSIAgentEvent, RunSummary } from '../../src/frontend/api'
import { FilterBar } from './FilterBar'
import { SummaryHeader } from './SummaryHeader'
import { DiffViewer } from './DiffViewer'

type RunNode = {
  runId: string
  parentRunId: string | null
  label: string
  events: PSIAgentEvent[]
  children: RunNode[]
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatCost(value: number) {
  return `$${value.toFixed(4)}`
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.floor((milliseconds % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

function eventTitle(event: PSIAgentEvent) {
  const payload = event.payload ?? {}
  if (event.event_type === 'tool_call') return payload.tool_name || 'Tool call'
  if (event.event_type === 'llm_message') {
    return `${payload.model || 'LLM'}${payload.role ? ` · ${payload.role}` : ''}`
  }
  if (event.event_type === 'sub_agent_spawn') {
    return payload.child_agent_name || 'Sub-agent spawned'
  }
  return payload.message || payload.error || 'Run error'
}

function eventDescription(event: PSIAgentEvent) {
  const payload = event.payload ?? {}
  if (event.event_type === 'llm_message') return payload.content ?? ''
  if (event.event_type === 'tool_call') {
    return payload.file_path || payload.input?.cmd || payload.output?.result || ''
  }
  if (event.event_type === 'sub_agent_spawn') {
    return payload.child_run_id ? `Run ${payload.child_run_id}` : ''
  }
  return payload.message || payload.error || payload.details || ''
}

function EventDetails({ event }: { event: PSIAgentEvent }) {
  const payload = event.payload ?? {}
  const description = eventDescription(event)
  const diff = event.event_type === 'tool_call' && typeof payload.diff === 'string'
    ? payload.diff
    : null
  const hasDetails = Boolean(description || diff || Object.keys(payload).length)

  return (
    <details className={`psi-event psi-event-${event.event_type}`}>
      <summary className="psi-event-summary">
        <span className="psi-event-mark" aria-hidden="true" />
        <span className="psi-event-main">
          <span className="psi-event-title">{eventTitle(event)}</span>
          {description && <span className="psi-event-description">{description}</span>}
        </span>
        <span className="psi-event-meta">
          <span>{formatDuration(event.duration_ms || 0)}</span>
          <span>{formatNumber((event.tokens?.input || 0) + (event.tokens?.output || 0))} tok</span>
          <span>{formatCost(event.cost || 0)}</span>
        </span>
        {hasDetails && <span className="psi-chevron" aria-hidden="true">⌄</span>}
      </summary>
      <div className="psi-event-expanded">
        {diff && (
          <DiffViewer
            diffText={diff}
            filePath={typeof payload.file_path === 'string' ? payload.file_path : undefined}
          />
        )}
        {description && !diff && <p className="psi-detail-copy">{description}</p>}
        {payload.input && (
          <div className="psi-payload-block">
            <div className="psi-payload-label">Input</div>
            <pre>{JSON.stringify(payload.input, null, 2)}</pre>
          </div>
        )}
        {payload.output && (
          <div className="psi-payload-block">
            <div className="psi-payload-label">Output</div>
            <pre>{JSON.stringify(payload.output, null, 2)}</pre>
          </div>
        )}
        <div className="psi-event-foot">
          <span>event {event.event_id}</span>
          <span>{new Date(event.timestamp * 1000).toLocaleTimeString()}</span>
          <span>{formatNumber(event.tokens?.input || 0)} in / {formatNumber(event.tokens?.output || 0)} out</span>
        </div>
      </div>
    </details>
  )
}

function buildRunTree(events: PSIAgentEvent[], visibleEventIds: Set<number>): RunNode[] {
  const byRun = new Map<string, PSIAgentEvent[]>()
  const parents = new Map<string, string>()
  const childLabels = new Map<string, string>()

  for (const event of events) {
    const runId = event.run_id || 'run_main'
    const runEvents = byRun.get(runId) || []
    runEvents.push(event)
    byRun.set(runId, runEvents)
    if (event.parent_run_id && event.parent_run_id !== runId) parents.set(runId, event.parent_run_id)
    const childId = event.payload?.child_run_id
    if (typeof childId === 'string' && childId !== runId) {
      parents.set(childId, runId)
      if (event.payload?.child_agent_name) childLabels.set(childId, event.payload.child_agent_name)
    }
  }

  for (const runEvents of byRun.values()) runEvents.sort((a, b) => a.timestamp - b.timestamp)

  const childrenByParent = new Map<string, string[]>()
  for (const [childId, parentId] of parents) {
    if (!byRun.has(childId) || childId === parentId) continue
    const children = childrenByParent.get(parentId) || []
    if (!children.includes(childId)) children.push(childId)
    childrenByParent.set(parentId, children)
  }

  const buildNode = (runId: string, ancestry: Set<string>): RunNode => {
    const nextAncestry = new Set(ancestry).add(runId)
    const runEvents = byRun.get(runId) || []
    const firstMessage = runEvents.find((event) => event.payload?.content)
    const messageLabel = firstMessage?.payload?.content?.match(/^\[([^\]]+)\]/)?.[1]
    const children = (childrenByParent.get(runId) || [])
      .filter((childId) => !nextAncestry.has(childId))
      .map((childId) => buildNode(childId, nextAncestry))
      .filter((child) => child.events.length > 0 || child.children.length > 0)
    return {
      runId,
      parentRunId: parents.get(runId) || null,
      label: childLabels.get(runId) || messageLabel || (runId === 'run_root_main' ? 'Main agent' : runId),
      events: runEvents.filter((event) => visibleEventIds.has(event.event_id)),
      children,
    }
  }

  const rootIds = [...byRun.keys()].filter((runId) => !parents.has(runId) || !byRun.has(parents.get(runId)!))
  return rootIds
    .map((runId) => buildNode(runId, new Set()))
    .filter((node) => node.events.length > 0 || node.children.length > 0)
}

function RunTimeline({ node, depth = 0 }: { node: RunNode; depth?: number }) {
  return (
    <section className="psi-run-branch" style={{ '--depth': depth } as React.CSSProperties}>
      {depth > 0 ? (
        <details className="psi-branch-details" open={depth === 1}>
          <summary className="psi-branch-summary">
            <span className="psi-branch-glyph" aria-hidden="true">↳</span>
            <span className="psi-branch-name">{node.label}</span>
            <code>{node.runId}</code>
            <span className="psi-branch-count">{node.events.length} events</span>
            <span className="psi-branch-cost">{formatCost(node.events.reduce((sum, event) => sum + (event.cost || 0), 0))}</span>
          </summary>
          <div className="psi-branch-content">
            {node.events.map((event) => <EventDetails event={event} key={event.event_id} />)}
            {node.children.map((child) => <RunTimeline depth={depth + 1} key={child.runId} node={child} />)}
          </div>
        </details>
      ) : (
        <>
          {node.events.map((event) => <EventDetails event={event} key={event.event_id} />)}
          {node.children.map((child) => <RunTimeline depth={depth + 1} key={child.runId} node={child} />)}
        </>
      )}
    </section>
  )
}

function App() {
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [events, setEvents] = useState<PSIAgentEvent[]>([])
  const [filters, setFilters] = useState<FilterParams>({
    event_type: 'all',
    tool_name: 'all',
    errors_only: false,
    q: '',
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  async function loadRun(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true)
      setError('')
    }
    try {
      const [nextSummary, response] = await Promise.all([fetchRunSummary(), fetchEvents()])
      setSummary(nextSummary)
      setEvents(response.events)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this run.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    let active = true
    Promise.all([fetchRunSummary(), fetchEvents()])
      .then(([nextSummary, response]) => {
        if (!active) return
        setSummary(nextSummary)
        setEvents(response.events)
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load this run.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const filteredEvents = useMemo(() => {
    const needle = (filters.q || '').trim().toLowerCase()
    return events.filter((event) => {
      if (filters.errors_only && event.event_type !== 'error') return false
      if (filters.event_type && filters.event_type !== 'all' && event.event_type !== filters.event_type) return false
      if (filters.tool_name && filters.tool_name !== 'all' && event.payload?.tool_name !== filters.tool_name) return false
      if (!needle) return true
      return `${event.event_type} ${event.run_id} ${event.parent_run_id || ''} ${JSON.stringify(event.payload || {})}`
        .toLowerCase()
        .includes(needle)
    })
  }, [events, filters])

  const timeline = useMemo(
    () => buildRunTree(events, new Set(filteredEvents.map((event) => event.event_id))),
    [events, filteredEvents],
  )
  return (
    <div className="psi-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');
        #root { width: 100%; max-width: none; border: 0; text-align: left; }
        .psi-app { --ink:#202b26; --muted:#738079; --line:#e2e8e2; --paper:#f4f6f2; --white:#fff; --green:#176d4b; --mint:#e5f2e9; --red:#bd493d; --amber:#a66b1b; min-height:100vh; background:var(--paper); color:var(--ink); font:14px/1.45 'DM Sans',sans-serif; }
        .psi-app * { box-sizing:border-box; }
        .psi-app button,.psi-app input { font:inherit; }
        .psi-topbar { height:58px; display:flex; align-items:center; justify-content:space-between; padding:0 clamp(18px,4vw,58px); background:#202b26; color:#f3f5f1; }
        .psi-brand { display:flex; align-items:center; gap:11px; font:700 14px Manrope,sans-serif; letter-spacing:0; }
        .psi-brand-mark { width:25px; height:25px; display:grid; place-items:center; border-radius:6px; color:#1d2c25; background:#b5df83; font-size:12px; font-weight:800; }
        .psi-top-right { display:flex; align-items:center; gap:20px; color:#c5d0c8; font-size:12px; }
        .psi-live { display:flex; align-items:center; gap:7px; }
        .psi-live i { width:7px; height:7px; border-radius:50%; background:#a8d873; box-shadow:0 0 0 3px #a8d87325; }
        .psi-page { width:min(1420px,100%); margin:0 auto; padding:28px clamp(16px,4vw,58px) 56px; }
        .psi-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-bottom:23px; }
        .psi-eyebrow { margin:0 0 5px; color:var(--green); font:500 10px 'DM Mono',monospace; letter-spacing:0; text-transform:uppercase; }
        .psi-heading h1 { margin:0; color:var(--ink); font:800 clamp(24px,3vw,34px)/1.12 Manrope,sans-serif; letter-spacing:0; }
        .psi-subtitle { margin:8px 0 0; color:var(--muted); font-size:12px; }
        .psi-run-id { display:inline-flex; align-items:center; margin-top:11px; padding:4px 8px; border:1px solid #d5ded6; border-radius:4px; background:#edf1ec; color:#59685e; font:11px 'DM Mono',monospace; }
        .psi-refresh { display:inline-flex; align-items:center; gap:8px; padding:9px 12px; border:1px solid #d4ddd5; border-radius:5px; background:var(--white); color:var(--ink); cursor:pointer; font-size:12px; font-weight:600; }
        .psi-refresh:hover { border-color:#8ba995; }
        .psi-refresh:disabled { cursor:wait; opacity:.65; }
        .psi-refresh span { font-size:16px; line-height:10px; }
        .psi-metrics { display:grid; grid-template-columns:repeat(3,minmax(130px,1fr)) minmax(280px,2.1fr); border-top:1px solid #d8e0d8; border-bottom:1px solid #d8e0d8; background:#eef2ed; margin-bottom:21px; }
        .psi-metric { min-height:86px; padding:14px 18px; border-right:1px solid #d8e0d8; }
        .psi-metric-label { color:#738078; font:10px 'DM Mono',monospace; text-transform:uppercase; }
        .psi-metric-value { margin-top:7px; color:var(--ink); font:700 22px/1.1 Manrope,sans-serif; letter-spacing:0; }
        .psi-metric-sub { margin-top:4px; color:#829087; font-size:10px; }
        .psi-branches { min-width:0; padding:12px 17px; }
        .psi-branches-head { display:flex; justify-content:space-between; color:#738078; font:10px 'DM Mono',monospace; text-transform:uppercase; }
        .psi-branch-costs { display:flex; gap:7px; overflow:auto; padding-top:9px; }
        .psi-cost-chip { min-width:0; display:flex; align-items:center; gap:7px; padding:5px 7px; border:1px solid #dce4dc; border-radius:4px; background:#f8faf7; white-space:nowrap; }
        .psi-cost-chip code { overflow:hidden; max-width:120px; color:#536159; text-overflow:ellipsis; font:10px 'DM Mono',monospace; }
        .psi-cost-chip b { color:var(--green); font:600 10px 'DM Mono',monospace; }
        .psi-filterbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
        .psi-search { position:relative; flex:1; min-width:160px; }
        .psi-search-mark { position:absolute; top:10px; left:12px; color:#86938a; font-size:16px; pointer-events:none; }
        .psi-search input { width:100%; height:38px; padding:0 13px 0 36px; border:1px solid #d9e1d9; border-radius:5px; outline:none; background:#fff; color:var(--ink); font-size:12px; }
        .psi-search input:focus { border-color:#73a287; box-shadow:0 0 0 3px #21704712; }
        .psi-search input::placeholder { color:#98a29b; }
        .psi-type-wrap { position:relative; }
        .psi-type-button,.psi-error-button { height:38px; display:flex; align-items:center; gap:9px; padding:0 12px; border:1px solid #d9e1d9; border-radius:5px; background:#fff; color:#4f5d54; cursor:pointer; font-size:12px; white-space:nowrap; }
        .psi-type-button:hover,.psi-error-button:hover { border-color:#a4b7a8; }
        .psi-type-button .psi-chevron { color:#829087; }
        .psi-type-menu { position:absolute; z-index:5; top:44px; right:0; width:220px; padding:6px; border:1px solid #d9e1d9; border-radius:6px; background:#fff; box-shadow:0 12px 30px #17251b18; }
        .psi-type-option { display:flex; align-items:center; gap:9px; width:100%; padding:9px; border:0; border-radius:4px; background:transparent; color:var(--ink); text-align:left; cursor:pointer; font-size:12px; text-transform:capitalize; }
        .psi-type-option:hover { background:#f2f5f1; }
        .psi-type-option input { accent-color:var(--green); }
        .psi-error-button { gap:8px; }
        .psi-error-button.active { border-color:#e6b8b1; background:#fff3f1; color:#a63c32; }
        .psi-toggle { width:26px; height:15px; position:relative; border-radius:10px; background:#c9d2ca; transition:background .15s; }
        .psi-toggle::after { content:''; position:absolute; top:2px; left:2px; width:11px; height:11px; border-radius:50%; background:#fff; transition:transform .15s; }
        .active .psi-toggle { background:#c65a4d; }
        .active .psi-toggle::after { transform:translateX(11px); }
        .psi-list-head { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #dfe5df; color:#7c8980; font:10px 'DM Mono',monospace; text-transform:uppercase; }
        .psi-list-head div { display:flex; gap:26px; }
        .psi-count { color:var(--green); }
        .psi-timeline { overflow:hidden; border:1px solid #dce3dc; border-radius:6px; background:var(--white); }
        .psi-event { border-bottom:1px solid #edf0ed; }
        .psi-event:last-child { border-bottom:0; }
        .psi-event-summary { display:flex; align-items:center; min-height:52px; gap:11px; padding:8px 12px; cursor:pointer; list-style:none; }
        .psi-event-summary::-webkit-details-marker,.psi-branch-summary::-webkit-details-marker { display:none; }
        .psi-event-summary:hover { background:#fafbf9; }
        .psi-event-mark { width:8px; height:8px; flex:none; border-radius:2px; background:#8f9b91; }
        .psi-event-llm_message .psi-event-mark { background:#4e89a3; }
        .psi-event-tool_call .psi-event-mark { background:#b78335; }
        .psi-event-sub_agent_spawn .psi-event-mark { background:#8b73a4; }
        .psi-event-error .psi-event-mark { background:#c74b3d; }
        .psi-event-main { display:flex; min-width:0; flex:1; flex-direction:column; gap:2px; }
        .psi-event-title { overflow:hidden; color:#27342d; font-size:12px; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
        .psi-event-description { overflow:hidden; max-width:620px; color:#829087; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
        .psi-event-meta { display:flex; align-items:center; gap:17px; color:#77847b; font:10px 'DM Mono',monospace; white-space:nowrap; }
        .psi-chevron { color:#98a39a; font-size:15px; transition:transform .15s; }
        details[open] > .psi-event-summary .psi-chevron,details[open] > .psi-branch-summary .psi-chevron { transform:rotate(180deg); }
        .psi-event-expanded { padding:0 15px 13px 31px; color:#536158; }
        .psi-detail-copy { margin:0 0 10px; color:#536158; font-size:12px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }
        .psi-diff-file { margin:3px 0 -4px; padding:7px 12px; border:1px solid #e5eae5; border-bottom:0; border-radius:4px 4px 0 0; background:#eef2ed; color:#536159; font:10px 'DM Mono',monospace; }
        .psi-diff,.psi-payload-block pre { max-height:360px; overflow:auto; margin:3px 0 11px; padding:10px 12px; border:1px solid #e5eae5; border-radius:4px; background:#f7f9f6; color:#58655c; font:11px/1.65 'DM Mono',monospace; white-space:pre-wrap; overflow-wrap:anywhere; }
        .psi-diff span { display:block; min-height:1em; padding:0 5px; }
        .psi-diff .added { color:#1c7049; background:#e7f4ea; }
        .psi-diff .removed { color:#b23e35; background:#fbecea; }
        .psi-diff .hunk { color:#417a96; }
        .psi-payload-block { margin-top:10px; }
        .psi-payload-label { margin-bottom:4px; color:#7b8980; font:10px 'DM Mono',monospace; text-transform:uppercase; }
        .psi-event-foot { display:flex; flex-wrap:wrap; gap:16px; color:#87938a; font:10px 'DM Mono',monospace; }
        .psi-branch-details { margin-left:calc(var(--depth) * 14px); border-top:1px solid #dfe6df; background:#f9fbf8; }
        .psi-branch-summary { display:flex; align-items:center; min-height:42px; gap:9px; padding:7px 12px; cursor:pointer; list-style:none; }
        .psi-branch-summary:hover { background:#f1f5f0; }
        .psi-branch-glyph { color:#8b73a4; font-size:16px; }
        .psi-branch-name { color:#37473d; font-size:11px; font-weight:700; }
        .psi-branch-summary code { max-width:220px; overflow:hidden; padding:2px 5px; border-radius:3px; background:#eef2ed; color:#7c897f; text-overflow:ellipsis; font:9px 'DM Mono',monospace; }
        .psi-branch-count,.psi-branch-cost { margin-left:auto; color:#869189; font:10px 'DM Mono',monospace; white-space:nowrap; }
        .psi-branch-cost { min-width:64px; color:#49705a; text-align:right; }
        .psi-branch-content { border-top:1px solid #ebefeb; }
        .psi-branch-content .psi-event { background:#fff; }
        .psi-empty,.psi-loading,.psi-error-state { padding:44px 18px; color:#7f8b82; text-align:center; font-size:12px; }
        .psi-error-state { color:#aa4036; }
        .psi-footer { display:flex; justify-content:space-between; gap:12px; margin-top:12px; color:#8b968e; font:10px 'DM Mono',monospace; }
        @media(max-width:900px) { .psi-metrics { grid-template-columns:repeat(3,minmax(100px,1fr)); } .psi-branches { grid-column:1/-1; border-top:1px solid #d8e0d8; } .psi-metric:nth-child(3) { border-right:0; } }
        @media(max-width:620px) { .psi-topbar { height:52px; padding:0 16px; } .psi-top-right { gap:10px; font-size:10px; } .psi-page { padding:23px 12px 40px; } .psi-heading { margin-bottom:17px; } .psi-heading h1 { font-size:25px; } .psi-subtitle { max-width:250px; } .psi-metrics { grid-template-columns:repeat(3,minmax(0,1fr)); } .psi-metric { min-height:75px; padding:12px 9px; } .psi-metric-value { font-size:17px; } .psi-metric-label { font-size:9px; } .psi-branches { padding:10px; } .psi-filterbar { flex-wrap:wrap; gap:7px; } .psi-search { flex-basis:100%; } .psi-type-button,.psi-error-button { flex:1; justify-content:center; padding:0 8px; } .psi-type-button { overflow:hidden; } .psi-type-label { overflow:hidden; text-overflow:ellipsis; } .psi-list-head div { gap:10px; } .psi-event-summary { gap:8px; padding:8px; } .psi-event-meta { gap:8px; font-size:9px; } .psi-event-meta span:first-child { display:none; } .psi-event-description { max-width:220px; } .psi-event-expanded { padding-left:24px; } .psi-branch-details { margin-left:calc(var(--depth) * 8px); } .psi-branch-summary { gap:6px; padding:7px; } .psi-branch-summary code { max-width:84px; } .psi-branch-count { display:none; } }
        @media(prefers-reduced-motion:reduce) { .psi-app * { scroll-behavior:auto !important; transition:none !important; } }
      `}</style>

      <header className="psi-topbar">
        <div className="psi-brand"><span className="psi-brand-mark">P</span><span>PSI <span style={{ color: '#a8d873' }}>·</span> RUN INSPECTOR</span></div>
        <div className="psi-top-right"><span className="psi-live"><i /> Recorded run</span><span>{summary?.total_events ?? events.length} events</span></div>
      </header>

      <main className="psi-page">
        <div className="psi-heading">
          <div>
            <p className="psi-eyebrow">Agent observability / run review</p>
            <h1>Run inspection</h1>
            <p className="psi-subtitle">A chronological view of agent activity, tool execution, and delegated work.</p>
            <code className="psi-run-id">{events[0]?.run_id || 'Waiting for run data'}</code>
          </div>
          <button className="psi-refresh" onClick={() => void loadRun(true)} disabled={loading || refreshing} type="button">
            <span aria-hidden="true">↻</span>{refreshing ? 'Refreshing' : 'Refresh run'}
          </button>
        </div>

        <SummaryHeader summary={summary} />

        <section aria-label="Filter run events">
          <FilterBar
            filteredEventsCount={filteredEvents.length}
            onFilterChange={setFilters}
            totalEventsCount={events.length}
          />
        </section>

        <section aria-label="Event timeline">
          <div className="psi-list-head">
            <span>Event timeline</span>
            <div><span>{filters.event_type === 'all' ? 'All event types' : filters.event_type?.replaceAll('_', ' ')}</span></div>
          </div>
          <div className="psi-timeline">
            {loading ? <div className="psi-loading">Loading run events...</div>
              : error ? <div className="psi-error-state">{error}</div>
                : filteredEvents.length === 0 ? <div className="psi-empty">No events match these filters.</div>
                  : timeline.map((node) => <RunTimeline key={node.runId} node={node} />)}
          </div>
          <div className="psi-footer"><span>Sorted by event timestamp · newest events below</span><span>{events.length} loaded</span></div>
        </section>
      </main>
    </div>
  )
}

export default App
