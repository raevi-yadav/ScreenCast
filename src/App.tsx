import { useState } from "react";
import { Activity, Settings } from "lucide-react";
import WebReceiver from "./components/WebReceiver";
import SetupGuide from "./components/SetupGuide";

export default function App() {
  const [activeTab, setActiveTab] = useState<"receiver" | "setup">("receiver");

  return (
    <div className="min-h-screen bg-[#050608] text-slate-300 flex flex-col font-sans" id="app-viewport">
      {/* Immersive UI: System Status Bar Header */}
      <header className="border-b border-white/10 bg-[#0c0f16]/90 backdrop-blur-md sticky top-0 z-40 select-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs font-mono tracking-widest uppercase text-emerald-500 font-bold">System.Core // CastCore.Active</h1>
                <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono px-2 py-0.5 rounded-sm select-none">
                  V4.2.1-LIVE
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-tight mt-0.5">
                Low Latency (&lt;100ms) Screen & Audio Android-to-macOS Streaming Pipeline
              </p>
            </div>
          </div>

          <div className="flex gap-6 sm:gap-10 text-[10px] font-mono tracking-tighter uppercase">
            <div className="flex flex-col">
              <span className="text-slate-500">Network Protocol</span>
              <span className="text-white">WebRTC / fMP4-WS</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">Service Hash</span>
              <span className="text-emerald-400">0x8F22..44B</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">Latency Target</span>
              <span className="text-white">SUB-100MS</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 pb-32">
        {/* Tab view segments */}
        <div className="min-h-[500px]" id="workspace-viewport">
          {activeTab === "receiver" && <WebReceiver />}
          {activeTab === "setup" && <SetupGuide />}
        </div>
      </main>

      {/* Sticky/Fixed Persistent Bottom Navigation Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 select-none">
        <div className="bg-[#0c0f16]/90 backdrop-blur-lg border border-white/10 p-1.5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex gap-2">
          <button
            onClick={() => setActiveTab("receiver")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-mono tracking-wider uppercase transition-all cursor-pointer ${
              activeTab === "receiver"
                ? "bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 font-bold shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
            }`}
            id="tab-btn-receiver"
          >
            <Activity size={14} className={activeTab === "receiver" ? "animate-pulse" : ""} />
            <span>Receiver</span>
          </button>
          
          <button
            onClick={() => setActiveTab("setup")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-mono tracking-wider uppercase transition-all cursor-pointer ${
              activeTab === "setup"
                ? "bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 font-bold shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
            }`}
            id="tab-btn-setup"
          >
            <Settings size={14} className={activeTab === "setup" ? "rotate-45 transition-transform duration-500" : ""} />
            <span>Setup & Tune</span>
          </button>
        </div>
      </div>

      {/* Immersive UI Footer: System Architecture Details */}
      <footer className="border-t border-white/10 bg-black py-6 select-none pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-mono text-slate-500 uppercase">
          <div>ARCH: KOTLIN-NATIVE // CORE: ANDROID-SDK-34 // TARGET: ULTRA-LOW-LATENCY</div>
          <div className="flex gap-4 items-center">
            <span className="text-emerald-500">ENCRYPTED (AES-128)</span>
            <span>BUFFER: 8MS</span>
            <span className="text-white">V4.2.1-RELEASE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
