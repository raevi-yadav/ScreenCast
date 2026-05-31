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
                    // Send simple warning notice
                    val warningBody = "CastCore Service running. Please bridge using your web receiver!"
                    val httpResponse = "HTTP/1.1 200 OK\r\n" +
                            "Content-Type: text/plain\r\n" +
                            "Content-Length: ${warningBody.length}\r\n" +
                            "Connection: close\r\n\r\n" +
                            warningBody
                    output.write(httpResponse.toByteArray(Charsets.UTF_8))
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
