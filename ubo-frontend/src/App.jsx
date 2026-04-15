import React, { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import CustomNode from './CustomNode';
import UploadScreen from './UploadScreen';
import LoadingScreen from './LoadingScreen';

const nodeTypes = { custom: CustomNode };

// ─── Layout: hierarchical layers instead of circle ───────────────────────────
function layoutNodes(relationships) {
  if (!relationships || relationships.length === 0) return [];

  // Build adjacency info
  const uniqueNodes = new Map();
  const outgoing = new Map(); // how many edges go OUT from this node

  relationships.forEach(rel => {
    if (!uniqueNodes.has(rel.source)) {
      uniqueNodes.set(rel.source, {
        id: rel.source,
        sanctioned: rel.source_sanctioned,
        jurisdiction: rel.jurisdiction,
        risk_score: rel.risk_score,
        risk_level: rel.risk_level,
        flags: rel.risk_flags,
      });
    }
    if (!uniqueNodes.has(rel.target)) {
      uniqueNodes.set(rel.target, {
        id: rel.target,
        sanctioned: rel.target_sanctioned,
      });
    }
    outgoing.set(rel.source, (outgoing.get(rel.source) || 0) + 1);
  });

  const nodesArr = Array.from(uniqueNodes.values());
  const cols = Math.ceil(Math.sqrt(nodesArr.length));
  const HGAP = 340;
  const VGAP = 220;

  return nodesArr.map((n, i) => ({
    id: n.id,
    type: 'custom',
    data: {
      label: n.id,
      sanctioned: n.sanctioned,
      jurisdiction: n.jurisdiction,
      risk_score: n.risk_score,
      risk_level: n.risk_level,
      flags: n.flags,
    },
    position: {
      x: (i % cols) * HGAP + 80,
      y: Math.floor(i / cols) * VGAP + 100,
    },
  }));
}

// ─── Edges ────────────────────────────────────────────────────────────────────
function generateEdges(relationships) {
  if (!relationships || relationships.length === 0) return [];
  return relationships.map((rel, index) => {
    const isCritical = rel.risk_level === 'critical';
    const isDirector = rel.type === 'directs';
    return {
      id: `e${index}-${rel.source}-${rel.target}`,
      source: rel.source,
      target: rel.target,
      type: 'smoothstep',
      label: isDirector ? '👤 DIRECTOR' : `🔗 OWNS ${rel.percentage ?? ''}%`,
      animated: isCritical,
      style: {
        stroke: isCritical ? '#ef4444' : isDirector ? '#818cf8' : '#6b7280',
        strokeWidth: isCritical ? 3 : 2,
        strokeDasharray: isDirector ? '6 3' : undefined,
      },
      labelStyle: { fill: '#fff', fontWeight: 700, fontSize: 11 },
      labelBgPadding: [6, 4],
      labelBgStyle: {
        fill: isCritical ? '#450a0a' : isDirector ? '#1e1b4b' : '#111827',
        stroke: isCritical ? '#ef4444' : isDirector ? '#6366f1' : '#374151',
        strokeWidth: 1,
        rx: 4,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isCritical ? '#ef4444' : isDirector ? '#818cf8' : '#6b7280',
        width: 16,
        height: 16,
      },
      data: { 
        source_text: rel.source_text,
        source_document: rel.source_document,
        page_number: rel.page_number
      },
    };
  });
}

// ─── Proper DFS cycle detection (ownership edges only) ───────────────────────
function hasOwnershipCycle(relationships) {
  const ownEdges = relationships.filter(r => r.type === 'owns');
  const adj = {};
  ownEdges.forEach(r => {
    if (!adj[r.source]) adj[r.source] = [];
    adj[r.source].push(r.target);
  });
  const visited = new Set();
  const inStack = new Set();
  function dfs(node) {
    visited.add(node);
    inStack.add(node);
    for (const neighbor of (adj[node] || [])) {
      if (!visited.has(neighbor)) { if (dfs(neighbor)) return true; }
      else if (inStack.has(neighbor)) return true;
    }
    inStack.delete(node);
    return false;
  }
  for (const node of Object.keys(adj)) {
    if (!visited.has(node)) { if (dfs(node)) return true; }
  }
  return false;
}

// ─── Derive summary findings from the data ───────────────────────────────────
function buildFindings(relationships) {
  if (!relationships || relationships.length === 0) return [];
  const findings = [];

  // Proper circular loop detection using DFS on ownership edges only
  if (hasOwnershipCycle(relationships)) {
    findings.push({
      severity: 'critical',
      icon: '🔄',
      title: 'Circular Ownership Loop Detected',
      detail: 'A company in this network ultimately owns itself through a chain of shell entities — Company A owns B, B owns C, C owns A. This is a classic money laundering structure used to obscure the true owner.',
    });
  }

  // Puppet director: a person who directs multiple entities
  const directorCounts = {};
  relationships.forEach(r => {
    if (r.type === 'directs') {
      directorCounts[r.source] = (directorCounts[r.source] || 0) + 1;
    }
  });
  const puppets = Object.entries(directorCounts).filter(([, c]) => c > 1);
  if (puppets.length > 0) {
    puppets.forEach(([name]) => {
      findings.push({
        severity: 'high',
        icon: '🎭',
        title: `Nominee Director Detected: "${name}"`,
        detail: `"${name}" appears as director on multiple separate corporate entities — a signature pattern of a figurehead used to hide the real owner.`,
      });
    });
  }

  // Offshore jurisdictions
  const HIGH_RISK = ['British Virgin Islands', 'Panama', 'Cayman Islands', 'Seychelles', 'Luxembourg', 'Belize'];
  const found = new Set();
  relationships.forEach(r => {
    if (r.jurisdiction) {
      HIGH_RISK.forEach(h => {
        if (r.jurisdiction.toLowerCase().includes(h.toLowerCase())) found.add(h);
      });
    }
  });
  if (found.size > 0) {
    findings.push({
      severity: 'high',
      icon: '🌍',
      title: `Offshore Jurisdictions: ${[...found].join(', ')}`,
      detail: 'Entities registered in secrecy havens are frequently used to obscure the ultimate beneficial owner from regulatory authorities.',
    });
  }

  // Sanctioned entities
  const sanctioned = relationships.filter(r => r.source_sanctioned || r.target_sanctioned);
  if (sanctioned.length > 0) {
    findings.push({
      severity: 'critical',
      icon: '🚨',
      title: 'OFAC Sanctioned Entity Found',
      detail: `${sanctioned.length} relationship(s) involve an entity on the US Treasury sanctions blacklist. Immediate escalation required.`,
    });
  }

  return findings;
}

// ─── Severity Styles ─────────────────────────────────────────────────────────
const SEV = {
  critical: { bar: 'bg-red-500', bg: 'bg-red-950/60', border: 'border-red-700', text: 'text-red-300', badge: 'CRITICAL' },
  high: { bar: 'bg-orange-500', bg: 'bg-orange-950/60', border: 'border-orange-700', text: 'text-orange-300', badge: 'HIGH' },
  medium: { bar: 'bg-yellow-500', bg: 'bg-yellow-950/50', border: 'border-yellow-700', text: 'text-yellow-300', badge: 'MEDIUM' },
};


// ─── App ─────────────────────────────────────────────────────────────────────
function App() {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [evidence, setEvidence] = useState(null);
  const [findingsOpen, setFindingsOpen] = useState(true);
  const [edgeHintDismissed, setEdgeHintDismissed] = useState(false);

  const findings = graphData ? buildFindings(graphData.relationships) : [];
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const hasAlert = criticalCount > 0 || highCount > 0;

  const handleUpload = async (files) => {
    setLoading(true);
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    try {
      const res = await fetch('http://localhost:8000/analyze', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setGraphData(data);
    } catch (err) {
      console.error('Pipeline Error:', err);
      alert('Pipeline Error — check the console and ensure the backend is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (graphData?.relationships) {
      setNodes(layoutNodes(graphData.relationships));
      setEdges(generateEdges(graphData.relationships));
    }
  }, [graphData, setNodes, setEdges]);

  const onEdgeClick = useCallback((event, edge) => {
    event.stopPropagation();
    setEdgeHintDismissed(true);
    setEvidence({
      sourceName: edge.source,
      targetName: edge.target,
      label: edge.label,
      proof: edge.data?.source_text || 'Forensic proof not extracted.',
      document: edge.data?.source_document,
      page: edge.data?.page_number,
    });
  }, []);

  const onPaneClick = useCallback(() => setEvidence(null), []);

  if (loading) return <LoadingScreen />;
  if (!graphData) return <UploadScreen onUpload={handleUpload} />;

  return (
    <div className="w-screen h-screen bg-[#080a0e] relative overflow-hidden font-sans">

      {/* ── Alert Banner ─────────────────────────────────────────────────── */}
      {hasAlert && (
        <div className={`absolute top-0 left-0 right-0 z-30 flex items-center gap-3 px-6 py-3 border-b backdrop-blur text-white text-sm font-semibold shadow-lg ${
          criticalCount > 0
            ? 'bg-red-900/90 border-red-600'
            : 'bg-orange-900/90 border-orange-600'
        }`}>
          <span className="text-lg animate-pulse">{criticalCount > 0 ? '🚨' : '⚠️'}</span>
          <span>
            {criticalCount > 0
              ? `${criticalCount} CRITICAL ANOMAL${criticalCount > 1 ? 'IES' : 'Y'} DETECTED — Circular ownership loop or sanctioned entity found.`
              : `${highCount} SUSPICIOUS PATTERN${highCount > 1 ? 'S' : ''} DETECTED — Offshore shell entities or nominee directors found in this filing.`
            }
          </span>
          <button onClick={() => setFindingsOpen(true)} className={`ml-auto px-3 py-1 rounded text-xs border transition ${
            criticalCount > 0 ? 'bg-red-700 hover:bg-red-600 border-red-500' : 'bg-orange-700 hover:bg-orange-600 border-orange-500'
          }`}>
            View Findings
          </button>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className={`absolute left-0 w-full px-6 py-4 z-20 pointer-events-none flex justify-between items-center bg-gradient-to-b from-black/90 to-transparent ${hasAlert ? 'top-10' : 'top-0'}`}>
        <div>
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
            UBO Graph — Ownership Topology
          </h1>
          <p className="text-gray-500 text-xs uppercase tracking-widest mt-0.5">Forensic Analysis Complete · {graphData.relationships.length} relationships mapped</p>
        </div>
        <button
          onClick={() => setGraphData(null)}
          className="pointer-events-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded font-semibold text-sm border border-slate-600 transition"
        >
          New Investigation
        </button>
      </div>

      {/* ── React Flow Canvas ─────────────────────────────────────────────── */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        className="bg-[#0a0c10]"
      >
        <Background color="#1d2535" variant="dots" gap={20} size={1} />
        <Controls style={{ backgroundColor: '#1a1d24', border: '1px solid #374151' }} />
        <MiniMap
          nodeColor={n => {
            if (n.data?.sanctioned) return '#dc2626';
            if (n.data?.risk_level === 'critical') return '#ef4444';
            if (n.data?.risk_level === 'high') return '#f97316';
            if (n.data?.risk_level === 'medium') return '#eab308';
            return '#4b5563';
          }}
          maskColor="rgba(0,0,0,0.75)"
          style={{ backgroundColor: '#111827', border: '1px solid #374151' }}
        />

        {/* ── Legend Panel ──────────────────────────────────────────────── */}
        <Panel position="bottom-left">
          <div className="bg-[#111827]/90 border border-gray-700 rounded-xl p-4 text-xs text-gray-300 w-64 backdrop-blur shadow-xl">
            <div className="text-gray-400 font-bold uppercase tracking-widest mb-3 text-[10px]">How To Read This Map</div>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-red-500 bg-red-950 flex-shrink-0"></div>
                <span><span className="text-red-400 font-bold">Critical Risk</span> — circular loop or sanctioned entity</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-orange-500 bg-orange-950 flex-shrink-0"></div>
                <span><span className="text-orange-400 font-bold">High Risk</span> — offshore jurisdiction or puppet director</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-yellow-500 bg-yellow-950 flex-shrink-0"></div>
                <span><span className="text-yellow-400 font-bold">Medium Risk</span> — minor flags detected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-green-500 bg-green-950 flex-shrink-0"></div>
                <span><span className="text-green-400 font-bold">Low Risk</span> — no anomalies found</span>
              </div>
              <hr className="border-gray-700 my-1" />
              <div className="flex items-center gap-2">
                <div className="h-0.5 w-6 bg-red-500 flex-shrink-0"></div>
                <span>Animated red line = suspicious ownership chain</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-0.5 w-6 bg-indigo-400 flex-shrink-0" style={{borderTop: '2px dashed #818cf8'}}></div>
                <span>Dashed line = directorship / control</span>
              </div>
              <hr className="border-gray-700 my-1" />
              <div className="text-yellow-300 bg-yellow-900/30 rounded p-2 border border-yellow-800 font-medium">
                Click any line (edge) to see the exact source text from the document that proves the connection.
              </div>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      {/* ── Edge Click Hint ───────────────────────────────────────────────── */}
      {!edgeHintDismissed && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-indigo-900/90 border border-indigo-500 text-indigo-200 text-sm px-5 py-3 rounded-full shadow-xl backdrop-blur flex items-center gap-2 pointer-events-none animate-bounce">
          <span>👆</span> Click any arrow between nodes to see the forensic evidence
        </div>
      )}

      {/* ── Findings Sidebar ─────────────────────────────────────────────── */}
      <div className={`absolute top-0 right-0 h-full w-[400px] bg-[#0e1117] border-l border-gray-800 shadow-2xl transition-transform duration-300 z-40 flex flex-col ${findingsOpen && !evidence ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-5 border-b border-gray-800 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Investigation Findings</h2>
            <p className="text-gray-500 text-xs mt-0.5">{findings.length} anomalies detected in this filing</p>
          </div>
          <button onClick={() => setFindingsOpen(false)} className="text-gray-500 hover:text-white w-8 h-8 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {findings.length === 0 && (
            <div className="text-center text-gray-500 mt-10 text-sm">No suspicious patterns detected.</div>
          )}
          {findings.map((f, i) => {
            const s = SEV[f.severity] || SEV.medium;
            return (
              <div key={i} className={`rounded-xl border ${s.border} ${s.bg} overflow-hidden`}>
                <div className={`${s.bar} h-1 w-full`}></div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{f.icon}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${s.bar} text-white tracking-widest`}>{f.severity.toUpperCase()}</span>
                  </div>
                  <p className={`font-bold text-sm ${s.text} mb-2`}>{f.title}</p>
                  <p className="text-gray-400 text-xs leading-relaxed">{f.detail}</p>
                </div>
              </div>
            );
          })}

          <div className="rounded-xl border border-blue-900 bg-blue-950/30 p-4 mt-2">
            <p className="text-xs font-bold text-blue-400 mb-1 uppercase tracking-widest">How To Investigate</p>
            <p className="text-gray-400 text-xs leading-relaxed">Click any arrow between two nodes on the graph to open the Evidence Panel — it shows the exact sentence from the source PDF that proves the connection.</p>
          </div>
        </div>
        <div className="p-4 border-t border-gray-800 text-center text-xs text-gray-600 flex-shrink-0">
          Powered by Gemini Flash · OFAC SQLite Engine · {graphData.relationships.length} relationships
        </div>
      </div>

      {/* ── Findings Toggle Button (when sidebar is closed) ──────────────── */}
      {!findingsOpen && !evidence && (
        <button
          onClick={() => setFindingsOpen(true)}
          className="absolute top-1/2 right-0 -translate-y-1/2 z-40 bg-slate-800 hover:bg-slate-700 border-l-0 border border-gray-600 text-white text-xs font-bold px-2 py-6 rounded-l-xl shadow-xl transition writing-mode-vertical"
          style={{ writingMode: 'vertical-rl' }}
        >
          Findings {findings.length > 0 && `(${findings.length})`}
        </button>
      )}

      {/* ── Evidence Panel (slide-out on edge click) ──────────────────────── */}
      <div
        className={`absolute top-0 right-0 h-full w-[450px] bg-[#0e1117] border-l border-gray-700 shadow-2xl transition-transform duration-300 ease-in-out z-50 ${evidence ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={e => e.stopPropagation()}
      >
        {evidence && (
          <div className="p-6 h-full flex flex-col text-white">
            <div className="flex justify-between items-center mb-5 border-b border-gray-700 pb-4">
              <h2 className="text-lg font-bold text-blue-400">Evidence Provenance</h2>
              <button onClick={() => setEvidence(null)} className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center transition">✕</button>
            </div>

            <div className="mb-4 bg-slate-900/80 rounded-lg p-4 border border-slate-700">
              <div className="text-[10px] text-gray-500 font-bold tracking-widest uppercase mb-3">Connection Being Proved</div>
              <div className="flex flex-col gap-2 text-sm">
                <div className="px-3 py-2 bg-slate-800 rounded border border-slate-600 font-semibold text-center">{evidence.sourceName}</div>
                <div className="flex justify-center text-gray-400 font-mono text-xs">{evidence.label}</div>
                <div className="flex justify-center text-gray-400 text-xs">↓</div>
                <div className="px-3 py-2 bg-slate-800 rounded border border-slate-600 font-semibold text-center">{evidence.targetName}</div>
              </div>
            </div>

            <div className="bg-[#090f1a] p-5 rounded-lg border border-blue-900/50 flex-grow relative overflow-y-auto">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l"></div>
              <div className="text-[10px] text-blue-400 font-bold tracking-widest uppercase mb-3">Source Document Quote</div>
              <p className="text-gray-200 leading-relaxed italic text-base whitespace-pre-wrap mb-4">
                <span className="bg-yellow-500/25 text-yellow-100 px-1 rounded border-b border-yellow-500/50 leading-[2]">{evidence.proof}</span>
              </p>
              
              {evidence.document && (
                <div className="mt-auto pt-4 border-t border-blue-900/50 flex justify-center">
                  <a 
                    href={`http://localhost:8000/docs/${evidence.document}${evidence.page ? `#page=${evidence.page}` : ''}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-blue-100 text-xs font-bold uppercase tracking-wider rounded border border-blue-700 transition"
                  >
                    📄 View Source Document {evidence.page && `(Page ${evidence.page})`}
                  </a>
                </div>
              )}
            </div>

            <div className="mt-4 text-center text-xs text-slate-500 p-3 bg-black/20 rounded-lg border border-white/5 flex-shrink-0">
              <span className="text-emerald-500 font-bold">AI Extraction Verified</span>
              <span className="mx-2">·</span>
              Gemini Flash + PyMuPDF
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

export default App;
