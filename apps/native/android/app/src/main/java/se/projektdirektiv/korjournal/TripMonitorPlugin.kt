package se.projektdirektiv.korjournal

import android.Manifest
import android.content.Intent
import android.os.Build
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "TripMonitor",
    permissions = [
        Permission(
            strings = [
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ],
            alias = "location"
        ),
        Permission(
            strings = [
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            ],
            alias = "bluetooth"
        )
    ]
)
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
        val needsLocation = getPermissionState("location") != PermissionState.GRANTED
        val needsBluetooth = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                getPermissionState("bluetooth") != PermissionState.GRANTED

        if (needsLocation || needsBluetooth) {
            requestAllPermissions(call, "permissionsCallback")
            return
        }
        doStartService(call)
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        // Start service regardless — service handles missing permissions gracefully
        doStartService(call)
    }

    private fun doStartService(call: PluginCall) {
        try {
            val intent = Intent(context, TripMonitorService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            call.resolve()
        } catch (e: Exception) {
            call.reject("Kunde inte starta bakgrundstjänst: ${e.message}")
        }
    }

    @PluginMethod
    fun stopService(call: PluginCall) {
        context.stopService(Intent(context, TripMonitorService::class.java))
        call.resolve()
    }

    @PluginMethod
    fun saveSession(call: PluginCall) {
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
