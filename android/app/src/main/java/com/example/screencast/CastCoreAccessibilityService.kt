package com.example.screencast

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.util.Log
import android.view.accessibility.AccessibilityEvent

/**
 * Native Android Accessibility Service to facilitate programmatic remote touch injection.
 * Receives remote pointer positions from the WebSocket server in normalized format [0.0..1.0],
 * translates them to local physical display coordinates on the device,
 * and executes standard drag-tap sequences over the current active foreground UI window.
 */
class CastCoreAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "CastCoreAccessibility"
        private var instance: CastCoreAccessibilityService? = null

        /**
         * Singlet instance accessor used by MainActivity or ScreenStreamingService
         * to check whether the control bridge service is active and authorized.
         */
        fun getInstance(): CastCoreAccessibilityService? = instance
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "CastCore Remote Control Service active and authorized by user.")
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // No-op. Standard events are monitored here if needed (e.g., active app tracking)
    }

    override fun onInterrupt() {
        Log.w(TAG, "CastCore control bridge interrupted.")
    }

    /**
         * Programmatic touch tap simulation on coordinates.
         * Takes scaled relative positions, scales to actual device pixel counts, and injects event.
         */
    fun performRemoteClick(xPercent: Float, yPercent: Float) {
        val displayMetrics = resources.displayMetrics
        val screenX = xPercent * displayMetrics.widthPixels
        val screenY = yPercent * displayMetrics.heightPixels

        Log.i(TAG, "Injecting native touch event at pixel: ($screenX, $screenY)")

        val path = Path()
        path.moveTo(screenX, screenY)

        val gestureBuilder = GestureDescription.Builder()
        // Complete tap action over 60ms
        val stroke = GestureDescription.StrokeDescription(path, 0, 60)
        gestureBuilder.addStroke(stroke)

        dispatchGesture(gestureBuilder.build(), object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                super.onCompleted(gestureDescription)
                Log.d(TAG, "Touch click successfully injected to foreground window.")
            }
            override fun onCancelled(gestureDescription: GestureDescription?) {
                super.onCancelled(gestureDescription)
                Log.e(TAG, "Gesture failed - check if overlay is interrupting.")
            }
        }, null)
    }

    /**
         * Programmatic gesture drag/swipe injection.
         */
    fun performRemoteSwipe(xStart: Float, yStart: Float, xEnd: Float, yEnd: Float, durationMs: Long) {
        val displayMetrics = resources.displayMetrics
        val startX = xStart * displayMetrics.widthPixels
        val startY = yStart * displayMetrics.heightPixels
        val endX = xEnd * displayMetrics.widthPixels
        val endY = yEnd * displayMetrics.heightPixels

        Log.i(TAG, "Injecting native swipe from ($startX, $startY) to ($endX, $endY) for ${durationMs}ms")

        val path = Path()
        path.moveTo(startX, startY)
        path.lineTo(endX, endY)

        val gestureBuilder = GestureDescription.Builder()
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        gestureBuilder.addStroke(stroke)

        dispatchGesture(gestureBuilder.build(), null, null)
    }

    /**
         * Propagates default navigation buttons commands back-channel (Back, Home, Recents)
         */
    fun performSystemAction(actionType: String) {
        val actionId = when (actionType) {
            "BACK" -> GLOBAL_ACTION_BACK             // 1
            "HOME" -> GLOBAL_ACTION_HOME             // 2
            "RECENTS" -> GLOBAL_ACTION_RECENTS       // 3
            else -> return
        }
        
        Log.i(TAG, "Injecting system global action: $actionType ($actionId)")
        performGlobalAction(actionId)
    }
}
