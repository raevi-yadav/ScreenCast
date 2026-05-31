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
import java.net.InetAddress
import java.nio.ByteOrder
import java.util.Locale
import java.math.BigInteger

class MainActivity : AppCompatActivity() {

    private lateinit var btnToggleStream: Button
    private lateinit var tvStatus: TextView
    private lateinit var tvIpAddress: TextView

    private val recordAudioPermissionRequestCode = 1001
    private val screenCaptureRequestCode = 1002

    private var isStreaming = false
    private lateinit var projectionManager: MediaProjectionManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        btnToggleStream = findViewById(R.id.btnToggleStream)
        tvStatus = findViewById(R.id.tvStatus)
        tvIpAddress = findViewById(R.id.tvIpAddress)

        updateIpAddress()

        btnToggleStream.setOnClickListener {
            if (isStreaming) {
                stopStreaming()
            } else {
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
        val serviceIntent = Intent(this, ScreenStreamingService::class.java).apply {
            action = ScreenStreamingService.ACTION_START
            putExtra(ScreenStreamingService.EXTRA_RESULT_CODE, resultCode)
            putExtra(ScreenStreamingService.EXTRA_PROJECTION_INTENT, data)
        }
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
        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        var ipAddress = wifiManager.connectionInfo.ipAddress
        if (ByteOrder.nativeOrder().equals(ByteOrder.LITTLE_ENDIAN)) {
            ipAddress = Integer.reverseBytes(ipAddress)
        }
        val ipByteArray = BigInteger.valueOf(ipAddress.toLong()).toByteArray().reversedArray()
        val ipAddressString = try {
            InetAddress.getByAddress(ipByteArray).hostAddress
        } catch (ex: Exception) {
            "Unknown IP"
        }
        
        tvIpAddress.text = String.format(Locale.US, "ws://%s:8080/stream", ipAddressString)
    }
}
