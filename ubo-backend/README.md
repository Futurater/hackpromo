# 🕵️‍♂️ UBO Graph & Sanctions Engine

Welcome to the **Ultimate Beneficial Owner (UBO) Graph & Sanctions Analyzer**. This stack consists of an extremely fast, localized Python backend and a React Flow visualizer. It eats messy legal PDFs, maps hidden corporate ownership chains, calculates risk scores, instantly flags wanted criminals/entities offline, and visualizes the topology with forensic proof.

This entirely automates the traditional manual anti-money laundering (AML) and "Know Your Customer" (KYC) investigation workflows.

---

## 🏗 System Architecture & Tech Stack

This project is built as a complete end-to-end pipeline, avoiding expensive and slow multi-hop agents in favor of tight integration:

### 1. The Backend Pipeline (Python)
* **Document Ingestion (`PyPDF2`)**: Raw government/legal filings (like Companies House registrations or Panama registries) are ingested. The system strips all raw text out of documents of varying structures.
* **Forensic Extraction (Google Gemini):** The unstructured legalese is fed into `gemini-2.5-flash-lite` (or `2.0-flash`) with strict prompting constraints. Gemini extracts structured JSON identifying who owns/controls what, extracting the exact source quotes as proof.
* **Local Sanctions Engine (OFAC to SQLite):** Rather than exposing extraction requests to slow third-party verification APIs, the backend locally downloads the massive 18,000+ item US Treasury (OFAC) Blocklist into a lightning-fast SQLite database (`sanctions.db`). Every extracted target is instantly run through this database locally.
* **The Risk Scoring Engine:** The backend runs a heuristic risk check before returning the data. It calculates a 1-10 `risk_score` by detecting:
  * Highly secretive offshore jurisdictions (Panama, BVI, Seychelles, etc.).
  * Nominee/Puppet Director anomalies (individuals sitting on multiple boards).
  * Circular Ownership Loops (detected via graph edge cycles).

### 2. The Frontend Visualizer (React + Tailwind + XYFlow)
* **Dynamic Node Layout (`@xyflow/react`)**: Renders the generated JSON topology payload into an interactive circular graph.
* **The "Enterprise Finish"**: Custom nodes paint themselves dynamically based on the backend `risk_score`. Critical entities (>8.0 risk score) are painted red with glowing hazard badges. Sanctioned entities pulse with an OFAC warning badge.
* **The Slide-Out Evidence Panel**: (The Killer Feature) Clicking an edge connecting two corporate entities smoothly slides out a dark-mode evidence panel. This panel displays the exact highlighted quote extracted from the original PDF legal document, providing unquestionable forensic provenance for the connection.

---

## 🚀 The Codebase Overview

### Backend Scripts
1. **`load_ofac.py` (Local Sanctions Box):** Connects to the US Treasury, downloads the latest XML sheet of globally sanctioned individuals/companies, and parses it directly into `sanctions.db`.
2. **`create_pdfs.py` (Demo Data Generator):** Uses `fpdf2` to instantly generate three professional synthetic PDFs masking a massive loophole across Panama, the BVI, and Luxembourg to benchmark the graph.
3. **`analyze_ubo.py` (The Brain):** Tests the end-to-end Python pipeline. Runs Gemini extraction on the PDFs, queries the OFAC DB, calculates the risk scores, and outputs the final React-ready JSON structure.

### Frontend App (`/ubo-frontend`)
A Vite + React application providing the UI overlay.
* **`App.jsx`**: The main React Flow topology map and the interactive Evidence Slide-Out Drawer.
* **`CustomNode.jsx`**: Tailored graph nodes that render dynamic Tailwind colors based on risk severity and display flags.

---

## 💻 Tech Setup & Installation

### 1. Backend Setup
Ensure you are using Python 3.10+ and set up your virtual environment.
```bash
cd ubo-backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install google-genai PyPDF2 fpdf2 python-dotenv
```

Create a `.env` file in the `ubo-backend` root directory and add your Google AI Studio API key.
```env
GEMINI_API_KEY=AIzaSy...
```

### 2. Frontend Setup
Make sure you have Node >18.x installed. The frontend lives in the sibling `ubo-frontend` directory.
```bash
cd ../ubo-frontend
npm install
```

---

## 🎮 How to Run

You need two terminal windows to run the stack.

**Terminal 1 (The AI Backend):**
```bash
cd ubo-backend
python -m venv venv
# Activate venv on Windows:
.\venv\Scripts\activate
# Start the FastAPI Server:
python server.py
# Server runs on http://localhost:8000
```

**Terminal 2 (The Graph UI):**
```bash
cd ubo-frontend
npm run dev
# Open http://localhost:5173/ in your browser
```

---

## 🚨 Hackathon Selling Points
* **Works on "Dirty" Data:** We successfully processed native UK Companies House `IN01` forms, bypassing boilerplate to extract shell vehicles (like Orange River Sociedad Anonima).
* **Zero-Latency Blacklists:** By utilizing an offline SQLite OFAC dump, we don't expose extraction requests to third-party verification APIs.
* **Forensic Provenance:** The frontend doesn't just show a graph; the Evidence Panel traces the exact text in the source PDF that proves the connection, answering the crucial question: *"How does the AI know this?"*
