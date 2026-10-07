import os
import json
import asyncio
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


app = FastAPI(title="Agent Run Inspector API")

# Enable CORS for local React/Vite development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JSONL_FILE_PATH = "demo_run.jsonl"


# ---------------------------------------------------------------------------
# Data Helper Functions
# ---------------------------------------------------------------------------
def load_all_events() -> List[Dict[str, Any]]:
    """Reads and parses the JSONL file from disk."""
    if not os.path.exists(JSONL_FILE_PATH):
        raise HTTPException(
            status_code=404, 
            detail=f"File '{JSONL_FILE_PATH}' not found. Run your generator script first."
        )
    
    events = []
    with open(JSONL_FILE_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events


# ---------------------------------------------------------------------------
# Task 3 Endpoint: Dense Rollup Signals
# ---------------------------------------------------------------------------
@app.get("/api/run/summary")
def get_run_summary():
    """
    Returns aggregate operational metrics across the run:
    total tokens, wall-clock time, overall cost, and cost broken down per branch.
    """
    events = load_all_events()
    if not events:
        return {"total_events": 0, "total_tokens": 0, "total_cost": 0.0, "wall_time_ms": 0, "branch_costs": {}}

    total_input_tokens = sum(e.get("tokens", {}).get("input", 0) for e in events)
    total_output_tokens = sum(e.get("tokens", {}).get("output", 0) for e in events)
    total_cost = sum(e.get("cost", 0.0) for e in events)

    # Calculate total wall-clock time
    timestamps = [e.get("timestamp", 0) for e in events if e.get("timestamp")]
    start_time = min(timestamps) if timestamps else 0
    end_time = max(timestamps) if timestamps else 0
    wall_time_ms = round((end_time - start_time) * 1000, 2)

    # Cost rollup by sub-agent run branch
    branch_costs: Dict[str, float] = {}
    for e in events:
        run_id = e.get("run_id", "run_main")
        branch_costs[run_id] = round(branch_costs.get(run_id, 0.0) + e.get("cost", 0.0), 6)

    return {
        "total_events": len(events),
        "total_tokens": {
            "input": total_input_tokens,
            "output": total_output_tokens,
            "combined": total_input_tokens + total_output_tokens
        },
        "total_cost_usd": round(total_cost, 4),
        "wall_time_ms": wall_time_ms,
        "branch_costs": branch_costs
    }


# ---------------------------------------------------------------------------
# Task 1 & Task 2 Endpoint: Filterable Event History
# ---------------------------------------------------------------------------
@app.get("/api/run/events")
def get_events(
    event_type: Optional[str] = Query(None, description="Filter by event_type (llm_message, tool_call, error, sub_agent_spawn)"),
    tool_name: Optional[str] = Query(None, description="Filter by tool_name in payload"),
    errors_only: bool = Query(False, description="Filter for error events only"),
    q: Optional[str] = Query(None, description="Free-text search across messages, inputs, outputs"),
    limit: int = Query(3000, description="Limit max events returned for UI pagination/virtualization")
):
    """Retrieves run history with optional server-side filtering."""
    events = load_all_events()

    filtered = []
    for e in events:
        # Errors filter
        if errors_only and e.get("event_type") != "error":
            continue

        # Event type filter
        if event_type and e.get("event_type") != event_type:
            continue

        # Tool name filter
        if tool_name:
            payload_tool = e.get("payload", {}).get("tool_name")
            if payload_tool != tool_name:
                continue

        # Free-text search
        if q:
            search_target = json.dumps(e.get("payload", {})).lower()
            if q.lower() not in search_target:
                continue

        filtered.append(e)

    return {
        "total": len(filtered),
        "events": filtered[:limit]
    }


# ---------------------------------------------------------------------------
# Dynamic Streaming: SSE Endpoint to simulate real-time run execution
# ---------------------------------------------------------------------------
@app.get("/api/run/stream")
async def stream_run_events(speed: float = Query(0.05, description="Delay between events in seconds")):
    """Streams run events line-by-line via Server-Sent Events (SSE)."""
    events = load_all_events()

    async def event_generator():
        for event in events:
            # Format as SSE event data frame
            yield f"data: {json.dumps(event)}\n\n"
            await asyncio.sleep(speed)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)