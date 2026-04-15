import React, { useState, useEffect } from 'react';
import { Search, BrainCircuit, ShieldAlert, Network, CheckCircle2 } from 'lucide-react';

export default function LoadingScreen() {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    { text: "Ingesting and OCR'ing documents...", icon: <Search size={28} className="text-blue-500" /> },
    { text: "Extracting corporate topologies via Gemini...", icon: <BrainCircuit size={28} className="text-purple-500" /> },
    { text: "Building ultimate ownership graph...", icon: <Network size={28} className="text-indigo-500" /> },
    { text: "Cross-referencing global OFAC sanctions...", icon: <ShieldAlert size={28} className="text-red-500" /> },
    { text: "Calculating jurisdiction and structure risk scores...", icon: <ShieldAlert size={28} className="text-orange-500" /> },
    { text: "Investigation complete. Rendering map.", icon: <CheckCircle2 size={28} className="text-green-500" /> }
  ];

  // We don't control the real time (it's pending the fetch request),
  // but we can cycle through the first 5 steps over ~15-20 seconds.
  // The last step will just sit until the parent unmounts this.
  useEffect(() => {
    const intervals = [0, 3000, 7000, 11000, 15000, 19000];
    
    const timers = intervals.map((time, index) => {
        return setTimeout(() => setCurrentStep(index), time);
    });

    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="w-screen h-screen bg-[#0a0a0a] flex flex-col items-center justify-center font-sans relative overflow-hidden">
        
        {/* Background pulsing radar effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-red-900/20 rounded-full animate-ping" style={{animationDuration: '3s'}}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-red-900/30 rounded-full animate-ping" style={{animationDuration: '3s', animationDelay: '1s'}}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-red-900/40 rounded-full animate-ping" style={{animationDuration: '3s', animationDelay: '2s'}}></div>

        <div className="z-10 bg-[#11111a] p-10 flex flex-col items-center w-[500px] rounded-2xl border border-gray-800 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="mb-8 p-6 bg-gray-900 rounded-full animate-pulse border-2 border-gray-700">
                {steps[currentStep].icon}
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2 text-center h-16">
                {steps[currentStep].text}
            </h2>
            
            <div className="w-full bg-gray-800 rounded-full h-2 mb-4 overflow-hidden">
                <div 
                    className="bg-gradient-to-r from-red-500 to-orange-500 h-2 rounded-full transition-all duration-1000 ease-in-out"
                    style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                ></div>
            </div>
            
            <div className="text-gray-500 text-sm w-full font-mono mt-4">
                {steps.map((step, index) => (
                    <div key={index} className={`flex items-center gap-2 mb-2 transition-opacity duration-300 ${index <= currentStep ? 'opacity-100' : 'opacity-20'}`}>
                        {index < currentStep ? <CheckCircle2 size={14} className="text-green-500"/> : index === currentStep ? <div className="w-[14px] h-[14px] rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div> : <div className="w-[14px] h-[14px] rounded-full border-2 border-gray-600"></div>}
                        <span className={index === currentStep ? 'text-gray-200 font-bold' : 'text-gray-600'}>{step.text.split("...")[0]}</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
}
