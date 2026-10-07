import json
import time
import random
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional, Dict, Any, List

# ---------------------------------------------------------------------------
# 1. Schema Definition
# ---------------------------------------------------------------------------
@dataclass
class PSIAgentEvent:
    event_id: int
    tokens: Dict[str, int]
    payload: Dict[str, Any]
    parent_run_id: Optional[str] = None
    run_id: str = "run_main"
    event_type: str = "DEFAULT"  # 'llm_message', 'tool_call', 'sub_agent_spawn', 'error'
    timestamp: float = field(default_factory=time.time)
    duration_ms: float = 0.0
    cost: float = 0.0

    def to_jsonl(self) -> str:
        return json.dumps(asdict(self))


# ---------------------------------------------------------------------------
# 2. Synthetic Event Generator Function
# ---------------------------------------------------------------------------
def generate_synthetic_run(
    target_event_count: int = 2500,
    output_filename: str | Path = Path(__file__).resolve().parent / "data" / "demo_run.jsonl"
) -> List[PSIAgentEvent]:
    """
    Generates 2500+ synthetic agent events simulating complex multi-agent execution,
    including 3-level sub-agent nesting, tool calls, git diffs, and error cases.
    """
    events: List[PSIAgentEvent] = []
    current_time = time.time() - 3600  # Start 1 hour in the past
    event_id_counter = 1

    # Shared pool of mock tools and models
    tools = ["git_diff_applier", "file_writer", "bash_executor", "browser_scraper", "python_repl"]
    models = ["gpt-4o", "claude-3-5-sonnet", "o1-mini"]

    def advance_time(min_ms: int = 50, max_ms: int = 800) -> float:
        nonlocal current_time
        delta_sec = random.randint(min_ms, max_ms) / 1000.0
        current_time += delta_sec
        return current_time

    # -----------------------------------------------------------------------
    # Helper to generate a batch of sub-agent events
    # -----------------------------------------------------------------------
    def generate_agent_branch(
        agent_name: str,
        run_id: str,
        parent_run_id: Optional[str],
        depth: int,
        max_depth: int,
        target_events_for_branch: int
    ):
        nonlocal event_id_counter

        # 1. Spawn Event (if not root)
        if parent_run_id is not None:
            events.append(
                PSIAgentEvent(
                    event_id=event_id_counter,
                    run_id=parent_run_id,
                    parent_run_id=None if depth <= 1 else f"run_d{depth-2}",
                    event_type="sub_agent_spawn",
                    timestamp=advance_time(10, 50),
                    duration_ms=12.5,
                    tokens={"input": 0, "output": 0},
                    cost=0.0,
                    payload={
                        "action": "spawn_child_agent",
                        "child_agent_name": agent_name,
                        "child_run_id": run_id,
                        "depth": depth
                    }
                )
            )
            event_id_counter += 1

        branch_events_created = 0

        # Loop to create events within this branch
        while branch_events_created < target_events_for_branch:
            # Decide whether to spawn a deeper child agent or execute local tasks
            if depth < max_depth and random.random() < 0.15 and (target_events_for_branch - branch_events_created) > 50:
                child_depth = depth + 1
                child_run_id = f"run_d{child_depth}_{uuid.uuid4().hex[:6]}"
                child_agent_name = f"Worker_L{child_depth}_{random.choice(['Refactor', 'Verifier', 'Search', 'Sim'])}"
                child_target = random.randint(100, 300)

                generate_agent_branch(
                    agent_name=child_agent_name,
                    run_id=child_run_id,
                    parent_run_id=run_id,
                    depth=child_depth,
                    max_depth=max_depth,
                    target_events_for_branch=child_target
                )
                branch_events_created += child_target
                continue

            # Randomly select event type to generate
            rand_val = random.random()

            # A. LLM Reasoning Message (35% probability)
            if rand_val < 0.35:
                inp_tok = random.randint(200, 1500)
                out_tok = random.randint(50, 400)
                dur = random.uniform(300, 1800)
                cost = (inp_tok * 0.000005) + (out_tok * 0.000015)

                events.append(
                    PSIAgentEvent(
                        event_id=event_id_counter,
                        run_id=run_id,
                        parent_run_id=parent_run_id,
                        event_type="llm_message",
                        timestamp=advance_time(200, 1500),
                        duration_ms=round(dur, 2),
                        tokens={"input": inp_tok, "output": out_tok},
                        cost=round(cost, 6),
                        payload={
                            "role": "assistant",
                            "model": random.choice(models),
                            "content": f"[{agent_name}] Analyzing task state at step {event_id_counter}. Constructing plan..."
                        }
                    )
                )

            # B. Tool Execution (50% probability)
            elif rand_val < 0.85:
                tool_name = random.choice(tools)
                dur = random.uniform(100, 900)
                inp_tok = random.randint(50, 300)
                out_tok = random.randint(20, 150)
                cost = (inp_tok * 0.000002) + (out_tok * 0.000008)

                if tool_name == "git_diff_applier":
                    payload = {
                        "tool_name": tool_name,
                        "file_path": f"src/modules/core_{random.randint(1, 10)}.py",
                        "diff": "@@ -12,4 +12,6 @@\n- def legacy_calc():\n+ def optimized_calc(val: float) -> float:\n+     # Applied performance patch\n+     return val * 1.085"
                    }
                else:
                    payload = {
                        "tool_name": tool_name,
                        "input": {"cmd": f"run_{tool_name} --flag={random.randint(100, 999)}"},
                        "output": {"status": "success", "exit_code": 0}
                    }

                events.append(
                    PSIAgentEvent(
                        event_id=event_id_counter,
                        run_id=run_id,
                        parent_run_id=parent_run_id,
                        event_type="tool_call",
                        timestamp=advance_time(50, 800),
                        duration_ms=round(dur, 2),
                        tokens={"input": inp_tok, "output": out_tok},
                        cost=round(cost, 6),
                        payload=payload
                    )
                )

            # C. Tool/Execution Error (15% probability)
            else:
                events.append(
                    PSIAgentEvent(
                        event_id=event_id_counter,
                        run_id=run_id,
                        parent_run_id=parent_run_id,
                        event_type="error",
                        timestamp=advance_time(100, 500),
                        duration_ms=150.0,
                        tokens={"input": 100, "output": 20},
                        cost=0.0001,
                        payload={
                            "error_type": "RuntimeExecutionError",
                            "message": f"Tool '{random.choice(tools)}' failed on branch {run_id}",
                            "stack_trace": "Traceback (most recent call last):\n  File 'agent.py', line 84, in execute\n    raise SystemError('Resource lock timeout')"
                        }
                    )
                )

            event_id_counter += 1
            branch_events_created += 1

    # -----------------------------------------------------------------------
    # Generate Full Synthetic Hierarchy
    # -----------------------------------------------------------------------
    print(f"Generating synthetic agent run aiming for ~{target_event_count} events...")
    
    # Start Root Agent
    root_run_id = "run_root_main"
    generate_agent_branch(
        agent_name="GlobalOrchestrator",
        run_id=root_run_id,
        parent_run_id=None,
        depth=1,
        max_depth=3,  # Allows Root -> Sub-Agent -> Nested Sub-Agent
        target_events_for_branch=target_event_count
    )

    # Sort events strictly chronologically
    events.sort(key=lambda x: x.timestamp)

    # Write out to JSONL
    output_path = Path(output_filename)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        for event in events:
            f.write(event.to_jsonl() + "\n")

    print(f"✅ Created {len(events)} events written to '{output_path}'.")
    return events


if __name__ == "__main__":
    generate_synthetic_run(target_event_count=2650)