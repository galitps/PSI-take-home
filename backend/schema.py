import json
from dataclasses import dataclass, asdict, field
from datetime import datetime
from pydantic import BaseModel
import uuid
import time
# from typing import Optional, Dict, Any

@dataclass
class PSIAgentEvent:
    # 1. Required fields without defaults come FIRST
    id: str
    tokens: Dict[str, int]
    payload: Dict[str, Any]

    # 2. Fields with defaults come SECOND
    run_id: Optional[str] = None
    parent_run_id: Optional[str] = None
    event_type: str = "DEFAULT"  # 'llm_message', 'tool_call', 'sub_agent_spawn', 'error'
    timestamp: float = field(default_factory=time.time)
    duration_ms: float = 0.0
    cost: float = 0.0

    def to_jsonl(self) -> str:
        return json.dumps(asdict(self))

class PSIAgent:
    def __init__(self, name: str, parent_run_id: Optional[str] = None):
        self.name = name
        self.run_id = f"run_{uuid.uuid4().hex[:8]}"
        self.parent_run_id = parent_run_id
        self.events = []

    def emit_event(self, event_type: str, payload: Dict[str, Any], tokens: Dict[str, int] = None, cost: float = 0.0, duration_ms: float = 0.0) -> PSIAgentEvent:
        """Constructs and stores a structured run event."""
        event = PSIAgentEvent(
            id=f"evt_{uuid.uuid4().hex[:8]}",
            run_id=self.run_id,
            parent_run_id=self.parent_run_id,
            event_type=event_type,
            timestamp=time.time(),
            duration_ms=duration_ms,
            tokens=tokens or {"input": 0, "output": 0},
            cost=cost,
            payload=payload
        )
        self.events.append(event)
        return event

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Simulates executing a tool and logs the tool call event."""
        start = time.time()
        # Mock execution logic
        output = {"status": "success", "result": f"Executed {tool_name}"}
        duration = (time.time() - start) * 1000

        self.emit_event(
            event_type="tool_call",
            payload={"tool_name": tool_name, "input": tool_input, "output": output},
            tokens={"input": 120, "output": 45},
            cost=0.002,
            duration_ms=duration
        )
        return output

    def spawn_sub_agent(self, sub_agent_name: str) -> 'PSIAgent':
        """Spawns a child agent, establishing the parent-child hierarchy link."""
        sub_agent = PSIAgent(name=sub_agent_name, parent_run_id=self.run_id)
        
        # Log the spawn event on the parent thread
        self.emit_event(
            event_type="sub_agent_spawn",
            payload={
                "child_agent_name": sub_agent_name,
                "child_run_id": sub_agent.run_id
            }
        )
        return sub_agent
