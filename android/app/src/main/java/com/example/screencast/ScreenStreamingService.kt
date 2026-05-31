package com.example.screencast

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.nio.ByteBuffer

class ScreenStreamingService : Service() {

    companion object {
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val EXTRA_RESULT_CODE = "EXTRA_RESULT_CODE"
        const val EXTRA_PROJECTION_INTENT = "EXTRA_PROJECTION_INTENT"
        
        private const val TAG = "ScreenStreamingService"
        private const val NOTIFICATION_ID = 4455
        private const val CHANNEL_ID = "stream_channel_01"
        private const val PORT = 8080
    }

    private val serviceScope = CoroutineScope(Dispatchers.Default + Job())
    
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    
    private var videoEncoder: MediaCodec? = null
    private var audioEncoder: MediaCodec? = null
    private var audioRecord: AudioRecord? = null
    
    private var websocketServer: WebSocketsStreamingServer? = null
    
    private var videoEncoderJob: Job? = null
    private var audioCaptureJob: Job? = null
    private var audioEncoderJob: Job? = null

    // Track state metrics to detect orientation updates
    private var currentWidth = 0
    private var currentHeight = 0
    private var currentDensity = 0
    private var currentFps = 60

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startWebSocketServer()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == ACTION_START) {
            val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, -1)
            val data = intent.getParcelableExtra<Intent>(EXTRA_PROJECTION_INTENT)
            if (resultCode != -1 && data != null) {
                startForegroundNotification()
                startCapturePipelines(resultCode, data)
            }
        } else if (action == ACTION_STOP) {
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun startWebSocketServer() {
        websocketServer = WebSocketsStreamingServer(PORT)
        websocketServer?.start()
        Log.i(TAG, "Local streaming server started on port $PORT")
    }

    private fun startCapturePipelines(resultCode: Int, data: Intent) {
        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = projectionManager.getMediaProjection(resultCode, data)

        if (mediaProjection == null) {
            Log.e(TAG, "Failed to instantiate Media Projection Manager.")
            stopSelf()
            return
        }

        // 1. Setup screen metrics dynamically matching native Hardware Display values
        val windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val defaultDisplay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            display ?: windowManager.defaultDisplay
        } else {
            windowManager.defaultDisplay
        }
        
        val metrics = DisplayMetrics()
        defaultDisplay.getRealMetrics(metrics)
        val width = (metrics.widthPixels / 16) * 16  // Hardware H.264 codecs demand multiples of 16
        val height = (metrics.heightPixels / 16) * 16
        val density = metrics.densityDpi
        val nativeRefreshRate = defaultDisplay.refreshRate.toInt().coerceIn(30, 120)

        // Track and save baseline configurations
        currentWidth = width
        currentHeight = height
        currentDensity = density
        currentFps = nativeRefreshRate

        Log.i(TAG, "Display: Width=$width, Height=$height, Refresh=$nativeRefreshRate, DPI=$density")

        // 2. Setup video encoder using Hardware-Accelerated H.264
        setupVideoEncoder(width, height, nativeRefreshRate)
        
        // 3. Register input virtual display surface to mirror pixels onto MediaCodec
        val inputSurface = videoEncoder?.createInputSurface()
        if (inputSurface != null) {
            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "ScreenMirrorDisplay",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                inputSurface,
                null,
                null
            )
        }

        // 4. Setup internal audio capture pipeline (Requires Android 10+)
        setupAudioEncoderAndCapture()

        // 5. Spin up parallel coroutine pipelines to poll and broadcast video/audio buffers
        startLoopEncoders()
    }

    private fun setupVideoEncoder(width: Int, height: Int, fps: Int) {
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, 15_000_000) // 15 Mbps for rich clarity over local Wi-Fi
            setInteger(MediaFormat.KEY_FRAME_RATE, fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1) // Crucial for instant browser stream join (Keyframe every second)
            
            // Extreme Low Latency optimizations
            setInteger(MediaFormat.KEY_LATENCY, 0)
            setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileHigh)
                setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel42)
            }
        }

        videoEncoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC).apply {
            configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            start()
        }
    }

    private fun setupAudioEncoderAndCapture() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return // Require Android 10+
        val projection = mediaProjection ?: return

        try {
            // Audio Encoder configuration (AAC)
            val sampleRate = 44100
            val channelCount = 2
            val bitrate = 192_000

            val audioFormat = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, channelCount).apply {
                setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
            }

            audioEncoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).apply {
                configure(audioFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
                start()
            }

            // High Performance Internal Audio Capture configuration
            val captureConfig = AudioPlaybackCaptureConfiguration.Builder(projection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build()

            val minBufferSize = AudioRecord.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_IN_STEREO,
                AudioFormat.ENCODING_PCM_16BIT
            ) * 2

            audioRecord = AudioRecord.Builder()
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
                        .build()
                )
                .setBufferSizeInBytes(minBufferSize)
                .setAudioPlaybackCaptureConfig(captureConfig)
                .build()

            audioRecord?.startRecording()
        } catch (ex: Exception) {
            Log.e(TAG, "Could not initialize internal audio pipeline: ${ex.localizedMessage}")
        }
    }

    private fun startVideoEncoderLoop() {
        videoEncoderJob = serviceScope.launch(Dispatchers.IO) {
            val bufferInfo = MediaCodec.BufferInfo()
            while (isActive) {
                val encoder = videoEncoder ?: break
                try {
                    val outputBufferId = encoder.dequeueOutputBuffer(bufferInfo, 20_000L)
                    if (outputBufferId >= 0) {
                        val outputBuffer = encoder.getOutputBuffer(outputBufferId)
                        if (outputBuffer != null) {
                            // Extract format configuration descriptors (SPS/PPS) or Key-frames
                            val isConfig = (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0
                            val isKeyframe = (bufferInfo.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0
                            
                            val size = bufferInfo.size
                            val bufferBytes = ByteArray(size)
                            outputBuffer.get(bufferBytes)
                            
                            // Send packet type: 0x01 (Video), size, pts
                            websocketServer?.broadcastPacket(
                                packetType = 0x01,
                                timestampUs = bufferInfo.presentationTimeUs,
                                rawData = bufferBytes,
                                isConfig = isConfig,
                                isKey = isKeyframe
                            )
                        }
                        encoder.releaseOutputBuffer(outputBufferId, false)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Video loop error: ${e.localizedMessage}")
                }
            }
        }
    }

    private fun startLoopEncoders() {
        // Video Encoder polling loop
        startVideoEncoderLoop()

        // Audio Input Record & Submission loop
        val pcmRecord = audioRecord
        val aEncoder = audioEncoder
        if (pcmRecord != null && aEncoder != null) {
            audioCaptureJob = serviceScope.launch(Dispatchers.IO) {
                val buffer = ByteArray(4096)
                while (isActive) {
                    val bytesRead = pcmRecord.read(buffer, 0, buffer.size)
                    if (bytesRead > 0) {
                        try {
                            val inputBufferId = aEncoder.dequeueInputBuffer(10_000L)
                            if (inputBufferId >= 0) {
                                val inputBuffer = aEncoder.getInputBuffer(inputBufferId)
                                if (inputBuffer != null) {
                                    inputBuffer.clear()
                                    inputBuffer.put(buffer, 0, bytesRead)
                                    val presentationTimeUs = System.nanoTime() / 1000
                                    aEncoder.queueInputBuffer(inputBufferId, 0, bytesRead, presentationTimeUs, 0)
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Audio submit error: ${e.localizedMessage}")
                        }
                    }
                }
            }

            // Audio AAC Encoder polling loop
            audioEncoderJob = serviceScope.launch(Dispatchers.IO) {
                val bufferInfo = MediaCodec.BufferInfo()
                while (isActive) {
                    try {
                        val outputBufferId = aEncoder.dequeueOutputBuffer(bufferInfo, 20_000L)
                        if (outputBufferId >= 0) {
                            val outputBuffer = aEncoder.getOutputBuffer(outputBufferId)
                            if (outputBuffer != null) {
                                val bufferBytes = ByteArray(bufferInfo.size)
                                outputBuffer.get(bufferBytes)
                                
                                // Send packet type: 0x02 (Audio), size, pts
                                websocketServer?.broadcastPacket(
                                    packetType = 0x02,
                                    timestampUs = bufferInfo.presentationTimeUs,
                                    rawData = bufferBytes,
                                    isConfig = (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0,
                                    isKey = false
                                )
                            }
                            aEncoder.releaseOutputBuffer(outputBufferId, false)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Audio encoder loop error: ${e.localizedMessage}")
                    }
                }
            }
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        Log.i(TAG, "onConfigurationChanged: New orientation = ${newConfig.orientation}")
        handleOrientationChange()
    }

    private fun handleOrientationChange() {
        val windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val defaultDisplay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            display ?: windowManager.defaultDisplay
        } else {
            windowManager.defaultDisplay
        }
        
        val metrics = DisplayMetrics()
        defaultDisplay.getRealMetrics(metrics)
        val width = (metrics.widthPixels / 16) * 16
        val height = (metrics.heightPixels / 16) * 16
        val density = metrics.densityDpi
        val nativeRefreshRate = defaultDisplay.refreshRate.toInt().coerceIn(30, 120)

        // Only recreate if dimensions have actually changed to avoid redundant resets
        if (width == currentWidth && height == currentHeight) {
            Log.i(TAG, "Orientation triggered but resolution remains unchanged ($width x $height)")
            return
        }

        Log.i(TAG, "Orientation change detected! Re-creating display pipeline: $currentWidth x $currentHeight -> $width x $height")

        // 1. Cancel previous videoEncoderJob
        videoEncoderJob?.cancel()
        videoEncoderJob = null

        // 2. Release virtual display
        virtualDisplay?.release()
        virtualDisplay = null

        // 3. Stop and release video encoder
        try {
            videoEncoder?.stop()
            videoEncoder?.release()
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping video encoder on rotation: ${e.localizedMessage}")
        }
        videoEncoder = null

        // Update current dimensions
        currentWidth = width
        currentHeight = height
        currentDensity = density
        currentFps = nativeRefreshRate

        // 4. Setup video encoder with new dimensions
        setupVideoEncoder(width, height, nativeRefreshRate)

        // 5. Recreate virtual display with new dimensions and new input surface
        val inputSurface = videoEncoder?.createInputSurface()
        if (inputSurface != null) {
            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "ScreenMirrorDisplay",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                inputSurface,
                null,
                null
            )
        }

        // 6. Restart video encoder polling loop
        startVideoEncoderLoop()
    }

    private fun startForegroundNotification() {
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("CastCore Streamer")
            .setContentText("Local WiFi Screen & Audio streaming active on port $PORT.")
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
            
        startForeground(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Display Stream Status"
            val descriptionText = "Displays real-time screen mirror cast activity alerts."
            val importance = NotificationManager.IMPORTANCE_LOW
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
            }
            val notificationManager: NotificationManager =
                getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        
        videoEncoderJob?.cancel()
        audioCaptureJob?.cancel()
        audioEncoderJob?.cancel()
        
        virtualDisplay?.release()
        mediaProjection?.stop()
        
        try {
            videoEncoder?.stop()
            videoEncoder?.release()
        } catch (_: Exception) {}
        
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (_: Exception) {}
        
        try {
            audioEncoder?.stop()
            audioEncoder?.release()
        } catch (_: Exception) {}

        websocketServer?.stop()
        Log.i(TAG, "Capture service shut down cleanly.")
    }
}
