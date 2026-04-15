import os
import json
import sqlite3
import logging
import operator
from typing import TypedDict, List, Dict, Set, Literal, Optional, Annotated

from pydantic import BaseModel, Field
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()

# Configure Heavy Logging for Traceability
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("graph_agent")

# --- 1. Global State Management ---
def merge_sets(left: Set[str], right: Set[str] | None) -> Set[str]:
    if right is None:
        return left
    return left.union(right)

class InvestigationState(TypedDict):
    target_crn: str
    investigation_depth: int
    visited_entities: Annotated[Set[str], merge_sets]
    discovered_nodes: Annotated[List[Dict], operator.add]
    discovered_edges: Annotated[List[Dict], operator.add]
    sanctions_hits: Annotated[List[Dict], operator.add]
    current_risk_score: int
    fatal_flags: Annotated[List[str], operator.add]
    current_document_text: str
    is_resolved: bool
    # Internal trackers
    last_extracted_type: str
    last_extracted_name: str
    last_extracted_jurisdiction: str

# --- 2. Pydantic Strict Output for Gemini ---
class OwnershipExtraction(BaseModel):
    entity_name: str = Field(description="Name of the owner entity or person.")
    entity_type: Literal["Corporate", "Human"] = Field(description="Whether the entity is a Corporate or Human.")
    ownership_percentage: float = Field(description="Percentage of ownership. Use 0.0 if not specified.")
    jurisdiction: str = Field(description="Jurisdiction or country of the entity.")
    evidence_quote: str = Field(description="CRITICAL: The exact verbatim sentence from the text proving this ownership.")

# --- 3. The Graph Nodes (Tools) ---
async def ingest_document_node(state: InvestigationState):
    depth = state.get("investigation_depth", 0)
    logger.info(f"[NODE] ingest_document_node | Current Depth: {depth}")
    
    # In a real scenario, this would use a tool to grab the next PDF based on the CRN or name.
    # We simulate a nested structure: Shell A -> Shell B -> Human UBO
    if depth == 0:
        text = "This document states that 100% of DEEPSENSE LTD is owned by ORANGE RIVER SOCIEDAD ANONIMA, a Corporate entity based in British Virgin Islands."
    elif depth == 1:
        text = "ORANGE RIVER SOCIEDAD ANONIMA is 100% owned by STAFFAN ALEXANDER QVIST, a Human."
    else:
        text = "No further documents found."
        
    return {
        "current_document_text": text,
        "investigation_depth": depth + 1
    }

async def llm_extraction_node(state: InvestigationState):
    logger.info("[NODE] llm_extraction_node | Triggering Gemini 2.5 Flash")
    
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
    structured_llm = llm.with_structured_output(OwnershipExtraction)
    
    prompt = f"Analyze this text and extract ownership information:\n\n{state['current_document_text']}"
    
    try:
        extraction: OwnershipExtraction = await structured_llm.ainvoke(prompt)
        logger.info(f"       => Extracted: {extraction.entity_name} ({extraction.entity_type})")
        
        # Format for React Flow
        new_node = {
            "id": extraction.entity_name,
            "type": "custom",
            "data": {
                "label": extraction.entity_name,
                "jurisdiction": extraction.jurisdiction,
                "type": extraction.entity_type
            }
        }
        
        # Link to the previous entity, or the root CRN if it's the first
        target = state.get("last_extracted_name") or state.get("target_crn")
        new_edge = {
            "id": f"edge_{extraction.entity_name}_{target}",
            "source": extraction.entity_name,
            "target": target,
            "type": "owns",
            "data": {
                "evidence_quote": extraction.evidence_quote,
                "percentage": extraction.ownership_percentage
            }
        }
        
        return {
            "discovered_nodes": [new_node],
            "discovered_edges": [new_edge],
            "last_extracted_type": extraction.entity_type,
            "last_extracted_name": extraction.entity_name,
            "last_extracted_jurisdiction": extraction.jurisdiction,
            "visited_entities": {extraction.entity_name}
        }
    except Exception as e:
        logger.error(f"       => Extraction Failed: {e}")
        return {"fatal_flags": [f"LLM Parsing Error: {e}"]}

async def risk_evaluator_node(state: InvestigationState):
    logger.info("[NODE] risk_evaluator_node | Computing Risk Vectors")
    added_risk = 0
    new_flags = []
    
    # Jurisdiction Check
    jurisdiction = state.get("last_extracted_jurisdiction", "").lower()
    if "british virgin islands" in jurisdiction or "bvi" in jurisdiction or "panama" in jurisdiction:
        added_risk += 15
        new_flags.append(f"High-Risk Jurisdiction Detected: {jurisdiction.upper()}")
        logger.info(f"       => FLAG: High-Risk Jurisdiction (+15)")
        
    # Cycle Detection Check
    name = state.get("last_extracted_name", "")
    visited = state.get("visited_entities", set())
    if name in visited and len(visited) > 1:
        added_risk += 100
        new_flags.append("AUTO-REJECT: Orphan Loop / Circular Ownership Detected.")
        logger.warning(f"       => FATAL FLAG: Circular Loop Detected (+100)")
        
    return {
        "current_risk_score": state.get("current_risk_score", 0) + added_risk,
        "fatal_flags": new_flags
    }

async def ofac_sanctions_node(state: InvestigationState):
    logger.info("[NODE] ofac_sanctions_node | Querying OFAC Database")
    name = state.get("last_extracted_name", "")
    
    is_sanctioned = False
    try:
        conn = sqlite3.connect('sanctions.db')
        c = conn.cursor()
        # Ensure the blocked_entities table exists based on previous work
        c.execute("SELECT * FROM blocked_entities WHERE last_name LIKE ? OR first_name LIKE ?", (f"%{name}%", f"%{name}%"))
        results = c.fetchall()
        if results:
            is_sanctioned = True
        conn.close()
    except Exception as e:
        logger.error(f"       => DB Error: {e}")
        
    if is_sanctioned:
        logger.warning(f"       => ALERT: {name} found on Sanctions List!")
        return {
            "sanctions_hits": [{"name": name, "reason": "OFAC Match"}],
            "fatal_flags": [f"AUTO-REJECT: Sanctioned Entity Detected: {name}"]
        }
    else:
        logger.info(f"       => SAFE: {name} not found in OFAC.")
    
    return {}

async def compile_ui_payload_node(state: InvestigationState):
    logger.info("[NODE] compile_ui_payload_node | Formatting Payload for React Flow")
    return {"is_resolved": True}

# --- 4. Conditional Edge Routing ---
def route_investigation(state: InvestigationState) -> str:
    logger.info("[ROUTER] Evaluating Next Step...")
    
    # Rule 1: Break Infinite Loops or Fatal Risk
    if state.get("investigation_depth", 0) >= 5 or state.get("current_risk_score", 0) >= 100:
        if state.get("current_risk_score", 0) >= 100:
            logger.info("       => Routing to UI Payload (Risk Threshold Reached)")
        else:
            logger.info("       => Routing to UI Payload (Depth Limit Reached)")
        return "compile_ui_payload_node"
        
    entity_type = state.get("last_extracted_type", "")
    
    # Rule 2: Dig Deeper for Corporate Entities
    if entity_type == "Corporate":
        logger.info("       => Corporate entity found. Routing to 'ingest_document_node' to drill down.")
        return "ingest_document_node"
        
    # Rule 3: End of Line for Human UBOs
    elif entity_type == "Human":
        logger.info("       => Human UBO found. Routing to 'ofac_sanctions_node'.")
        return "ofac_sanctions_node"
        
    # Fallback
    logger.info("       => Unknown condition. Defaulting to compile payload.")
    return "compile_ui_payload_node"

# --- 5. Human-in-the-Loop (HITL) & Graph Compilation ---
memory = MemorySaver()
builder = StateGraph(InvestigationState)

builder.add_node("ingest_document_node", ingest_document_node)
builder.add_node("llm_extraction_node", llm_extraction_node)
builder.add_node("risk_evaluator_node", risk_evaluator_node)
builder.add_node("ofac_sanctions_node", ofac_sanctions_node)
builder.add_node("compile_ui_payload_node", compile_ui_payload_node)

builder.add_edge(START, "ingest_document_node")
builder.add_edge("ingest_document_node", "llm_extraction_node")
builder.add_edge("llm_extraction_node", "risk_evaluator_node")

# Routing Logic
builder.add_conditional_edges("risk_evaluator_node", route_investigation)

# Finalizing Routes
builder.add_edge("ofac_sanctions_node", "compile_ui_payload_node")
builder.add_edge("compile_ui_payload_node", END)

# Add Breakpoint before compiling the final payload
graph = builder.compile(checkpointer=memory, interrupt_before=["compile_ui_payload_node"])

# --- 6. API Server Setup ---
app = FastAPI(title="KYB LangGraph Agent API")

@app.post("/investigate")
async def trigger_investigation(crn: str):
    """Starts the recursive LangGraph agent"""
    config = {"configurable": {"thread_id": crn}}
    
    initial_state = {
        "target_crn": crn,
        "investigation_depth": 0,
        "current_risk_score": 0,
        "visited_entities": set(),
        "discovered_nodes": [{
            "id": crn, 
            "type": "custom", 
            "data": {"label": f"Root Target: {crn}"}
        }],
        "discovered_edges": [],
        "sanctions_hits": [],
        "fatal_flags": []
    }
    
    # We use await graph.ainvoke to run to the breakpoint
    result = await graph.ainvoke(initial_state, config=config)
    
    return JSONResponse(content={
        "message": f"Graph paused at {graph.get_state(config).next} for HITL review.",
        "state": {
            "current_risk_score": result.get("current_risk_score"),
            "fatal_flags": result.get("fatal_flags"),
            "nodes_discovered": len(result.get("discovered_nodes", [])),
            "thread_id": crn
        }
    })

@app.post("/approve/{thread_id}")
async def approve_and_finalize(thread_id: str):
    """Resumes the graph after HITL analyst approval"""
    config = {"configurable": {"thread_id": thread_id}}
    
    # Verify graph is actually blocked
    current_state = graph.get_state(config)
    if "compile_ui_payload_node" not in current_state.next:
        raise HTTPException(status_code=400, detail="Graph is not awaiting approval.")
        
    # Resume by passing None
    result = await graph.ainvoke(None, config=config)
    
    # Strip sets for valid JSON serialization
    serialized_nodes = result.get("discovered_nodes", [])
    serialized_edges = result.get("discovered_edges", [])
    
    return JSONResponse(content={
        "status": "APPROVED",
        "verdict": "Clear" if result.get("current_risk_score", 0) < 50 else "High Risk",
        "relationships": [e for e in serialized_edges],  # Matches frontend schema expectation
        "fatal_flags": result.get("fatal_flags")
    })

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
