import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { 
  Smartphone, 
  Shield, 
  Network, 
  RefreshCw, 
  Cpu, 
  CheckCircle2, 
  Play,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  Laptop
} from "lucide-react";

export default function SetupGuide() {
  const [qrIp, setQrIp] = useState("192.168.1.50");
  const [qrPort, setQrPort] = useState("8080");
  const [qrMode, setQrMode] = useState<"web" | "ws">("web");
  const [copied, setCopied] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Get current domain URL or fallback
  const getReceiverUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://ais-dev-swcueefagaea57vxa4yrua-513518383109.asia-southeast1.run.app";
    return `${origin}/?ip=${qrIp}&port=${qrPort}`;
  };

  const getWsUrl = () => {
    return `ws://${qrIp}:${qrPort}`;
  };

  useEffect(() => {
    if (qrCanvasRef.current) {
      const textToEncode = qrMode === "web" ? getReceiverUrl() : getWsUrl();
      QRCode.toCanvas(
        qrCanvasRef.current,
        textToEncode,
        {
          width: 144, // 144px
          margin: 1.5,
          color: {
            dark: "#050608", // Clean dark blocks
            light: "#ffffff", // Pure white sheet for high contrast scanning
          },
        },
        (error) => {
          if (error) console.error("Error generating QR code", error);
        }
      );
    }
  }, [qrIp, qrPort, qrMode]);

  const handleCopy = () => {
    const textToCopy = qrMode === "web" ? getReceiverUrl() : getWsUrl();
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-relaxed font-sans text-xs text-slate-300" id="setup-guide-root">
      {/* 0. Live Pairing QR Code Generator */}
      <div className="col-span-1 md:col-span-2 bg-[#0c0f16] border border-emerald-500/20 rounded-2xl p-6 shadow-md flex flex-col md:flex-row justify-between gap-6 relative overflow-hidden" id="qr-generator-root">
        {/* Glow decorative effect */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="flex flex-col gap-4 flex-1">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-ping" />
              <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold tracking-widest">Interactive utility // live pairing</span>
            </div>
            <h3 className="font-mono text-slate-100 text-sm font-bold tracking-wider uppercase flex items-center gap-2">
              <QrCode className="text-emerald-400" size={18} /> QR Code Connector & Quick Launch
            </h3>
            <p className="text-slate-400 text-xs mt-2 max-w-xl leading-relaxed">
              Dynamically encode your Android Cast Service's IP and port. Scan this QR code with any camera or auxiliary device to automatically point your web client's receiver page to your specific phone.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
            {/* Input fields */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-semibold">
                Android IP Address
              </label>
              <input
                type="text"
                value={qrIp}
                onChange={(e) => setQrIp(e.target.value)}
                placeholder="e.g. 192.168.1.50"
                className="bg-[#050608] border border-white/10 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-700"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-semibold">
                WebSocket Port
              </label>
              <input
                type="text"
                value={qrPort}
                onChange={(e) => setQrPort(e.target.value)}
                placeholder="e.g. 8080"
                className="bg-[#050608] border border-white/10 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-700"
              />
            </div>
          </div>

          {/* Payload Toggles */}
          <div className="flex flex-col gap-2 mt-1">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-semibold">
              QR Code Payload Type
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setQrMode("web")}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer border ${
                  qrMode === "web"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold"
                    : "bg-[#050608] border-white/5 text-slate-400 hover:text-slate-200"
                }`}
              >
                Receiver Browser URL
              </button>
              <button
                onClick={() => setQrMode("ws")}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer border ${
                  qrMode === "ws"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold"
                    : "bg-[#050608] border-white/5 text-slate-400 hover:text-slate-200"
                }`}
              >
                Raw ws:// Endpoint
              </button>
            </div>
          </div>
        </div>

        {/* QR Code and Copy Area */}
        <div className="flex flex-col items-center justify-center bg-[#050608]/50 border border-white/5 p-4 rounded-xl gap-4 min-w-[200px]" id="qr-display-container">
          <div className="relative group p-1.5 bg-white rounded-xl shadow-lg flex items-center justify-center">
            <canvas ref={qrCanvasRef} className="w-36 h-36 rounded-lg" />
          </div>

          <div className="flex flex-col w-full gap-2">
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 bg-[#0c0f16] hover:bg-[#141a27] border border-white/10 hover:border-emerald-500/20 text-slate-200 py-1.5 px-3 rounded-lg text-[11px] font-mono transition-all cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="text-emerald-400 animate-bounce" size={12} />
                  <span className="text-emerald-400 font-bold">COPIED SUCCESSFULLY</span>
                </>
              ) : (
                <>
                  <Copy size={12} className="text-slate-400" />
                  <span>COPY LINK ADDR</span>
                </>
              )}
            </button>

            {qrMode === "web" && (
              <a
                href={getReceiverUrl()}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 py-1.5 px-3 rounded-lg text-[11px] font-mono font-bold transition-all text-center"
              >
                <Laptop size={12} />
                <span>OPEN RECEIVER IN TAB</span>
                <ExternalLink size={10} className="opacity-70" />
              </a>
            )}
          </div>
        </div>
      </div>
      {/* Target SDK 34 + Build Setup */}
      <div className="bg-[#0c0f16] border border-white/10 rounded-2xl p-5 shadow-sm flex flex-col gap-4 select-none">
        <h3 className="font-mono text-slate-100 text-xs font-bold tracking-wider uppercase flex items-center gap-2">
          <Smartphone className="text-emerald-400" size={18} /> 1. Android Compilation & Build
        </h3>
        
        <div className="flex flex-col gap-3.5">
          <p className="text-slate-400">
            Ensure your development environment matches modern native Android SDK targets before compiling. Our code uses Android 10+ (API 29) system capture and target SDK 34+ (Android 14) foreground lifecycle requirements.
          </p>

          <div className="bg-[#050608] border border-white/5 rounded-xl p-4 flex flex-col gap-2 font-mono text-[10px]">
            <div className="flex justify-between border-b border-white/5 pb-1.5 mb-1.5 uppercase">
              <span>Required IDE</span>
              <span className="text-emerald-400 font-bold">Android Studio Iguana / Ladybug+</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5 mb-1.5 uppercase">
              <span>Gradle Daemon</span>
              <span className="text-emerald-400 font-bold">v8.4 or higher</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5 mb-1.5 uppercase">
              <span>Java Development Kit</span>
              <span className="text-emerald-400 font-bold">JDK 17 matching Java 17</span>
            </div>
            <div className="flex justify-between uppercase">
              <span>Target Android API</span>
              <span className="text-emerald-400 font-bold">Compile SDK 34 / Target SDK 34</span>
            </div>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 flex flex-col gap-2">
            <h4 className="font-mono text-emerald-400 text-xs flex items-center gap-1.5 font-bold uppercase tracking-wider">
              <CheckCircle2 size={13} /> Strict SDK 34+ Compliance
            </h4>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Android 14 imposes absolute, strict controls on Foreground Services. A service using capture must explicitly declare service type parameters.
              <code className="block bg-[#050608] border border-white/5 rounded px-2 py-1 mt-1.5 text-[10px] text-pink-400 font-mono">
                foregroundServiceType="mediaProjection|mediaPlayback"
              </code>
              Failing to combine these in the system manifest will throw a runtime <code className="text-rose-400">SecurityException</code> immediately upon starting projection.
            </p>
          </div>
        </div>
      </div>

      {/* Permissions Workflow */}
      <div className="bg-[#0c0f16] border border-white/10 rounded-2xl p-5 shadow-sm flex flex-col gap-4 select-none">
        <h3 className="font-mono text-slate-100 text-xs font-bold tracking-wider uppercase flex items-center gap-2">
          <Shield className="text-emerald-400" size={18} /> 2. Security & Request Consent
        </h3>

        <div className="flex flex-col gap-3">
          <p className="text-slate-400">
            For security, capturing user pixels and device playback requires explicit runtime consensus and cannot be bypassed.
          </p>

          <ol className="list-decimal pl-4 flex flex-col gap-3 text-slate-400 font-mono text-[11px]">
            <li>
              <strong className="text-slate-200">Record Audio Approval:</strong>
              <div className="text-[11px] mt-0.5 font-sans text-slate-400">
                The application launches a prompt asking for permission to record local audio.
                This is required to bind system playback capture.
              </div>
            </li>
            <li>
              <strong className="text-slate-200">System MediaProjection Overlay:</strong>
              <div className="text-[11px] mt-0.5 font-sans text-slate-400">
                The user clicks active cast toggles. MainActivity uses <code className="text-emerald-400 font-mono">projectionManager.createScreenCaptureIntent()</code> which opens the OS confirmation dialog stating the service is recording sensitive contents.
              </div>
            </li>
            <li>
              <strong className="text-slate-200">Notification Dispatching:</strong>
              <div className="text-[11px] mt-0.5 font-sans text-slate-400">
                Once approved, the service boots a persistent Notification. This visual indicator remains visible in the system status rail to prevent hidden backend monitoring.
              </div>
            </li>
          </ol>
        </div>
      </div>

      {/* Networking Handshake */}
      <div className="bg-[#0c0f16] border border-white/10 rounded-2xl p-5 shadow-sm flex flex-col gap-4 select-none">
        <h3 className="font-mono text-slate-100 text-xs font-bold tracking-wider uppercase flex items-center gap-2">
          <Network className="text-emerald-400" size={18} /> 3. Sub-Network Matching & Web Handshakes
        </h3>

        <div className="flex flex-col gap-3.5">
          <p className="text-slate-400">
            Since transmission happens directly inside the local network (LAN) over socket channels to minimize routing latency, the devices must be paired correctly.
          </p>

          <div className="bg-[#050608] border border-white/10 rounded-xl p-4 flex flex-col gap-2 leading-relaxed">
            <h4 className="font-mono text-slate-200 text-[11px] font-bold uppercase tracking-wider">Local LAN Access Topology</h4>
            <div className="text-slate-500 font-mono text-[10px] flex flex-col gap-1.5 mt-1">
              <div className="flex gap-2 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Your Android Phone: <strong className="text-slate-300">192.168.1.50</strong></span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>MacBook web browser: <strong className="text-slate-300">192.168.1.80</strong></span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                <span>Subnet match: <strong className="text-slate-400">255.255.255.0 (Identical network)</strong></span>
              </div>
            </div>
          </div>

          <div className="bg-[#050608] border border-white/5 rounded-xl p-4">
            <h4 className="font-mono text-slate-200 text-xs mb-1.5 font-bold uppercase tracking-wide">No-Dependency Socket Server</h4>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              We build a highly robust, pure Kotlin <code className="text-pink-400 font-mono">WebSocketsStreamingServer</code> using standard <code className="text-emerald-400 font-mono">ServerSocket</code>. It decodes connection upgrades, processes standard Sec-WebSocket RFC-6455 handshakes, computes SHA-1 Base64 digests, and transfers raw binary packets seamlessly without bulky frameworks.
            </p>
          </div>
        </div>
      </div>

      {/* Latency Optimizations */}
      <div className="bg-[#0c0f16] border border-white/10 rounded-2xl p-5 shadow-sm flex flex-col gap-4 select-none">
        <h3 className="font-mono text-slate-100 text-xs font-bold tracking-wider uppercase flex items-center gap-2">
          <Cpu className="text-emerald-400" size={18} /> 4. Ultra-Low Latency Media Formats
        </h3>

        <div className="flex flex-col gap-3">
          <p className="text-slate-400 font-sans leading-relaxed">
            To achieve a visual throughput latency under 100 milliseconds, every parameter inside MediaCodec is fine-tuned to bypass internal queuing queues.
          </p>

          <ul className="flex flex-col gap-2 font-mono text-[10px] text-slate-400">
            <li className="bg-[#050608] p-2.5 rounded-xl border border-white/5">
              <strong className="text-emerald-400 block mb-0.5 uppercase tracking-wide text-[9px]">Constant Bitrate Mode (CBR)</strong>
              Ensures stable packet size transmission and prevents video spikes over local airwaves.
            </li>
            <li className="bg-[#050608] p-2.5 rounded-xl border border-white/5">
              <strong className="text-emerald-400 block mb-0.5 uppercase tracking-wide text-[9px]">Zero Queuing (KEY_LATENCY = 0)</strong>
              Signals to physical hardware encoders that raw pixels must be compressed and emitted instantly without buffer frames.
            </li>
            <li className="bg-[#050608] p-2.5 rounded-xl border border-white/5">
              <strong className="text-emerald-400 block mb-0.5 uppercase tracking-wide text-[9px]">High Frequency I-Frames (Interval = 1s)</strong>
              Minimizes buffering delays. Web browsers receive keyframe sync segments in sub-second divisions, allowing for immediate stream join states.
            </li>
            <li className="bg-[#050608] p-2.5 rounded-xl border border-white/5">
              <strong className="text-emerald-400 block mb-0.5 uppercase tracking-wide text-[9px]">WebCodecs over MSE</strong>
              Modern HTML5 WebCodecs handles raw H.264 stream directly. Unlike standard Media Source Extensions (MSE) which buffer 1–3s of movie fragments, WebCodecs decodes each packet on GPU instantaneously.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
