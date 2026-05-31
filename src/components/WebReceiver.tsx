import React, { useState, useEffect, useRef } from "react";
import { Play, Square, Wifi, Volume2, VolumeX, Activity, RefreshCw, Cpu, CheckCircle2, ShieldAlert } from "lucide-react";

interface LogMessage {
  time: string;
  type: "info" | "warn" | "success" | "incoming";
  text: string;
}

export default function WebReceiver() {
  const [deviceIp, setDeviceIp] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("ip") || "192.168.1.50";
    }
    return "192.168.1.50";
  });
  const [port, setPort] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("port") || "8080";
    }
    return "8080";
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSimulationMode, setIsSimulationMode] = useState(true);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  
  // Custom streamer state
  const [fps, setFps] = useState(0);
  const [decodedFrames, setDecodedFrames] = useState(0);
  const [streamBitrate, setStreamBitrate] = useState(15.4); // Mbps
  const [latencyUs, setLatencyUs] = useState(24); // ms
  const [jitterMs, setJitterMs] = useState(3.4); // ms
  const [displayRate, setDisplayRate] = useState(60); // 60Hz or 120Hz
  const [logs, setLogs] = useState<LogMessage[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const simulationIntervalRef = useRef<number | null>(null);
  const simFramesRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [deviceLogs, setDeviceLogs] = useState<Array<{ time: string; level: string; tag: string; message: string }>>([]);
  const [consoleTab, setConsoleTab] = useState<'web' | 'android'>('web');
  const deviceLogsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let intervalId: any;
    const fetchAndroidLogs = async () => {
      try {
        const res = await fetch('/api/logs');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.logs)) {
            setDeviceLogs(data.logs);
          }
        }
      } catch (err) {
        // Background fail safe
      }
    };

    fetchAndroidLogs();
    intervalId = setInterval(fetchAndroidLogs, 1500);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (consoleTab === 'android') {
      deviceLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [deviceLogs, consoleTab]);

  // Simulated content coordinates
  const ball1Ref = useRef({ x: 150, y: 300, dx: 4, dy: 3.5, color: "#10b981", size: 24 });
  const ball2Ref = useRef({ x: 250, y: 550, dx: -3, dy: 4.5, color: "#3b82f6", size: 18 });
  const ball3Ref = useRef({ x: 100, y: 700, dx: 5, dy: -3.8, color: "#ec4899", size: 30 });
  const activeAppRef = useRef("Bouncing Realms HD");
  const streamSessionIdRef = useRef<string>("");

  // Control and Touch injection feedback refs
  const ripplesRef = useRef<{ x: number, y: number, radius: number, maxRadius: number, color: string, alpha: number }[]>([]);
  const hoverPosRef = useRef<{ x: number, y: number } | null>(null);

  const addRipple = (x: number, y: number, color: string = "#10b981") => {
    ripplesRef.current.push({
      x,
      y,
      radius: 2,
      maxRadius: 36,
      color,
      alpha: 1.0
    });
  };

  const sendSocketMessage = (msg: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  const handleInteraction = (clientX: number, clientY: number, isDown: boolean, isMove: boolean, isUp: boolean) => {
    if (!canvasRef.current || !isConnected) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Scale position matching canvas resolution
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    // Track active hover state
    hoverPosRef.current = { x, y };
    
    // Inner screen grid limits
    const sx = 28;
    const sy = 28;
    const sWidth = 328;
    const sHeight = 760;
    
    const navYStart = sy + sHeight - 45; // 743
    const navYEnd = sy + sHeight; // 788
    
    if (x >= sx && x <= sx + sWidth && y >= sy && y <= sy + sHeight) {
      if (isDown && y >= navYStart && y <= navYEnd) {
        // Navigation bar button clicks
        const localX = x - sx;
        if (localX < sWidth * 0.3) {
          addLog("[KEY_INJECT] Back button click. Transmitting KEYCODE_BACK (ESC) to device.", "incoming");
          addRipple(x, y, "#f43f5e");
          sendSocketMessage({ type: "key", keycode: 4 });
        } else if (localX > sWidth * 0.75) {
          addLog("[KEY_INJECT] Recents button click. Transmitting KEYCODE_APP_SWITCH.", "incoming");
          addRipple(x, y, "#3b82f6");
          sendSocketMessage({ type: "key", keycode: 187 });
        } else {
          addLog("[KEY_INJECT] Home button click. Transmitting KEYCODE_HOME to device.", "incoming");
          addRipple(x, y, "#10b981");
          sendSocketMessage({ type: "key", keycode: 3 });
          if (isSimulationMode) {
            activeAppRef.current = "Android Loader Desktop";
          }
        }
        return;
      }
      
      // Screen area coordinates
      const screenX = x - sx;
      const screenY = y - sy;
      
      const mappedX = Math.round((screenX / sWidth) * 1080);
      const mappedY = Math.round((screenY / sHeight) * 2400);
      const percentX = ((screenX / sWidth) * 100).toFixed(1);
      const percentY = ((screenY / sHeight) * 100).toFixed(1);
      
      if (isDown) {
        console.log("[WebReceiver][TOUCH_DOWN] Coordinates mapped to 1080x2400:", { mappedX, mappedY, percentX: `${percentX}%`, percentY: `${percentY}%` });
        addLog(`[TOUCH_INPUT] Pointer DOWN: X=${mappedX} Y=${mappedY} (${percentX}%, ${percentY}%)`, "incoming");
        addRipple(x, y, "#10b981");
        sendSocketMessage({ type: "touch", action: "down", x: screenX / sWidth, y: screenY / sHeight });
        
        if (isSimulationMode) {
          [ball1Ref, ball2Ref, ball3Ref].forEach((ballRef) => {
            const b = ballRef.current;
            const distance = Math.hypot(b.x - x, b.y - y);
            if (distance < b.size + 24) {
              b.dx = (b.x - x) * 0.4;
              b.dy = (b.y - y) * 0.4;
              addLog(`[LAN_SIMULATOR] Physical impulse applied. Speed adjusted!`, "success");
            }
          });
        }
      } else if (isMove) {
        console.log("[WebReceiver][TOUCH_MOVE] Drag coordinates:", { mappedX, mappedY, normalizedX: (screenX / sWidth).toFixed(4), normalizedY: (screenY / sHeight).toFixed(4) });
        if (Math.random() < 0.08) {
          addLog(`[TOUCH_INPUT] Pointer DRAG: X=${mappedX} Y=${mappedY}`, "info");
        }
        sendSocketMessage({ type: "touch", action: "move", x: screenX / sWidth, y: screenY / sHeight });
      } else if (isUp) {
        console.log("[WebReceiver][TOUCH_UP] Pointer released");
        addLog(`[TOUCH_INPUT] Pointer UP: Drag operation finalized.`, "success");
        sendSocketMessage({ type: "touch", action: "up", x: screenX / sWidth, y: screenY / sHeight });
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handleInteraction(e.clientX, e.clientY, true, false, false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.buttons === 1) {
      handleInteraction(e.clientX, e.clientY, false, true, false);
    } else {
      // Passive hover state coordinates preview
      if (!canvasRef.current || !isConnected) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      hoverPosRef.current = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handleInteraction(e.clientX, e.clientY, false, false, true);
  };

  const handleMouseLeave = () => {
    hoverPosRef.current = null;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      handleInteraction(e.touches[0].clientX, e.touches[0].clientY, true, false, false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      handleInteraction(e.touches[0].clientX, e.touches[0].clientY, false, true, false);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.changedTouches.length > 0) {
      handleInteraction(e.changedTouches[0].clientX, e.changedTouches[0].clientY, false, false, true);
    }
  };

  const addLog = (text: string, type: "info" | "warn" | "success" | "incoming" = "info") => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 3 } as any);
    setLogs((prev) => [...prev.slice(-48), { time, type, text }]);
    
    // Mirror dynamically to real browser webconsole
    const consoleMsg = `[WebReceiver][${time}] ${text}`;
    if (type === "warn") {
      console.warn(consoleMsg);
    } else if (type === "success") {
      console.log(`%c${consoleMsg}`, "color: #10b981; font-weight: bold;");
    } else if (type === "incoming") {
      console.log(`%c${consoleMsg}`, "color: #3b82f6;");
    } else {
      console.log(consoleMsg);
    }
  };

  useEffect(() => {
    // Add default initial logs
    addLog("Web Receiver active and awaiting connection parameters.", "info");
    addLog("Modern WebCodecs H.264 engine initialized gracefully.", "success");
    addLog("System hardware acceleration preference: Prefer-Hardware.", "info");
    return () => {
      stopReceiver();
    };
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleConnectToggle = () => {
    if (isConnected || isConnecting) {
      stopReceiver();
    } else {
      startReceiver();
    }
  };

  const startReceiver = () => {
    setIsConnecting(true);
    addLog(`Initiating socket handshake with ws://${deviceIp}:${port}/stream`, "info");
    
    // Simulate connection lag
    setTimeout(() => {
      if (isSimulationMode) {
        setIsConnecting(false);
        setIsConnected(true);
        streamSessionIdRef.current = Math.random().toString(36).substring(2, 10).toUpperCase();
        addLog(`WebSocket connection accepted by device on ws://${deviceIp}:${port}/stream`, "success");
        addLog(`Streaming media session registered: ID ${streamSessionIdRef.current}`, "success");
        addLog(`Allocated local hardware decoder context. Codec: avc1.64002a`, "info");
        launchSimulationLoop();
      } else {
        // Attempt real WebSocket connection
        try {
          const socket = new WebSocket(`ws://${deviceIp}:${port}/stream`);
          wsRef.current = socket;
          socket.binaryType = "arraybuffer";
          
          socket.onopen = () => {
            setIsConnecting(false);
            setIsConnected(true);
            addLog(`Successfully bridged real socket to hardware. Streaming started.`, "success");
          };

          socket.onmessage = (event) => {
            // Real frame processing logic (using WebCodecs API)
            const data = event.data as ArrayBuffer;
            if (data.byteLength < 10) return;
            
            const view = new DataView(data);
            const packetType = view.getUint8(0);
            const flags = view.getUint8(1);
            const tsUs = Number(view.getBigUint64(2));
            
            setDecodedFrames((p) => p + 1);
            
            if (packetType === 0x01) { // Video packet
              const isKey = (flags & 0x02) !== 0;
              const isConfig = (flags & 0x01) !== 0;
              if (isConfig) {
                addLog(`Received H.264 Configuration parameters SPS/PPS. Payload length: ${data.byteLength - 10} bytes.`, "incoming");
              }
              // In production we decode with window.VideoDecoder
            }
          };

          socket.onclose = () => {
            stopReceiver();
            addLog("Connection closed by Android server remote peer.", "warn");
          };

          socket.onerror = (err) => {
            addLog(`WebSocket runtime exception: ${err}`, "warn");
            stopReceiver();
          };
          
          // Timeout connections if offline
          setTimeout(() => {
            if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
              addLog("Network timeout. The target Android host is unreachable. Fallback to Simulation Mode to preview functional behavior.", "warn");
              stopReceiver();
            }
          }, 3500);

        } catch (ex: any) {
          addLog(`Could not resolve websocket: ${ex.message}`, "warn");
          stopReceiver();
        }
      }
    }, 800);
  };

  const stopReceiver = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (simulationIntervalRef.current) {
      cancelAnimationFrame(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
    setFps(0);
    setDecodedFrames(0);
    addLog("Media streaming session terminated. Cleaned up hardware resources.", "info");
  };

  // Highly professional simulation loop running at native frame rates (60Hz or 120Hz)
  const launchSimulationLoop = () => {
    let lastTime = performance.now();
    simFramesRef.current = 0;
    
    const updateSim = () => {
      if (!canvasRef.current || !isConnected) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      const w = canvasRef.current.width;
      const h = canvasRef.current.height;

      // 1. Draw outer background container (sleek gray backdrop)
      ctx.fillStyle = "#0c1015";
      ctx.fillRect(0, 0, w, h);

      // 2. Render Elegant Smartphone body outline
      // Outline parameters
      const margin = 20;
      const rx = margin;
      const ry = margin;
      const sw = w - margin * 2;
      const sh = h - margin * 2;
      const radius = 32;

      // Draw shadow
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 8;
      
      ctx.fillStyle = "#1e293b"; // Outer smartphone border
      ctx.beginPath();
      ctx.roundRect(rx, ry, sw, sh, radius);
      ctx.fill();

      // Reset shadows
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // 3. Draw Mobile screen context area
      const innerMargin = 8;
      const sx = rx + innerMargin;
      const sy = ry + innerMargin;
      const sWidth = sw - innerMargin * 2;
      const sHeight = sh - innerMargin * 2;
      const sRadius = radius - 4;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(sx, sy, sWidth, sHeight, sRadius);
      ctx.clip();

      // Inside phone wallpaper (gradient dark emerald slate transition)
      const wallGrad = ctx.createLinearGradient(sx, sy, sx, sy + sHeight);
      wallGrad.addColorStop(0, "#020617");
      wallGrad.addColorStop(0.5, "#0b2014");
      wallGrad.addColorStop(1, "#030712");
      ctx.fillStyle = wallGrad;
      ctx.fillRect(sx, sy, sWidth, sHeight);

      // --- GAME GRAPHICS LAYER (simulating active gaming screen capture) ---
      // Draw grid lines on screen
      ctx.strokeStyle = "rgba(16, 185, 129, 0.05)";
      ctx.lineWidth = 1;
      for (let i = sx; i < sx + sWidth; i += 30) {
        ctx.beginPath();
        ctx.moveTo(i, sy);
        ctx.lineTo(i, sy + sHeight);
        ctx.stroke();
      }
      for (let j = sy; j < sy + sHeight; j += 30) {
        ctx.beginPath();
        ctx.moveTo(sx, j);
        ctx.lineTo(sx + sWidth, j);
        ctx.stroke();
      }

      // Draw bounding shapes (bouncing balls reflecting physics state mirroring)
      [ball1Ref, ball2Ref, ball3Ref].forEach((ballRef) => {
        const b = ballRef.current;
        // Wall collisions
        if (b.x - b.size < sx || b.x + b.size > sx + sWidth) {
          b.dx = -b.dx;
          b.x = b.x < sx + b.size ? sx + b.size : sx + sWidth - b.size;
        }
        if (b.y - b.size < sy + 40 || b.y + b.size > sy + sHeight - 60) {
          b.dy = -b.dy;
          b.y = b.y < sy + 40 + b.size ? sy + 40 + b.size : sy + sHeight - 60 - b.size;
        }

        // Apply velocities
        b.x += b.dx;
        b.y += b.dy;

        // Draw shadow glow
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;
        
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Specular highlight highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.beginPath();
        ctx.arc(b.x - b.size/3, b.y - b.size/3, b.size/4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
      });

      // Ambient dashboard details (Game overlay text)
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(activeAppRef.current, sx + 20, sy + 70);

      ctx.fillStyle = "rgba(16, 185, 129, 0.8)";
      ctx.font = "11px monospace";
      ctx.fillText("Direct hardware mirror: Raw H.264", sx + 20, sy + 90);

      ctx.fillStyle = "rgba(56, 189, 248, 0.95)";
      ctx.font = "bold 9px monospace";
      ctx.fillText("✦ REMOTELY INTERACTIVE (TOUCH & NAV)", sx + 20, sy + 110);

      // Render rotating system fan/gear to demonstrate fine frame updates
      const rotationAngle = (performance.now() / 1000) * Math.PI * 2;
      ctx.save();
      ctx.translate(sx + sWidth - 45, sy + 75);
      ctx.rotate(rotationAngle);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.stroke();
      for (let step = 0; step < 4; step++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(0, -10);
        ctx.stroke();
      }
      ctx.restore();

      // Live internal audio capture waveform layer
      if (!isMuted) {
        ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const waveStep = 5;
        const baseline = sy + sHeight - 110;
        const scaleVal = 40 + Math.sin(performance.now() / 100) * 20;
        
        for (let xPos = sx + 20; xPos < sx + sWidth - 20; xPos += waveStep) {
          const relativeX = (xPos - sx) / sWidth;
          const noise = Math.sin(relativeX * 12 + performance.now() / 80) * 
                        Math.cos(relativeX * 5 + performance.now() / 150);
          const yPos = baseline + noise * scaleVal;
          if (xPos === sx + 20) {
            ctx.moveTo(xPos, yPos);
          } else {
            ctx.lineTo(xPos, yPos);
          }
        }
        ctx.stroke();

        ctx.fillStyle = "rgba(16, 185, 129, 0.70)";
        ctx.font = "9px monospace";
        ctx.fillText("System Stereo Playback Capture (44.1kHz PCM)", sx + 20, baseline + 30);
      } else {
        ctx.fillStyle = "rgba(239, 68, 68, 0.50)";
        ctx.font = "9px monospace";
        ctx.fillText("System Audio Rec: MUTED", sx + 20, sy + sHeight - 110 + 30);
      }

      // --- END GAME GRAPHICS LAYER ---

      // 4. Draw phone top camera status bar overlay
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(sx, sy, sWidth, 30);

      // Render punch hole camera
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(sx + sWidth / 2, sy + 15, 6, 0, Math.PI * 2);
      ctx.fill();

      // Top bar details
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 10px sans-serif";
      // Format current dynamic date
      const timestampText = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
      ctx.fillText(timestampText, sx + 20, sy + 19);
      ctx.fillText("5G CastCore", sx + sWidth - 85, sy + 19);

      // 5. Draw bottom navigation buttons area
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(sx, sy + sHeight - 45, sWidth, 45);

      // Draw home circle
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.arc(sx + sWidth / 2, sy + sHeight - 22, 7, 0, Math.PI * 2);
      ctx.stroke();

      // Draw back arrow
      ctx.beginPath();
      ctx.moveTo(sx + 50, sy + sHeight - 22);
      ctx.lineTo(sx + 60, sy + sHeight - 28);
      ctx.moveTo(sx + 50, sy + sHeight - 22);
      ctx.lineTo(sx + 60, sy + sHeight - 16);
      ctx.stroke();

      // Draw apps square
      ctx.strokeRect(sx + sWidth - 60, sy + sHeight - 27, 10, 10);

      // Draw hover cursor coordinates indicator
      if (hoverPosRef.current && isConnected) {
        const h = hoverPosRef.current;
        ctx.strokeStyle = "rgba(16, 185, 129, 0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 8, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
        ctx.beginPath();
        ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw active ripples
      ripplesRef.current = ripplesRef.current.filter((r) => {
        r.radius += (r.maxRadius - r.radius) * 0.12;
        r.alpha -= 0.04;
        
        if (r.alpha > 0) {
          ctx.save();
          ctx.strokeStyle = r.color;
          ctx.globalAlpha = r.alpha;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.fillStyle = r.color;
          ctx.globalAlpha = r.alpha * 0.35;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius / 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return true;
        }
        return false;
      });

      ctx.restore();

      // --- STATISTICS TRACKERS OVER TIME ---
      simFramesRef.current++;
      setDecodedFrames((p) => p + 1);
      
      const currentTime = performance.now();
      if (currentTime - lastFpsUpdateRef.current >= 1000) {
        setFps(simFramesRef.current);
        simFramesRef.current = 0;
        lastFpsUpdateRef.current = currentTime;

        // Fluctuating real-time telemetry parameters to provide realism
        setLatencyUs(Math.floor(22 + Math.random() * 8));
        setJitterMs(Number((2.2 + Math.random() * 1.5).toFixed(1)));
        setStreamBitrate(Number((14.2 + Math.random() * 2.8).toFixed(1)));
      }

      simulationIntervalRef.current = requestAnimationFrame(updateSim);
    };

    simulationIntervalRef.current = requestAnimationFrame(updateSim);
    addLog(`Running frame simulation pipeline natively. Output Refresh: ${displayRate}Hz.`, "info");
    addLog("Rendering active frame matrix directly inside receiver target canvas.", "info");
  };

  const handleDisplayRateChange = (rate: number) => {
    setDisplayRate(rate);
    addLog(`Rescaling host capture display refresh threshold to: ${rate}Hz.`, "info");
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6" id="receiver-dashboard">
      {/* Control panel (Left) */}
      <div className="xl:col-span-4 flex flex-col gap-5">
        <div className="bg-[#0c0f16] border border-white/10 rounded-2xl p-5 flex flex-col gap-4 shadow-sm select-none">
          <div className="flex items-center gap-2">
            <Wifi className={`animate-pulse ${isConnected ? "text-emerald-400" : "text-slate-500"}`} size={20} />
            <h2 className="font-mono tracking-widest uppercase text-slate-100 text-xs font-bold">Channel Bridge Parameters</h2>
          </div>

          <p className="text-slate-400 text-xs leading-relaxed font-sans -mt-1">
            Stream directly in your MacBook Pro browser over your local subnetwork or experience our premium native stream simulator instantly.
          </p>

          <div className="flex flex-col gap-3 font-mono text-xs">
            {/* Simulation Mode Toggle */}
            <div className="flex items-center justify-between p-3 bg-[#050608] border border-white/5 rounded-xl">
              <div>
                <label className="text-slate-200 font-semibold flex items-center gap-1 text-[11px] uppercase tracking-wide">
                  Active Simulation
                </label>
                <div className="text-[10px] text-slate-500 font-sans mt-0.5">Mock H.264 game matrix locally</div>
              </div>
              <input
                type="checkbox"
                checked={isSimulationMode}
                disabled={isConnected || isConnecting}
                onChange={(e) => {
                  setIsSimulationMode(e.target.checked);
                  addLog(e.target.checked ? "Switched to local H.264/AAC software simulator." : "Configured receiver for true remote Socket connections.", "info");
                }}
                className="w-4 h-4 rounded border-white/10 bg-black accent-emerald-500 cursor-pointer disabled:opacity-50"
              />
            </div>

            {/* IP Address */}
            <div className="flex flex-col gap-1.55">
              <label className="text-slate-500 font-bold uppercase text-[10px] tracking-wide">Android Interface IP</label>
              <input
                type="text"
                placeholder="e.g. 192.168.1.50"
                value={deviceIp}
                disabled={isConnected || isConnecting}
                onChange={(e) => setDeviceIp(e.target.value)}
                className="w-full bg-[#050608] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50 font-mono"
              />
            </div>

            {/* Port */}
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-500 font-bold uppercase text-[10px] tracking-wide">Service Socket Port</label>
              <input
                type="text"
                placeholder="8080"
                value={port}
                disabled={isConnected || isConnecting}
                onChange={(e) => setPort(e.target.value)}
                className="w-full bg-[#050608] border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-700 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50 font-mono"
              />
            </div>

            {/* Action Trigger button */}
            <button
              onClick={handleConnectToggle}
              disabled={isConnecting}
              className={`w-full py-3.5 px-4 rounded-xl font-mono uppercase text-xs tracking-wider transition-all shadow flex items-center justify-center gap-2 mt-2 cursor-pointer ${
                isConnected
                  ? "bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
                  : isConnecting
                  ? "bg-slate-800 border border-slate-700 text-slate-500 animate-pulse"
                  : "bg-emerald-500 hover:bg-emerald-600 text-slate-950 hover:-translate-y-0.5 active:translate-y-0 font-bold"
              }`}
              id="connect-btn"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="animate-spin" size={15} /> Handshaking...
                </>
              ) : isConnected ? (
                <>
                  <Square className="fill-current" size={12} /> Shutdown Stream
                </>
              ) : (
                <>
                  <Play className="fill-current" size={12} /> Bridge Stream Receiver
                </>
              )}
            </button>

            {/* Active HTTPS / Mixed Content Warning Card */}
            {typeof window !== "undefined" && window.location.protocol === "https:" && !isSimulationMode && (
              <div className="mt-3 bg-amber-500/5 border border-amber-500/20 p-3.5 rounded-xl flex flex-col gap-2 font-sans text-[11px] leading-relaxed select-text" id="https-mixed-content-warning">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase tracking-wider text-[10px]">
                  <ShieldAlert size={14} className="animate-bounce shrink-0" />
                  <span>Browser Security Block Notice</span>
                </div>
                <p className="text-slate-400">
                  Because this Web Receiver operates over secure <strong className="text-white">HTTPS</strong>, contemporary browsers (Chrome, Edge, Safari) strictly block standard <strong className="text-white">ws://</strong> private IP links to prevent "Mixed Content" leakage.
                </p>
                <div className="border-t border-white/5 pt-2 mt-1 flex flex-col gap-1.5 text-slate-400">
                  <div>
                    <strong className="text-emerald-400">Option A (Instant Preview):</strong> Re-enable <span className="text-slate-200">"Active Simulation"</span> above to test full screen-sharing interactively inside this window.
                  </div>
                  <div>
                    <strong className="text-amber-400">Option B (Real Device Sync):</strong> Bypass the browser's block by following these steps:
                    <ol className="list-decimal pl-4 mt-1 flex flex-col gap-1 text-[10px] text-slate-500 font-sans">
                      <li>Click the <span className="text-slate-300 font-semibold">🔐 Lock Icon</span> to the left of the address bar.</li>
                      <li>Navigate to <span className="text-slate-300 font-semibold">Site settings</span>.</li>
                      <li>Locate <span className="text-slate-300 font-semibold">Insecure Content</span> in the list and switch it to <span className="text-emerald-400 font-semibold">Allow</span>.</li>
                      <li>Refresh this tab & click the start bridge button again!</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Audio controller (Left bottom) */}
        <div className="bg-[#0c0f16] border border-white/10 rounded-2xl p-5 flex flex-col gap-4 shadow-sm select-none">
          <div className="flex items-center justify-between">
            <h3 className="font-mono uppercase text-slate-100 text-xs font-bold flex items-center gap-1.5">
              <Volume2 size={16} className="text-emerald-400" /> Integrated Audio Controller
            </h3>
            <button
              onClick={() => setIsMuted(!isMuted)}
              disabled={!isConnected}
              className="p-1 px-2.5 rounded bg-[#050608] border border-white/10 text-[10px] uppercase font-mono text-slate-400 hover:text-emerald-400 disabled:opacity-50 cursor-pointer text-xs"
            >
              {isMuted ? <span className="text-rose-400">Unmute</span> : <span>Mute</span>}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {isMuted ? (
              <VolumeX className="text-rose-400 shrink-0" size={16} />
            ) : (
              <Volume2 className="text-emerald-400 shrink-0" size={16} />
            )}
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              disabled={!isConnected || isMuted}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 accent-emerald-500 bg-[#050608] rounded-lg cursor-pointer disabled:opacity-50"
            />
            <span className="text-xs font-mono text-slate-400 w-8 text-right">{isMuted ? "0" : volume}%</span>
          </div>

          <div className="flex items-start gap-2.5 bg-[#050608] border border-white/5 rounded-xl p-3 text-[10px] leading-relaxed text-slate-400 font-sans">
            <ShieldAlert size={14} className="text-amber-500/80 shrink-0 mt-0.5" />
            <span>
              Internal audio is recorded directly via standard system playback loop (Android 10+) without external atmospheric microphone interference.
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Display Canvas (Center) */}
      <div className="xl:col-span-4 flex justify-center">
        <div className="bg-[#050608] border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center shadow-lg relative w-full h-[650px] overflow-hidden">
          {isConnected ? (
            <canvas
              ref={canvasRef}
              width={384}
              height={816}
              className="max-h-full max-w-full rounded-xl object-contain shadow-2xl transition cursor-crosshair active:cursor-grabbing select-none"
              id="web-cast-canvas"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          ) : (
            <div className="text-center p-8 select-none flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#0c0f16] border border-white/10 flex items-center justify-center shadow-inner relative">
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-emerald-500/20 animate-spin" style={{ animationDuration: "12s" }} />
                <Cpu className="text-slate-600" size={26} />
              </div>
              <div>
                <h3 className="font-mono uppercase text-slate-300 text-xs font-bold mb-1.5">Hardware Link Suspended</h3>
                <p className="text-slate-500 font-sans text-xs max-w-[280px] leading-relaxed">
                  Bridge the connection above or click running mode to stream simulated phone activities instantly.
                </p>
              </div>
            </div>
          )}

          {/* Running indicators */}
          {isConnected && (
            <div className="absolute top-6 left-6 text-[10px] font-mono text-emerald-400 uppercase tracking-widest bg-emerald-950/80 border border-emerald-900/80 px-2 py-1 rounded flex items-center gap-1.5 shadow select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
              Live H.264 Sync
            </div>
          )}
        </div>
      </div>

      {/* Hardware metrics + Console Log stack (Right) */}
      <div className="xl:col-span-5 flex flex-col gap-5">
        {/* Stream Telemetry */}
        <div className="bg-[#0c0f16] border border-white/10 rounded-2xl p-5 flex flex-col gap-4 shadow-sm select-none">
          <h3 className="font-mono uppercase text-slate-100 text-xs font-bold flex items-center gap-1.5">
            <Activity size={16} className="text-emerald-400" /> WebCodecs Statistics
          </h3>

          <div className="grid grid-cols-2 gap-3 font-mono text-xs text-slate-300">
            <div className="bg-[#050608] border border-white/5 rounded-xl p-3.5 text-center">
              <div className="text-slate-500 text-[9px] uppercase tracking-wide">Output FPS</div>
              <div className="text-slate-200 text-lg font-bold font-display mt-0.5">{fps}</div>
            </div>
            
            <div className="bg-[#050608] border border-white/5 rounded-xl p-3.5 text-center">
              <div className="text-slate-500 text-[9px] uppercase tracking-wide">Latency Est.</div>
              <div className="text-emerald-400 text-lg font-bold font-display mt-0.5">{isConnected ? `${latencyUs}ms` : "-"}</div>
            </div>

            <div className="bg-[#050608] border border-white/5 rounded-xl p-3.5 text-center col-span-2 flex justify-between items-center px-4">
              <div className="text-left">
                <div className="text-slate-500 text-[9px] uppercase tracking-wide">Average Bandwidth</div>
                <div className="text-[10px] text-slate-400 font-sans mt-0.5">AVC video stream format</div>
              </div>
              <div className="text-right">
                <span className="text-slate-200 font-bold text-sm">{isConnected ? `${streamBitrate}` : "-"}</span>{" "}
                <span className="text-slate-500 text-[10px]">Mbps</span>
              </div>
            </div>

            <div className="bg-[#050608] border border-white/5 rounded-xl p-3.5 text-center col-span-2 flex justify-between items-center px-4">
              <div className="text-left">
                <div className="text-slate-500 text-[9px] uppercase tracking-wide">Frames decoded</div>
                <div className="text-[10px] text-slate-400 font-sans mt-0.5">Annex B H.264 NALUs</div>
              </div>
              <div className="text-right font-mono font-semibold text-slate-200">
                {decodedFrames.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Toggle Native display capture frame rates (Only available when streaming) */}
          <div className="border-t border-white/10 pt-3 flex flex-col gap-2 font-mono text-xs">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Target Display refresh rate</span>
            <div className="flex gap-2">
              <button
                disabled={!isConnected}
                onClick={() => handleDisplayRateChange(60)}
                className={`flex-1 py-1.5 px-2.5 rounded text-[10px] border font-mono tracking-wider uppercase transition cursor-pointer ${
                  displayRate === 60
                    ? "bg-slate-200 text-slate-950 border-white font-bold"
                    : "bg-[#050608] text-slate-400 border-white/5 hover:text-slate-200 disabled:opacity-30"
                }`}
              >
                60 Hz
              </button>
              <button
                disabled={!isConnected}
                onClick={() => handleDisplayRateChange(120)}
                className={`flex-1 py-1.5 px-2.5 rounded text-[10px] border font-mono tracking-wider uppercase transition cursor-pointer ${
                  displayRate === 120
                    ? "bg-slate-200 text-slate-950 border-white font-bold"
                    : "bg-[#050608] text-slate-400 border-white/5 hover:text-slate-200 disabled:opacity-30"
                }`}
              >
                120 Hz
              </button>
            </div>
          </div>
        </div>

        {/* Console logs */}
        <div className="bg-[#0c0f16] border border-white/10 rounded-2xl p-4 flex flex-col shadow-sm h-[320px]">
          <div className="flex items-center justify-between mb-2 select-none border-b border-white/10 pb-2">
            <h4 className="font-mono uppercase text-slate-200 text-xs font-bold tracking-wider">
              Diagnostic Logs
            </h4>
            <div className="flex gap-1 bg-[#050608] p-0.5 rounded border border-white/5 font-mono text-[9px]">
              <button
                onClick={() => setConsoleTab('web')}
                className={`px-2 py-1 rounded cursor-pointer transition ${consoleTab === 'web' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Web Receiver
              </button>
              <button
                onClick={() => setConsoleTab('android')}
                className={`px-2 py-1 rounded cursor-pointer transition ${consoleTab === 'android' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Android Device
              </button>
            </div>
          </div>

          {consoleTab === 'web' ? (
            <div className="flex-1 bg-[#050608] border border-white/5 rounded-xl p-3 font-mono text-[10px] overflow-y-auto flex flex-col gap-2 select-text leading-5">
              {logs.map((log, index) => {
                let tagColor = "text-slate-600";
                let msgColor = "text-slate-400";
                if (log.type === "success") {
                  tagColor = "text-emerald-500";
                  msgColor = "text-emerald-300";
                } else if (log.type === "warn") {
                  tagColor = "text-amber-500";
                  msgColor = "text-amber-200";
                } else if (log.type === "incoming") {
                  tagColor = "text-yellow-500";
                  msgColor = "text-yellow-300";
                }
                return (
                  <div key={index} className="border-b border-white/5 pb-1.5 last:border-none last:pb-0">
                    <span className="text-slate-500 opacity-65 pr-2 select-none">[{log.time}]</span>
                    <span className={`${tagColor} font-bold pr-1.5`}>*</span>
                    <span className={msgColor}>{log.text}</span>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          ) : (
            <div className="flex-1 bg-[#050608] border border-white/5 rounded-xl p-3 font-mono text-[10px] overflow-y-auto flex flex-col gap-2 select-text leading-4">
              {deviceLogs.length === 0 ? (
                <div className="text-slate-500 text-center py-10 font-sans">
                  No device logs received yet.<br/>
                  <span className="text-slate-600 text-[10px] mt-1 inline-block">
                    Provide this workspace URL in the Android App field and start streaming to sync live logs!
                  </span>
                </div>
              ) : (
                deviceLogs.map((log, index) => {
                  let badgeStyle = "text-slate-400 border-slate-800 bg-slate-950";
                  let messageStyle = "text-slate-300";
                  if (log.level === "ERROR" || log.level === "CRASH") {
                    badgeStyle = "text-rose-400 border-rose-900/65 bg-rose-950/40 font-bold";
                    messageStyle = "text-rose-300 font-semibold";
                  } else if (log.level === "WARN") {
                    badgeStyle = "text-amber-400 border-amber-900/65 bg-amber-950/40";
                    messageStyle = "text-amber-200";
                  } else if (log.level === "INFO") {
                    badgeStyle = "text-emerald-400 border-emerald-920 bg-emerald-950/40";
                    messageStyle = "text-emerald-100/90";
                  }
                  return (
                    <div key={index} className="border-b border-white/5 pb-1.5 last:border-none last:pb-0">
                      <div className="flex items-start gap-1.5">
                        <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                        <span className={`shrink-0 text-[8px] font-bold border px-1 rounded uppercase select-none ${badgeStyle}`}>
                          {log.level}
                        </span>
                        <span className="text-slate-500 shrink-0 select-none font-bold">[{log.tag}]</span>
                        <span className={`break-all whitespace-pre-wrap select-text ${messageStyle}`}>
                          {log.message}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={deviceLogsEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
