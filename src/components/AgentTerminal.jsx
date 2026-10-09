import React, { useEffect, useState, useRef } from 'react';

// Progress messages describe the deterministic pipeline stages that run after this
// loading view. They intentionally avoid asserting specific findings or numbers,
// since the real values are computed by the engine and shown in the dashboard.
const LOG_MESSAGES = [
  { agent: 'Coordinator', msg: 'Initializing PropIntel collateral pipeline...', delay: 0 },
  { agent: 'Geospatial Agent', msg: 'Resolving location and nearby infrastructure for {location}...', delay: 400 },
  { agent: 'Geospatial Agent', msg: 'Indexing hyperlocal proximity and access signals...', delay: 1200 },
  { agent: 'Market Agent', msg: 'Resolving circle-rate reference and local market norms...', delay: 1800 },
  { agent: 'Vision Agent', msg: 'Running local vision scan on uploaded images...', delay: 2500, conditional: true },
  { agent: 'Vision Agent', msg: 'Scoring visual condition from detected markers...', delay: 3600, conditional: true },
  { agent: 'Legal Agent', msg: 'Checking declared legal / title status...', delay: 4100 },
  { agent: 'Risk Agent', msg: 'Synthesizing anomaly, valuation, and liquidity signals...', delay: 5000 },
  { agent: 'Coordinator', msg: 'Finalizing deterministic collateral assessment...', delay: 6000 }
];

export default function AgentTerminal({ isActive, locationName = "Target", hasImages = false, externalLog = null, blockComplete = false, onComplete }) {
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [totalSteps, setTotalSteps] = useState(LOG_MESSAGES.length);
  const containerRef = useRef(null);
  
  const isBlockedRef = useRef(blockComplete);
  useEffect(() => {
     isBlockedRef.current = blockComplete;
  }, [blockComplete]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isActive) {
      setLogs([]);
      return;
    }

    let timeouts = [];
    
    // Filter conditionals
    const activeLogs = LOG_MESSAGES.map(l => ({ ...l, msg: l.msg.replace('{location}', locationName) }))
      .filter(l => !l.conditional || hasImages);

    setTotalSteps(activeLogs.length);

    activeLogs.forEach((log, index) => {
      const isLast = index === activeLogs.length - 1;
      const t = setTimeout(() => {
        setLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          agent: log.agent,
          msg: log.msg,
          id: index
        }]);
        setProgress(Math.round(((index + 1) / activeLogs.length) * 100));
        
        if (isLast && onCompleteRef.current) {
          // Delay completion if blocked by an external action (like a huge model download)
          const attemptCompletion = () => {
             if (!isBlockedRef.current) {
                setTimeout(onCompleteRef.current, 800);
             } else {
                setTimeout(attemptCompletion, 1000);
             }
          };
          attemptCompletion();
        }
      }, log.delay);
      timeouts.push(t);
    });

    return () => timeouts.forEach(clearTimeout);
  }, [isActive, locationName, hasImages]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isActive && logs.length === 0) return null;

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-xl border border-slate-200 w-full max-w-3xl mx-auto flex flex-col font-mono text-sm relative z-50">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-3">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400"></div>
          <div className="w-3 h-3 rounded-full bg-amber-400"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
        </div>
        <p className="text-slate-500 text-xs font-bold tracking-wider">PropIntel TERMINAL :: AGENTIC_SWARM_ACTIVE</p>
      </div>
      <div ref={containerRef} className="p-4 h-64 overflow-y-auto w-full text-left space-y-3 relative scrollbar-hide scroll-smooth">
        {logs.map((log, i) => (
          <div key={log.id} className={`animate-in fade-in slide-in-from-bottom-2 duration-300 ${i === logs.length - 1 ? 'opacity-100' : 'opacity-70'}`}>
            <span className="text-slate-400">[{log.timestamp}]</span>{' '}
            <span className={`font-bold ${
              log.agent === 'Vision Agent' ? 'text-pink-600' :
              log.agent === 'Legal Agent' ? 'text-blue-600' :
              log.agent === 'Geospatial Agent' ? 'text-emerald-600' :
              log.agent === 'Market Agent' ? 'text-amber-600' :
              log.agent === 'Coordinator' ? 'text-slate-800' : 'text-purple-600'
            }`}>[{log.agent}]</span>{' '}
            <span className="text-slate-700">{log.msg}</span>
          </div>
        ))}
        {externalLog && (
          <div className="animate-in fade-in duration-300">
            <span className="text-slate-400">[{new Date().toLocaleTimeString()}]</span>{' '}
            <span className="font-bold text-pink-600">[Vision Agent]</span>{' '}
            <span className="text-slate-700">{externalLog}</span>
          </div>
        )}
        {isActive && (
          <div className="mt-2 text-indigo-600 flex items-center gap-2">
            <span className="animate-pulse font-bold">Processing pipeline variables_</span>
          </div>
        )}
      </div>
      
      {/* Real-time Progress Bar */}
      <div className="bg-slate-50 border-t border-slate-200 p-3 flex items-center gap-4">
         <div className="text-xs font-bold text-slate-500 w-12 text-right">{progress}%</div>
         <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div 
               className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out" 
               style={{ width: `${progress}%` }}
            />
         </div>
         <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {logs.length} / {totalSteps} engines
         </div>
      </div>
    </div>
  );
}
