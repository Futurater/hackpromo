import React from 'react';
import { Handle, Position } from '@xyflow/react';

function CustomNode({ data }) {
  // Determine border and background colors based on risk level
  const borderColors = {
    critical: 'border-red-500 shadow-red-500/50',
    high: 'border-orange-500 shadow-orange-500/50',
    medium: 'border-yellow-500 shadow-yellow-500/50',
    low: 'border-green-500 shadow-green-500/50',
  };
  
  const bgColors = {
    critical: 'bg-red-950',
    high: 'bg-orange-950',
    medium: 'bg-yellow-950',
    low: 'bg-green-950',
  };
  
  const scoreBadgeColors = {
    critical: 'bg-red-900 border-red-500 text-red-200',
    high: 'bg-orange-900 border-orange-500 text-orange-200',
    medium: 'bg-yellow-900 border-yellow-500 text-yellow-200',
    low: 'bg-green-900 border-green-500 text-green-200',
  };

  const riskLevel = data.risk_level || 'low';
  const borderColorAttr = borderColors[riskLevel];
  const bgColorAttr = bgColors[riskLevel];
  const scoreBadgeAttr = scoreBadgeColors[riskLevel];

  return (
    <div className={`px-4 py-3 rounded shadow-md border-2 bg-slate-900 text-white min-w-[200px] ${borderColorAttr} relative`}>
      <Handle type="target" position={Position.Top} className="!bg-teal-500 !w-3 !h-3" />
      
      {/* Risk Score Badge - The Enterprise Finish feature */}
      {data.risk_score && (
        <div className={`absolute -top-3 -right-3 text-xs font-bold px-2 py-1 rounded-full border shadow-lg z-10 ${scoreBadgeAttr}`}>
          {data.risk_score.toFixed(1)}/10
        </div>
      )}
      
      <div className="flex flex-col">
        {/* Flag Badges */}
        <div className="flex flex-wrap gap-1 mb-2 max-w-[180px]">
           {data.flags && data.flags.map((flag, i) => (
             <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
               {flag}
             </span>
           ))}
           {data.sanctioned && (
             <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-900 text-red-200 border border-red-700 font-bold uppercase animate-pulse">
               OFAC Sanctioned
             </span>
           )}
        </div>
        
        <div className="font-bold text-sm break-words">{data.label}</div>
        
        {data.jurisdiction && (         
          <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">
            📍 {data.jurisdiction}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-teal-500 !w-3 !h-3" />
    </div>
  );
}

export default CustomNode;
