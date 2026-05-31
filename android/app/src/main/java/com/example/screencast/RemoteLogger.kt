package com.example.screencast

import android.util.Log
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

object RemoteLogger {
    private const val TAG = "RemoteLogger"
    var workspaceUrl: String? = null

    fun init(url: String?) {
        if (!url.isNullOrBlank()) {
            workspaceUrl = url.trim().trimEnd('/')
            Log.i(TAG, "Initialized and registered remote logs URL endpoint: $workspaceUrl/api/logs")
            log("INFO", TAG, "Remote HTTP Log integration active for dynamic diagnostics!")
        } else {
            workspaceUrl = null
        }
    }

    fun log(level: String, tag: String, message: String) {
        // Print to logcat
        when (level) {
            "WARN" -> Log.w(tag, message)
            "ERROR" -> Log.e(tag, message)
            else -> Log.i(tag, message)
        }

        val serverUrl = workspaceUrl ?: return
        thread(start = true, name = "RemoteLogSender") {
            var conn: HttpURLConnection? = null
            try {
                val url = URL("$serverUrl/api/logs")
                conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.connectTimeout = 3000
                conn.readTimeout = 3000
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")

                val json = JSONObject().apply {
                    put("level", level)
                    put("tag", tag)
                    put("message", message)
                }

                OutputStreamWriter(conn.outputStream, "UTF-8").use { writer ->
                    writer.write(json.toString())
                    writer.flush()
                }
                
                val responseCode = conn.responseCode
                if (responseCode != 200) {
                    Log.d(TAG, "Logs transmission failed with status $responseCode")
                }
            } catch (e: Exception) {
                // Squelch exceptions so that logging issue never cascades into crashes
            } finally {
                conn?.disconnect()
            }
        }
    }

    fun registerUncaughtExceptionHandler() {
        val originalHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            val stackTraceString = Log.getStackTraceString(throwable)
            log("ERROR", "CRASH", "FATAL UNCAUGHT EXCEPTION on thread ${thread.name}: ${throwable.localizedMessage}\n$stackTraceString")
            // Give thread some padding time to flush HTTP request before crash exit
            try {
                Thread.sleep(1500)
            } catch (_: Exception) {}
            originalHandler?.uncaughtException(thread, throwable)
        }
    }
}
