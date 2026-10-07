# PSI take-home

## Run locally

Prerequisites: Python 3.10+ and Node.js 18+.

From the repository root, install the backend dependencies, generate the sample run, and start the API:

```sh
python -m pip install -r backend/requirements.txt
python backend/generate_run.py
python backend/server.py
```

In a second terminal, start the Vite frontend:

```sh
cd frontend
npm install
npm run dev
```

The frontend is available at the local URL printed by Vite. The API reads `backend/data/demo_run.jsonl`, independent of the current working directory.

## Repository layout

- `backend/` contains the Python API, run generators, requirements, smoke-test page, and sample data in `backend/data/`.
- `frontend/` contains the React + TypeScript Vite application, including the API client in `frontend/src/api.ts`.
- `agent_transcript.txt` contains the development transcript.

Assignment
Technical Exercise — PSI

Agent Run Inspector

Role: MTS — Product Timebox: ~3 hours Interview: 60 minutes

1. Overview

This role owns the user-facing surface of AI agent systems: polished web UIs over streaming agent runs, with tool calls, file diffs, and nested sub-agent flows.

In this exercise you will build a small but real piece of that surface: an inspector that lets a reviewer make sense of a recorded agent run.

Timebox: the build is capped at ~3 hours; what exists at that point is what you submit. Partial work with clearly marked TODOs is fine. Use AI tools freely: we expect it, and we ask for the transcript.

2. Your Demo Run

Write a small script (committed alongside your code, with the JSONL it produces) that generates a synthetic agent run as a JSONL file, one JSON event per line. You design the event schema; the tasks below tell you what it has to carry.

Serve the run from a minimal backend you write (any language; Python or Node are typical): at minimum, an endpoint that returns run history and a way for the UI to follow new events (polling, SSE, your call). Build the UI, in your choice of modern web framework with TypeScript, over a small typed client for that API. Keep the backend simple; the shape of the boundary between the API, the client, and the UI is part of what we review. This is a full-stack exercise.

The run must be rich enough to exercise the whole inspector. At minimum it must contain: LLM messages, tool calls with inputs and outputs, file diffs, sub-agent spawns (i.e. nesting, via something like a parent_run_id), token counts, cost, timing, and errors. The modeling choices here matter; make them deliberately.

3. Task 1 — Render the Timeline

Build a view that lets a reviewer scrub the run end to end. Sub-agent spawns should render as collapsible nested groups so the shape of the run is visible at a glance. You decide what goes in the timeline row, what stays one click away, and how to keep the UI responsive. Generate enough events that responsiveness is a real constraint (think on the order of a couple thousand), and be ready to explain how you chose that number.

4. Task 2 — Make It Queryable

Add the ability to filter and search across the run: by tool name, by event type, by errors only, by free-text in tool inputs or LLM messages. The reviewer should be able to find a specific event in seconds.

5. Task 3 — Surface the Signal

Show the densest signal first. At minimum: total tokens, total wall time, total cost per branch. Decide what else a reviewer needs to see without clicking. File diffs should render as diffs, not raw text.

6. Submission

Send us a zip with everything in it: your code, a README covering how to run it, and a transcript of your AI prompts.

7. What Next

Prepare for a 60-minute debrief where you present what you built and we dig into it together. Walk us through your design, your decisions, and how your submission works. Preparing presentation materials for the debrief is separate from the build: take whatever time you like on those, but the code stops at three hours.
