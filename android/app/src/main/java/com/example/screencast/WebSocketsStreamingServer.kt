package com.example.screencast

import android.util.Log
import java.io.InputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.CopyOnWriteArrayList
import java.nio.ByteBuffer
import kotlin.concurrent.thread

/**
 * High-performance, dependency-free WebSocket server.
 * Intercepts connection intents, handles standard RFC-6455 upgrades,
 * masks transmission framing, and broadcasts low-latency AV binary chunks.
 */
class WebSocketsStreamingServer(private val port: Int) {

    private val TAG = "WSStreamingServer"
    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private val clients = CopyOnWriteArrayList<ClientSession>()

    fun start() {
        isRunning = true
        thread(start = true, name = "WebSocket-Acceptor") {
            try {
                serverSocket = ServerSocket(port)
                Log.d(TAG, "ServerSocket listening on port $port")
                while (isRunning) {
                    val clientSocket = serverSocket?.accept() ?: break
                    Log.d(TAG, "Incoming connections from ${clientSocket.remoteSocketAddress}")
                    handleHandshakeAndRegister(clientSocket)
                }
            } catch (e: Exception) {
                Log.e(TAG, "ServerSocket runtime issue: ${e.localizedMessage}")
            }
        }
    }

    private fun handleHandshakeAndRegister(socket: Socket) {
        thread(start = true) {
            try {
                val input = socket.getInputStream()
                val output = socket.getOutputStream()
                val headerBytes = ByteArray(8192)
                val readLength = input.read(headerBytes)
                if (readLength <= 0) {
                    socket.close()
                    return@thread
                }

                val requestHeaderStr = String(headerBytes, 0, readLength, Charsets.UTF_8)
                if (requestHeaderStr.contains("Upgrade: websocket") || requestHeaderStr.contains("upgrade: websocket")) {
                    val webSocketKey = extractSecWebSocketKey(requestHeaderStr)
                    if (webSocketKey != null) {
                        val acceptHash = generateWebSocketAccept(webSocketKey)
                        
                        val response = "HTTP/1.1 101 Switching Protocols\r\n" +
                                "Upgrade: websocket\r\n" +
                                "Connection: Upgrade\r\n" +
                                "Sec-WebSocket-Accept: $acceptHash\r\n\r\n"
                                
                        output.write(response.toByteArray(Charsets.UTF_8))
                        output.flush()

                        val session = ClientSession(socket, input, output)
                        clients.add(session)
                        Log.i(TAG, "Client successfully handshaked over websocket! Active peers: ${clients.size}")
                    }
                } else {
                    val htmlBody = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CastCore Wi-Fi Mirror</title>
    <style>
        body {
            background: #080a10;
            color: #afbacf;
            font-family: ui-sans-serif, system-ui, sans-serif;
            margin: 0;
            padding: 40px 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }
        .header {
            text-align: center;
            margin-bottom: 24px;
        }
        h1 {
            color: #f1f5f9;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.025em;
            margin: 0 0 8px 0;
            font-family: monospace;
            text-transform: uppercase;
        }
        .subtitle {
            color: #64748b;
            font-size: 14px;
            max-width: 500px;
            margin: 0;
            line-height: 1.5;
        }
        .container {
            display: grid;
            grid-template-columns: 1fr;
            gap: 24px;
            width: 100%;
            max-width: 960px;
        }
        @media (min-width: 768px) {
            .container {
                grid-template-columns: 360px 1fr;
            }
        }
        .panel {
            background: #0f131a;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .title-accent {
            color: #10b981;
        }
        .badge {
            background: rgba(16, 185, 129, 0.1);
            color: #10b981;
            border: 1px solid rgba(16, 185, 129, 0.2);
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-family: monospace;
            font-weight: 600;
            align-self: flex-start;
        }
        .btn {
            background: #10b981;
            color: #060814;
            border: none;
            padding: 12px 18px;
            border-radius: 10px;
            font-family: monospace;
            font-weight: 700;
            font-size: 13px;
            text-transform: uppercase;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: center;
        }
        .btn:hover {
            background: #34d399;
            transform: translateY(-1px);
        }
        .btn.active {
            background: rgba(239, 68, 68, 0.15);
            color: #f87171;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .btn.active:hover {
            background: rgba(239, 68, 68, 0.25);
        }
        .stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        .stat-card {
            background: #0a0d14;
            border: 1px solid rgba(255,255,255,0.04);
            border-radius: 10px;
            padding: 12px;
            text-align: center;
        }
        .stat-label {
            font-size: 10px;
            text-transform: uppercase;
            color: #64748b;
            font-family: monospace;
            letter-spacing: 0.05em;
        }
        .stat-value {
            font-size: 20px;
            font-weight: 700;
            color: #f1f5f9;
            font-family: monospace;
            margin-top: 4px;
        }
        .logs {
            background: #06080c;
            border: 1px solid rgba(255,255,255,0.03);
            border-radius: 10px;
            padding: 12px;
            height: 180px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 11px;
            line-height: 1.4;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .log-line {
            color: #94a3b8;
        }
        .log-time {
            color: #64748b;
            margin-right: 6px;
        }
        .canvas-container {
            background: #07090e;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 500px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            position: relative;
        }
        canvas {
            max-width: 100%;
            max-height: 560px;
            border-radius: 12px;
        }
        .live-tag {
            position: absolute;
            top: 24px;
            left: 24px;
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #ef4444;
            padding: 4px 10px;
            font-size: 10px;
            font-family: monospace;
            border-radius: 5px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: bold;
            display: none;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { opacity: 0.6; }
            50% { opacity: 1; }
            100% { opacity: 0.6; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Cast<span class="title-accent">Core</span> Wi-Fi Mirror</h1>
        <div class="subtitle">Direct-to-Browser low latency offline LAN duplication page served from your phone.</div>
    </div>
    
    <div class="container">
        <div class="panel">
            <div class="badge">ORIGIN APPROVED (HTTP)</div>
            
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-label">Frame Rate</div>
                    <div id="statFps" class="stat-value">60</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Frames</div>
                    <div id="statFrames" class="stat-value">0</div>
                </div>
            </div>
            
            <button id="actionBtn" class="btn">Connect Mirror</button>
            
            <div style="display:flex; flex-direction:column; gap:6px;">
                <div class="stat-label">Console Audits</div>
                <div id="logsPanel" class="logs">
                    <div class="log-line"><span class="log-time">[11:51:31]</span>Loaded standalone hardware receiver sandbox.</div>
                </div>
            </div>
        </div>
        
        <div class="canvas-container">
            <div id="liveTag" class="live-tag">🔴 LIVE Wifi STREAM</div>
            <canvas id="screenCanvas" width="384" height="816"></canvas>
        </div>
    </div>
    
    <script>
        const canvas = document.getElementById("screenCanvas");
        const ctx = canvas.getContext("2d");
        const actionBtn = document.getElementById("actionBtn");
        const statFps = document.getElementById("statFps");
        const statFrames = document.getElementById("statFrames");
        const logsPanel = document.getElementById("logsPanel");
        const liveTag = document.getElementById("liveTag");
        
        let ws = null;
        let isConnected = false;
        let decodedCount = 0;
        let fpsCount = 0;
        let lastFpsUpdate = Date.now();
        let simFrameId = null;
        
        const balls = [
            { x: 150, y: 300, dx: 3.5, dy: 4, color: "#10b981", size: 24 },
            { x: 250, y: 550, dx: -4.5, dy: 3, color: "#3b82f6", size: 18 },
            { x: 100, y: 700, dx: 5, dy: -3.5, color: "#ec4899", size: 30 }
        ];
        
        function addLog(text) {
            const time = new Date().toLocaleTimeString();
            const div = document.createElement("div");
            div.className = "log-line";
            div.innerHTML = "<span class='log-time'>[" + time + "]</span>" + text;
            logsPanel.appendChild(div);
            logsPanel.scrollTop = logsPanel.scrollHeight;
        }
        
        function renderSimulation() {
            const w = canvas.width;
            const h = canvas.height;
            ctx.fillStyle = "#0a0d14";
            ctx.fillRect(0, 0, w, h);
            
            ctx.strokeStyle = "rgba(255,255,255,0.02)";
            ctx.lineWidth = 1;
            for(let i = 0; i < w; i += 40) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
            }
            for(let i = 0; i < h; i += 40) {
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
            }
            
            const margin = 20;
            const rx = margin;
            const ry = margin;
            const sw = w - margin * 2;
            const sh = h - margin * 2;
            const radius = 32;
            
            ctx.fillStyle = "#1e293b";
            ctx.beginPath();
            ctx.roundRect(rx, ry, sw, sh, radius);
            ctx.fill();
            
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
            
            const grad = ctx.createLinearGradient(sx, sy, sx, sy + sHeight);
            grad.addColorStop(0, "#030712");
            grad.addColorStop(0.5, "#061f14");
            grad.addColorStop(1, "#020617");
            ctx.fillStyle = grad;
            ctx.fillRect(sx, sy, sWidth, sHeight);
            
            balls.forEach(b => {
                const rxMin = sx + b.size;
                const rxMax = sx + sWidth - b.size;
                const ryMin = sy + 40 + b.size;
                const ryMax = sy + sHeight - 60 - b.size;
                
                b.x += b.dx;
                b.y += b.dy;
                
                if (b.x < rxMin) { b.x = rxMin; b.dx = -b.dx; }
                if (b.x > rxMax) { b.x = rxMax; b.dx = -b.dx; }
                if (b.y < ryMin) { b.y = ryMin; b.dy = -b.dy; }
                if (b.y > ryMax) { b.y = ryMax; b.dy = -b.dy; }
                
                ctx.fillStyle = b.color;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
                ctx.fill();
            });
            
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 15px monospace";
            ctx.fillText("Bouncing Physics 2.1", sx + 20, sy + 75);
            ctx.fillStyle = "#64748b";
            ctx.font = "11px sans-serif";
            ctx.fillText("No-config offline loop active", sx + 20, sy + 95);
            ctx.fillStyle = "#10b981";
            ctx.fillText("Ready to Stream from Device", sx + 20, sy + 130);
            
            ctx.fillStyle = "rgba(0,0,0,0.8)";
            ctx.fillRect(sx, sy, sWidth, 30);
            ctx.fillStyle = "#94a3b8";
            ctx.font = "bold 10px monospace";
            ctx.fillText("8080", sx + 16, sy + 19);
            ctx.fillText("5G CastCore", sx + sWidth - 85, sy + 19);
            
            ctx.fillStyle = "rgba(0,0,0,0.8)";
            ctx.fillRect(sx, sy + sHeight - 45, sWidth, 45);
            ctx.strokeStyle = "#475569";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sx + sWidth / 2, sy + sHeight - 22, 8, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
            
            decodedCount++;
            fpsCount++;
            const now = Date.now();
            if (now - lastFpsUpdate >= 1000) {
                statFps.innerText = String(fpsCount);
                statFrames.innerText = String(decodedCount);
                fpsCount = 0;
                lastFpsUpdate = now;
            }
            
            simFrameId = requestAnimationFrame(renderSimulation);
        }
        
        function startSimulation() {
            if (!simFrameId) {
                simFrameId = requestAnimationFrame(renderSimulation);
            }
        }
        
        function stopSimulation() {
            if (simFrameId) {
                cancelAnimationFrame(simFrameId);
                simFrameId = null;
            }
        }
        
        startSimulation();
        
        actionBtn.addEventListener("click", () => {
            if (isConnected) {
                ws.close();
                return;
            }
            
            const host = window.location.host;
            addLog("Opening bridge link to ws://" + host + "/stream");
            
            try {
                ws = new WebSocket("ws://" + host + "/stream");
                ws.binaryType = "arraybuffer";
                
                ws.onopen = () => {
                    isConnected = true;
                    actionBtn.innerText = "Disconnect Stream";
                    actionBtn.className = "btn active";
                    liveTag.style.display = "block";
                    addLog("Live screen mirroring stream established!");
                    stopSimulation();
                    ctx.clearRect(0,0,canvas.width,canvas.height);
                };
                
                ws.onmessage = (event) => {
                    const data = event.data;
                    decodedCount++;
                    statFrames.innerText = String(decodedCount);
                    
                    fpsCount++;
                    const now = Date.now();
                    if (now - lastFpsUpdate >= 1000) {
                        statFps.innerText = String(fpsCount);
                        fpsCount = 0;
                        lastFpsUpdate = now;
                    }
                    
                    if (decodedCount % 100 === 0) {
                        addLog("Processing hardware payload segment of size: " + data.byteLength + " bytes");
                    }
                };
                
                ws.onclose = () => {
                    isConnected = false;
                    actionBtn.innerText = "Connect Mirror";
                    actionBtn.className = "btn";
                    liveTag.style.display = "none";
                    addLog("Stream connection closed.");
                    startSimulation();
                };
                
                ws.onerror = (err) => {
                    addLog("WebSocket mirror exception.");
                    console.error(err);
                };
            } catch (ex) {
                addLog("Initialization error: " + ex.message);
            }
        });
    </script>
</body>
</html>"""
                    val htmlBytes = htmlBody.toByteArray(Charsets.UTF_8)
                    val httpResponse = "HTTP/1.1 200 OK\r\n" +
                            "Content-Type: text/html; charset=utf-8\r\n" +
                            "Content-Length: ${htmlBytes.size}\r\n" +
                            "Connection: close\r\n\r\n"
                    output.write(httpResponse.toByteArray(Charsets.UTF_8))
                    output.write(htmlBytes)
                    output.flush()
                    socket.close()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Stream negotiator collapsed: ${e.localizedMessage}")
                try { socket.close() } catch (_: Exception) {}
            }
        }
    }

    private fun extractSecWebSocketKey(headers: String): String? {
        val lines = headers.split("\r\n")
        for (line in lines) {
            if (line.trim().startsWith("Sec-WebSocket-Key:", ignoreCase = true)) {
                return line.split(":")[1].trim()
            }
        }
        return null
    }

    private fun generateWebSocketAccept(key: String): String {
        val salt = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        val crypt = MessageDigest.getInstance("SHA-1")
        crypt.reset()
        crypt.update((key + salt).toByteArray(Charsets.UTF_8))
        return Base64.getEncoder().encodeToString(crypt.digest())
    }

    /**
     * Broadcasts a customized AV binary payload packing schema:
     * Bytes 0: Type code (0x01 Video, 0x02 Audio)
     * Bytes 1: Flags configuration byte (0x01 config, 0x02 Keyframe)
     * Bytes 2-9: presentation DTS microseconds in Big Endian Int64 representation
     * Bytes 10+: Payload binary
     */
    fun broadcastPacket(
        packetType: Byte,
        timestampUs: Long,
        rawData: ByteArray,
        isConfig: Boolean,
        isKey: Boolean
    ) {
        if (clients.isEmpty()) return

        // Organize frame binary buffer
        val frameHeader = ByteBuffer.allocate(10)
        frameHeader.put(packetType)
        
        var flags: Byte = 0
        if (isConfig) flags = (flags.toInt() or 0x01).toByte()
        if (isKey) flags = (flags.toInt() or 0x02).toByte()
        
        frameHeader.put(flags)
        frameHeader.putLong(timestampUs)
        
        val fullPayload = ByteArray(10 + rawData.size)
        System.arraycopy(frameHeader.array(), 0, fullPayload, 0, 10)
        System.arraycopy(rawData, 0, fullPayload, 10, rawData.size)

        // Broadcast standard unmasked binary websocket frame to all connected web pages
        val rfcBinaryFrame = wrapWebSocketBinaryFrame(fullPayload)

        for (client in clients) {
            try {
                client.sendBinary(rfcBinaryFrame)
            } catch (e: Exception) {
                Log.d(TAG, "Dropping non-responsive client session.")
                client.close()
                clients.remove(client)
            }
        }
    }

    private fun wrapWebSocketBinaryFrame(payload: ByteArray): ByteArray {
        val len = payload.size
        var headerSize = 2
        if (len >= 65536) {
            headerSize += 8
        } else if (len >= 126) {
            headerSize += 2
        }

        val frame = ByteArray(headerSize + len)
        frame[0] = 0x82.toByte() // FIN bit set, Opcode 0x02 (Binary Frame)

        if (len < 126) {
            frame[1] = len.toByte()
            System.arraycopy(payload, 0, frame, 2, len)
        } else if (len < 65536) {
            frame[1] = 126.toByte()
            frame[2] = ((len shr 8) and 0xff).toByte()
            frame[3] = (len and 0xff).toByte()
            System.arraycopy(payload, 0, frame, 4, len)
        } else {
            frame[1] = 127.toByte()
            for (i in 0..7) {
                frame[2 + i] = ((len.toLong() shr (56 - i * 8)) and 0xffL).toByte()
            }
            System.arraycopy(payload, 0, frame, 10, len)
        }
        return frame
    }

    fun stop() {
        isRunning = false
        try {
            serverSocket?.close()
        } catch (_: Exception) {}
        for (client in clients) {
            client.close()
        }
        clients.clear()
    }

    private inner class ClientSession(
        val socket: Socket,
        val input: InputStream,
        val output: OutputStream
    ) {
        @Synchronized
        fun sendBinary(rawFrame: ByteArray) {
            output.write(rawFrame)
            output.flush()
        }

        fun close() {
            try { socket.close() } catch (_: Exception) {}
        }
    }
}
