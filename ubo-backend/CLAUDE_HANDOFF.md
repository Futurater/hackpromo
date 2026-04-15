# UBO Forensics Engine - Project Handoff Documentation

This document serves as a comprehensive context-loader for an AI agent (like Claude) to understand the architecture, exact logic, and current state of the Ultimate Beneficial Owner (UBO) Graph Engine built for HackFest.

## 1. Project High-Level Overview
The project is a "Zero-Trust" Anti-Money Laundering (AML) / KYC forensic tool. The user drags and drops raw unstructured, multi-page legal PDFs from corporate registries. The engine extracts the complex corporate hierarchies, identifies "Circular Ownership Loops" and "Puppet Directors", cross-references every entity locally against an offline US Treasury (OFAC) sanctions database, assigns a cumulative 1-10 Risk Score, and paints an interactive node graph proving the connections. 

If you click an edge on the graph, an Evidence Panel slides out showing the EXACT text quote extracted from the PDF that proves the relationship structure.

## 2. Monorepo Directory Structure
```
hackfest/
├── ubo-backend/               # Python Engine
│   ├── analyze_ubo.py         # The core pipeline (PyMuPDF -> Gemini -> Risk Score)
│   ├── server.py              # FastAPI Web Server (POST /analyze)
│   ├── load_ofac.py           # ETL Script for US Treasury Database
│   ├── create_pdfs.py         # Fake data generator for Hackathon Demo
│   ├── sanctions.db           # 18k row SQLite DB populated by load_ofac
│   ├── requirements.txt       # fastapi, uvicorn, python-multipart, pymupdf, google-genai
│   └── README.md              
└── ubo-frontend/              # Vite + React User Interface
    ├── src/
    │   ├── App.jsx            # Main Router & XYFlow Graph UI + Evidence Panel state
    │   ├── UploadScreen.jsx   # Drag & Drop landing page UI
    │   ├── LoadingScreen.jsx  # Animated 5-step progress radar
    │   ├── CustomNode.jsx     # XYFlow node containing tailwind risk badges
    │   └── index.css          # Tailwind V4 entrypoint
    ├── package.json           # @xyflow/react, tailwindcss, lucide-react
    └── vite.config.js         # Vite standard config with Tailwind
```

## 3. The Backend Architecture (Python / FastAPI)

- **Entrypoint (`server.py`)**: A FastAPI server running on `0.0.0.0:8000`. It exposes the `POST /analyze` route which accepts a multipart form-data array of uploaded PDFs. It saves them to `tempfile`, passes the file paths to `analyze_ubo.py`, and cleans up when finished.
- **OCR & Extraction (`analyze_ubo.py:extract_text_from_pdf`)**: Uses `PyMuPDF` (`fitz`) to extract raw text from scanned or digital PDFs. It appends a `[PAGE X]` tag between pages so the LLM retains provenance context.
- **LLM Topology Mapping (`analyze_ubo.py:run_pipeline`)**: Sends the raw text to Google's `gemini-2.5-flash-lite` API using the `google-genai` SDK. It forces the LLM to return `JSON` containing: `source`, `target`, `type` (owns/directs), `percentage`, `jurisdiction`, and `source_text` (the definitive quote proving the link).
- **Offline Sanctions Check (`analyze_ubo.py:check_sanctions`)**: Uses `sqlite3` to perform a real-time substring match in `sanctions.db` against the 18,698 sanctioned entities. No external APIs used for privacy. If found, it appends a `[sanctioned: true]` flag.
- **Risk Scoring (`analyze_ubo.py:calculate_node_risk`)**: Determines a 1.0 - 10.0 risk score based on: 
  - Offshore havens (BVI, Panama, Seychelles) = +4.0
  - Circular Loop mapped = +5.0
  - Puppet/Nominee Director on multiple boards = +3.0

## 4. The Frontend Architecture (React / Vite)

- **State Router (`App.jsx`)**: Manages the `<UploadScreen>`, `<LoadingScreen>`, and `<ReactFlow>` graph states based on API response logic.
- **Drag & Drop (`UploadScreen.jsx`)**: HTML5 native drag and drop parsing that passes a `File` array up to `App.jsx` which encodes `FormData` out to the FastAPI `/analyze` endpoint.
- **Visualization (`@xyflow/react`)**: Uses custom `layoutNodes()` to dynamically arrange nodes in a circle mapping based on the returned JSON. 
- **Dynamic Coloring (`CustomNode.jsx`)**: Changes the entire styling of the UI node based on the injected `risk_level` ("critical" = red border & red 9.0 badge, "green" = low risk). Applies a pulsing animation for `sanctioned` entities.
- **The Evidence Panel (`App.jsx` slide-out view)**: Handles `onEdgeClick` events from XYFlow. Captures the `edge.data.source_text` property from the backend payload and reveals a right-aligned sliding panel proving the origin of the connection extracted by Gemini.

## 5. Active Notes for Claude
- **Backend Model**: Currently using `gemini-2.5-flash-lite` due to strict API free-tier quotas on heavier models like 2.0-flash. 
- **Dependencies**: The backend correctly switched to `PyMuPDF` over the deprecated `PyPDF2` due to better OCR. The frontend uses `Tailwind V4` via `@tailwindcss/vite` plugin.
- **Execution**: The project is designed to be demonstrated locally using two split terminals:
  - Terminal 1: `python server.py` runs Uvicorn on 8000.
  - Terminal 2: `npm run dev` inside `ubo-frontend` runs Vite on 5173.

*This concludes the context handoff.*
