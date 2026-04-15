import React, { useState, useCallback } from 'react';
import { UploadCloud, File as FileIcon, X, Play } from 'lucide-react';

export default function UploadScreen({ onUpload }) {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
      setFiles(prev => [...prev, ...newFiles]);
    }
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  return (
    <div className="w-screen h-screen bg-[#0a0a0a] flex flex-col items-center justify-center font-sans">
      <div className="text-center mb-10">
        <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-400 mb-4">
          UBO Forensics Engine
        </h1>
        <p className="text-gray-400 text-lg uppercase tracking-widest font-semibold max-w-xl mx-auto">
          Drop complex offshore incorporation documents. Instantly uncover ultimate beneficial owners and sanctions.
        </p>
      </div>

      <div 
        className={`w-full max-w-2xl p-12 border-2 border-dashed rounded-xl transition-all duration-300 ${
          isDragging ? 'border-red-500 bg-red-500/10 scale-105' : 'border-gray-700 bg-[#11111a] hover:border-gray-500'
        } flex flex-col items-center justify-center cursor-pointer relative`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input 
          type="file" 
          multiple 
          accept="application/pdf"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleFileInput}
        />
        <UploadCloud size={64} className={`mb-6 ${isDragging ? 'text-red-500' : 'text-gray-500'}`} />
        <h3 className="text-2xl font-bold text-white mb-2">Drop Corporate PDFs Here</h3>
        <p className="text-gray-500">Supports .pdf files from official registries (Panama, BVI, UK, etc.)</p>
      </div>

      {files.length > 0 && (
        <div className="w-full max-w-2xl mt-8">
          <h4 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Files to Analyze ({files.length})</h4>
          <div className="flex flex-col gap-3 mb-8 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-[#1a1a24] border border-gray-800 rounded-lg group">
                <div className="flex items-center gap-3">
                  <div className="bg-red-500/10 p-2 rounded text-red-500">
                    <FileIcon size={20} />
                  </div>
                  <span className="text-gray-300 font-medium">{f.name}</span>
                </div>
                <button onClick={() => removeFile(i)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={20} />
                </button>
              </div>
            ))}
          </div>

          <button 
            onClick={() => onUpload(files)}
            className="w-full py-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold text-lg rounded-xl shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-all flex items-center justify-center gap-2"
          >
            <Play size={20} className="fill-white" /> Run Forensic Extraction
          </button>
        </div>
      )}
    </div>
  );
}
