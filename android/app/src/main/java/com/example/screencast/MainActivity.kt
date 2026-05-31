package com.example.screencast

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.wifi.WifiManager
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.widget.EditText
import java.net.InetAddress
import java.nio.ByteOrder
import java.util.Locale
import java.math.BigInteger

class MainActivity : AppCompatActivity() {

    private lateinit var btnToggleStream: Button
    private lateinit var tvStatus: TextView
    private lateinit var tvIpAddress: TextView
    private lateinit var etWorkspaceUrl: EditText

    private val recordAudioPermissionRequestCode = 1001
    private val screenCaptureRequestCode = 1002

    private var isStreaming = false
    private lateinit var projectionManager: MediaProjectionManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Register uncaught crash reporter immediately
        RemoteLogger.registerUncaughtExceptionHandler()

        projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        btnToggleStream = findViewById(R.id.btnToggleStream)
        tvStatus = findViewById(R.id.tvStatus)
        tvIpAddress = findViewById(R.id.tvIpAddress)
        etWorkspaceUrl = findViewById(R.id.etWorkspaceUrl)

        // Load saved Workspace URL
        val prefs = getSharedPreferences("cast_prefs", Context.MODE_PRIVATE)
        val savedUrl = prefs.getString("workspace_url", "")
        etWorkspaceUrl.setText(savedUrl)

        updateIpAddress()

        btnToggleStream.setOnClickListener {
            if (isStreaming) {
                stopStreaming()
            } else {
                val inputUrl = etWorkspaceUrl.text.toString().trim()
                // Save Workspace URL
                prefs.edit().putString("workspace_url", inputUrl).apply()
                // Initialize Remote Log sender
                RemoteLogger.init(inputUrl)
                
                checkPermissionsAndStart()
            }
        }
    }

    private fun checkPermissionsAndStart() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this, 
                arrayOf(Manifest.permission.RECORD_AUDIO), 
                recordAudioPermissionRequestCode
            )
        } else {
            requestScreenCapture()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == recordAudioPermissionRequestCode) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                requestScreenCapture()
            } else {
                Toast.makeText(this, "Internal audio capture requires RECORD_AUDIO permission.", Toast.LENGTH_LONG).show()
                // Let service fallback to video only or start anyway
                requestScreenCapture()
            }
        }
    }

    private fun requestScreenCapture() {
        val captureIntent = projectionManager.createScreenCaptureIntent()
        startActivityForResult(captureIntent, screenCaptureRequestCode)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == screenCaptureRequestCode) {
            if (resultCode == RESULT_OK && data != null) {
                startStreaming(resultCode, data)
            } else {
                Toast.makeText(this, "User declined screen recording access.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun startStreaming(resultCode: Int, data: Intent) {
        val workspaceUrl = etWorkspaceUrl.text.toString().trim()
        val serviceIntent = Intent(this, ScreenStreamingService::class.java).apply {
            action = ScreenStreamingService.ACTION_START
            putExtra(ScreenStreamingService.EXTRA_RESULT_CODE, resultCode)
            putExtra(ScreenStreamingService.EXTRA_PROJECTION_INTENT, data)
            putExtra("WORKSPACE_URL", workspaceUrl)
        }
        RemoteLogger.log("INFO", "MainActivity", "Starting foreground streaming pipeline towards workspace: $workspaceUrl")
        ContextCompat.startForegroundService(this, serviceIntent)
        
        isStreaming = true
        btnToggleStream.text = "Stop Live Stream"
        btnToggleStream.setBackgroundColor(ContextCompat.getColor(this, android.R.color.holo_red_dark))
        tvStatus.text = "Streaming Active"
        tvStatus.setTextColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))
    }

    private fun stopStreaming() {
        val serviceIntent = Intent(this, ScreenStreamingService::class.java).apply {
            action = ScreenStreamingService.ACTION_STOP
        }
        startService(serviceIntent)

        isStreaming = false
        btnToggleStream.text = "Start Live Stream"
        btnToggleStream.setBackgroundColor(ContextCompat.getColor(this, android.R.color.holo_green_light))
        tvStatus.text = "Service Idle"
        tvStatus.setTextColor(ContextCompat.getColor(this, android.R.color.darker_gray))
    }

    private fun updateIpAddress() {
        tvIpAddress.text = "ws://${getLocalIpAddress()}:8080/stream"
    }

    private fun getLocalIpAddress(): String {
        try {
            // Priority 1: Check standard Wi-Fi IP address
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val connectionInfo = wifiManager.connectionInfo
            val ipAddress = connectionInfo?.ipAddress ?: 0
            if (ipAddress != 0) {
                // WifiManager IP address is natively integer format in LITTLE_ENDIAN
                val ipAddressString = String.format(
                    Locale.US,
                    "%d.%d.%d.%d",
                    (ipAddress and 0xff),
                    (ipAddress shr 8 and 0xff),
                    (ipAddress shr 16 and 0xff),
                    (ipAddress shr 24 and 0xff)
                )
                if (ipAddressString != "0.0.0.0" && ipAddressString != "127.0.0.1") {
                    return ipAddressString
                }
            }
        } catch (_: Exception) {}

        try {
            // Priority 2: Iterate over all interfaces to find active non-loopback IPv4 addresses (mobile data, hotspot, bridges)
            val en = java.net.NetworkInterface.getNetworkInterfaces()
            while (en.hasMoreElements()) {
                val intf = en.nextElement()
                val enumIpAddr = intf.inetAddresses
                while (enumIpAddr.hasMoreElements()) {
                    val inetAddress = enumIpAddr.nextElement()
                    if (!inetAddress.isLoopbackAddress && inetAddress is java.net.InetAddress) {
                        val host = inetAddress.hostAddress ?: ""
                        if (host.isNotEmpty() && !host.contains(":")) { // IPv4 format check
                            return host
                        }
                    }
                }
            }
        } catch (_: Exception) {}

        return "127.0.0.1"
    }
}
