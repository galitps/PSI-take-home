# Agent Run Inspector — PSI Technical Exercise

A full-stack, real-time agent run inspector for reviewing, filtering, and debugging complex multi-agent execution traces.

## 🛠️ Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Backend Setup & Run Generation
cd src/backend/

# Install backend dependencies
pip install fastapi uvicorn pydantic

# Generate 2,500+ synthetic run events (JSONL)
python generate_run.py

# Start the API server on port 8000
python server.py

### 2. Agent Run Inspector — Frontend (`frontend/`)

The React + TypeScript client dashboard for inspecting, searching, and visualizing complex multi-agent trace logs and file diffs in real time.

---

## 🚀 Quick Start

### Install Dependencies

Ensure you are in the `frontend` directory:

cd frontend
npm install

### Run

npm run dev

