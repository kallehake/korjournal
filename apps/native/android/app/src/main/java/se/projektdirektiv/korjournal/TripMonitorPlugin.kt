package se.projektdirektiv.korjournal

import android.content.Intent
import android.os.Build
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "TripMonitor")
class TripMonitorPlugin : Plugin() {

    companion object {
        private var instance: TripMonitorPlugin? = null

        fun notifyStatus(status: String) {
            instance?.notifyListeners("statusChanged", JSObject().apply { put("status", status) })
        }

        fun notifyTripStarted(tripId: String) {
            instance?.notifyListeners("tripStarted", JSObject().apply { put("tripId", tripId) })
        }

        fun notifyTripEnded(tripId: String, km: Int, tripType: String, zoneName: String?) {
            instance?.notifyListeners("tripEnded", JSObject().apply {
                put("tripId", tripId)
                put("km", km)
                put("tripType", tripType)
                if (zoneName != null) put("zoneName", zoneName)
            })
        }
    }

    override fun load() {
        instance = this
    }

    @PluginMethod
    fun startService(call: PluginCall) {
        val intent = Intent(context, TripMonitorService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        call.resolve()
    }

    @PluginMethod
    fun stopService(call: PluginCall) {
        context.stopService(Intent(context, TripMonitorService::class.java))
        call.resolve()
    }

    @PluginMethod
    fun saveSession(call: PluginCall) {
        // Save auth tokens for the background service to use
        val prefs = context.getSharedPreferences("korjournal", android.content.Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString("access_token", call.getString("accessToken"))
            putString("driver_id", call.getString("driverId"))
            putString("org_id", call.getString("orgId"))
            putString("vehicle_id", call.getString("vehicleId"))
            apply()
        }
        call.resolve()
    }
}
