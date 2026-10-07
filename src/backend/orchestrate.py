from schema import PSIAgent, PSIAgentEvent

def run_agent_workflow():
    all_events = []

    # 1. Initialize the Global Orchestrator Agent
    orchestrator = PSIAgent(name="GlobalOrchestrator")
    
    # Orchestrator performs an initial LLM reasoning step
    orchestrator.emit_event(
        event_type="llm_message",
        payload={"role": "assistant", "content": "Analyzing request and delegating sub-task..."},
        tokens={"input": 500, "output": 50},
        cost=0.005
    )

    # 2. Spawn a Child Sub-Agent to perform a specific task
    code_worker = orchestrator.spawn_sub_agent(sub_agent_name="CodeRefactorWorker")
    
    # 3. Child Agent executes tools in its own sub-run
    code_worker.execute_tool(
        tool_name="git_diff_applier", 
        tool_input={"file": "main.py", "patch": "@@ -1,3 +1,3 @@"}
    )

    # Collect events across the hierarchy
    all_events.extend(orchestrator.events)
    all_events.extend(code_worker.events)

    # 4. Export all run events to a JSONL file
    with open("demo_run.jsonl", "w") as f:
        for event in all_events:
            f.write(event.to_jsonl() + "\n")

if __name__ == "__main__":
    run_agent_workflow()