package se.projektdirektiv.korjournal

import android.annotation.SuppressLint
import android.app.*
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.*

class TripMonitorService : Service() {

    companion object {
        const val TAG = "TripMonitor"
        const val CHANNEL_ID = "korjournal_trip"
        const val NOTIF_ID = 1
        const val ACTION_STOP = "se.projektdirektiv.korjournal.STOP"

        // BLE UUIDs for ELM327/Vgate
        val OBD_SERVICE: UUID = UUID.fromString("0000fff0-0000-1000-8000-00805f9b34fb")
        val OBD_WRITE: UUID   = UUID.fromString("0000fff2-0000-1000-8000-00805f9b34fb")
        val OBD_NOTIFY: UUID  = UUID.fromString("0000fff1-0000-1000-8000-00805f9b34fb")
        val CCCD: UUID        = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
        val OBD_NAME_PREFIXES = listOf("vgate", "icar", "elm327", "obd", "veepeak", "vlink")

        // Supabase
        const val SUPABASE_URL = "https://wpwjeilkzyhwzoirltbi.supabase.co"
        const val SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2plaWxrenlod3pvaXJsdGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMDM1OTYsImV4cCI6MjA4NjU3OTU5Nn0.M5ENENbHhUrSWbtnqhQytOiatKoXCpVJSi0u4x5qlAI"

        // Trip detection thresholds
        const val SPEED_START_MS  = 1.4f        // ~5 km/h in m/s — GPS speed
        const val SPEED_STOP_MS_DURATION = 5 * 60_000L  // Stopped for 5 min → end trip
        const val GPS_INTERVAL_MS = 5_000L      // GPS update interval
        const val BLE_RETRY_MS    = 30_000L     // Retry BLE scan every 30s if not connected
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val http = OkHttpClient()

    // BLE / OBD2 (optional — used for odometer only)
    private var bleScanner: BluetoothLeScanner? = null
    private var gatt: BluetoothGatt? = null
    private var writeChar: BluetoothGattCharacteristic? = null
    private val responseBuffer = StringBuilder()
    private val responseLock = Object()
    private var obd2Connected = false

    // GPS (primary trip detection)
    private var fusedLocation: FusedLocationProviderClient? = null
    private var lastLocation: Location? = null
    private var locationCallback: LocationCallback? = null

    // Trip state
    private var tripId: String? = null
    private var tripStart: Long = 0
    private var startLat = 0.0
    private var startLng = 0.0
    private var odometerStart = 0
    private var stoppedSince = 0L

    // Geofences cache
    data class Geofence(val name: String, val type: String, val lat: Double, val lng: Double, val radius: Double, val autoTripType: String?)
    private var geofences: List<Geofence> = emptyList()

    // Auth
    private var accessToken: String? = null
    private var driverId: String? = null
    private var orgId: String? = null
    private var vehicleId: String? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIF_ID, buildNotification("Startar..."))
        scope.launch { loadSession() }
        setupGps()
        scope.launch {
            delay(2000) // Wait for GPS to initialise
            startGpsMonitoring()
        }
        scope.launch { startBleScan() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) stopSelf()
        return START_STICKY
    }

    override fun onBind(intent: Intent?) = null

    override fun onDestroy() {
        scope.cancel()
        fusedLocation?.removeLocationUpdates(locationCallback ?: return)
        gatt?.close()
        super.onDestroy()
    }

    // ── GPS setup ─────────────────────────────────────────────────────────────

    private fun setupGps() {
        try {
            fusedLocation = LocationServices.getFusedLocationProviderClient(this)
            val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, GPS_INTERVAL_MS)
                .setMinUpdateDistanceMeters(10f)
                .build()
            locationCallback = object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    lastLocation = result.lastLocation
                }
            }
            fusedLocation?.requestLocationUpdates(req, locationCallback!!, Looper.getMainLooper())
            Log.d(TAG, "GPS setup OK")
        } catch (e: SecurityException) {
            Log.e(TAG, "GPS-tillstånd saknas: ${e.message}")
            updateNotification("GPS-tillstånd saknas — gå till Inställningar")
        }
    }

    // ── GPS-based trip monitoring (primary) ───────────────────────────────────

    private suspend fun startGpsMonitoring() {
        updateNotification("Redo — väntar på rörelse")
        Log.d(TAG, "GPS monitoring started")

        while (true) {
            delay(GPS_INTERVAL_MS)
            val loc = lastLocation ?: continue
            val speedMs = loc.speed  // m/s from GPS

            if (speedMs >= SPEED_START_MS) {
                // Moving
                stoppedSince = 0L
                if (tripId == null) {
                    startTrip(loc)
                } else {
                    updateNotification("Resa pågår — ${(speedMs * 3.6).toInt()} km/h")
                }
            } else {
                // Stopped
                if (tripId != null) {
                    if (stoppedSince == 0L) stoppedSince = System.currentTimeMillis()
                    val stoppedFor = System.currentTimeMillis() - stoppedSince
                    val minutesStopped = stoppedFor / 60_000
                    if (stoppedFor >= SPEED_STOP_MS_DURATION) {
                        endTrip(loc)
                    } else {
                        updateNotification("Resa pågår — stannat $minutesStopped min (avslutar vid 5 min)")
                    }
                }
            }
        }
    }

    // ── BLE scan (optional — for odometer) ───────────────────────────────────

    private suspend fun startBleScan() {
        try {
            val btManager = getSystemService(BLUETOOTH_SERVICE) as BluetoothManager
            val adapter = btManager.adapter
            if (adapter == null || !adapter.isEnabled) {
                Log.d(TAG, "Bluetooth inte aktiverat — kör utan OBD2")
                return
            }
            bleScanner = adapter.bluetoothLeScanner

            val callback = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult) {
                    try {
                        val name = result.device.name?.lowercase() ?: return
                        if (OBD_NAME_PREFIXES.none { name.contains(it) }) return
                        bleScanner?.stopScan(this)
                        Log.d(TAG, "Hittade OBD2: ${result.device.name}")
                        scope.launch { connectGatt(result.device) }
                    } catch (e: SecurityException) {
                        Log.e(TAG, "BLE scan result SecurityException: ${e.message}")
                    }
                }

                override fun onScanFailed(errorCode: Int) {
                    Log.e(TAG, "BLE-skanning misslyckades: kod $errorCode")
                }
            }
            bleScanner?.startScan(callback)
            Log.d(TAG, "BLE-skanning startad")

            // Retry scan periodically if OBD2 not yet connected
            while (true) {
                delay(BLE_RETRY_MS)
                if (!obd2Connected) {
                    try {
                        bleScanner?.stopScan(callback)
                        bleScanner?.startScan(callback)
                        Log.d(TAG, "BLE-skanning omstartad")
                    } catch (e: SecurityException) {
                        Log.e(TAG, "BLE retry SecurityException: ${e.message}")
                        break
                    }
                }
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Bluetooth-tillstånd saknas: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "BLE-start fel: ${e.message}")
        }
    }

    // ── GATT connection ───────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private suspend fun connectGatt(device: BluetoothDevice) {
        try {
            withContext(Dispatchers.Main) {
                gatt = device.connectGatt(this@TripMonitorService, false, gattCallback)
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "connectGatt SecurityException: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                obd2Connected = true
                Log.d(TAG, "OBD2 ansluten")
                g.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                obd2Connected = false
                gatt = null
                writeChar = null
                Log.d(TAG, "OBD2 frånkopplad")
                scope.launch { delay(10_000); startBleScan() }
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            val service = g.getService(OBD_SERVICE) ?: return
            writeChar = service.getCharacteristic(OBD_WRITE)
            val notifyChar = service.getCharacteristic(OBD_NOTIFY)
            try {
                g.setCharacteristicNotification(notifyChar, true)
                val desc = notifyChar.getDescriptor(CCCD)
                desc?.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                g.writeDescriptor(desc)
            } catch (e: SecurityException) {
                Log.e(TAG, "GATT setup SecurityException: ${e.message}")
            }
            scope.launch { delay(500); initElm327() }
            Log.d(TAG, "OBD2 tjänster hittade — klar för mätarläsning")
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicChanged(g: BluetoothGatt, char: BluetoothGattCharacteristic) {
            val chunk = char.value.decodeToString()
            synchronized(responseLock) {
                responseBuffer.append(chunk)
                if (chunk.contains('>')) responseLock.notifyAll()
            }
        }
    }

    // ── ELM327 commands ───────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private suspend fun sendCmd(cmd: String): String {
        val char = writeChar ?: return ""
        synchronized(responseLock) { responseBuffer.clear() }
        try {
            withContext(Dispatchers.Main) {
                char.value = (cmd + "\r").toByteArray()
                gatt?.writeCharacteristic(char)
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "sendCmd SecurityException: ${e.message}")
            return ""
        }
        return withContext(Dispatchers.IO) {
            synchronized(responseLock) {
                responseLock.wait(1500)
                responseBuffer.toString().trim()
            }
        }
    }

    private suspend fun initElm327() {
        sendCmd("ATZ"); delay(300)
        sendCmd("ATE0"); delay(100)
        sendCmd("ATL0"); delay(100)
        sendCmd("ATSP0")
    }

    private suspend fun readOdometer(): Int? {
        if (!obd2Connected || writeChar == null) return null
        val raw = sendCmd("01A6")
        val parts = raw.replace(Regex("[\\r\\n>]"), " ").trim().split(Regex("\\s+"))
        val idx = parts.indexOfFirst { it.uppercase() == "A6" }
        return if (idx >= 0 && parts.size > idx + 4) {
            val b = parts.slice(idx + 1..idx + 4).map { it.toIntOrNull(16) ?: 0 }
            ((b[0] shl 24) or (b[1] shl 16) or (b[2] shl 8) or b[3]) / 10
        } else null
    }

    // ── Trip start/end ────────────────────────────────────────────────────────

    private suspend fun startTrip(loc: Location) {
        if (accessToken == null || vehicleId == null) {
            Log.w(TAG, "startTrip: session saknas")
            return
        }

        startLat = loc.latitude
        startLng = loc.longitude
        tripStart = System.currentTimeMillis()

        // Try OBD2 odometer, fall back to 0
        odometerStart = readOdometer() ?: 0

        val addr = reverseGeocode(startLat, startLng)
        val now = isoNow()

        val body = JSONObject().apply {
            put("vehicle_id", vehicleId)
            put("driver_id", driverId)
            put("organization_id", orgId)
            put("date", now.substring(0, 10))
            put("start_time", now)
            put("start_address", addr)
            put("odometer_start", odometerStart)
            put("trip_type", "business")
            put("status", "active")
        }

        val id = supabaseInsert("trips", body)
        if (id != null) {
            tripId = id
            val obd2Status = if (obd2Connected) " (OBD2 ✓)" else " (GPS)"
            updateNotification("Resa startad — $addr$obd2Status")
            TripMonitorPlugin.notifyTripStarted(id)
            Log.d(TAG, "Trip started: $id addr=$addr obd2=$obd2Connected")
        } else {
            Log.e(TAG, "startTrip: supabaseInsert returnerade null")
            updateNotification("Fel: kunde inte spara resa — kontrollera inloggning")
        }
    }

    private suspend fun endTrip(loc: Location) {
        val id = tripId ?: return
        tripId = null
        stoppedSince = 0L

        val endLat = loc.latitude
        val endLng = loc.longitude
        val endAddr = reverseGeocode(endLat, endLng)

        // Try OBD2 odometer, fall back to OSRM routing distance
        val endOdometer: Int
        val distKm: Int
        val odomEnd = readOdometer()
        if (odomEnd != null && odometerStart > 0 && odomEnd > odometerStart) {
            distKm = odomEnd - odometerStart
            endOdometer = odomEnd
        } else {
            distKm = calcRouteKm(startLat, startLng, endLat, endLng) ?: 0
            endOdometer = odometerStart + distKm
        }

        // Geofence auto-classification
        val startZone = findGeofence(startLat, startLng)
        val endZone   = findGeofence(endLat, endLng)
        val autoTripType = when {
            endZone?.autoTripType != null                    -> endZone.autoTripType
            endZone?.type in listOf("office", "customer")   -> "business"
            startZone?.type == "home"                        -> "business"
            else                                             -> "business"
        }
        val zoneName = endZone?.name

        val body = JSONObject().apply {
            put("end_time", isoNow())
            put("end_address", endAddr)
            put("odometer_end", endOdometer)
            put("trip_type", autoTripType)
            put("status", "completed")
        }
        supabasePatch("trips", id, body)

        vehicleId?.let {
            supabasePatch("vehicles", it, JSONObject().put("current_odometer", endOdometer))
        }

        val obd2Status = if (obd2Connected) " (OBD2 ✓)" else " (GPS)"
        updateNotification("Resa sparad — $distKm km$obd2Status")
        showTripDoneNotification(id, endAddr, distKm)
        TripMonitorPlugin.notifyTripEnded(id, distKm, autoTripType ?: "business", zoneName)
        Log.d(TAG, "Trip ended: $id $distKm km zone=${zoneName} obd2=$obd2Connected")
    }

    // ── Supabase HTTP ─────────────────────────────────────────────────────────

    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

    private fun supabaseHeaders(): Headers = Headers.Builder()
        .add("apikey", SUPABASE_KEY)
        .add("Authorization", "Bearer ${accessToken ?: SUPABASE_KEY}")
        .add("Content-Type", "application/json")
        .add("Prefer", "return=representation")
        .build()

    private suspend fun supabaseInsert(table: String, body: JSONObject): String? {
        return withContext(Dispatchers.IO) {
            val req = Request.Builder()
                .url("$SUPABASE_URL/rest/v1/$table")
                .headers(supabaseHeaders())
                .post(body.toString().toRequestBody(JSON_TYPE))
                .build()
            try {
                val resp = http.newCall(req).execute()
                val text = resp.body?.string() ?: "[]"
                if (!resp.isSuccessful) {
                    Log.e(TAG, "Insert HTTP ${resp.code}: $text")
                    return@withContext null
                }
                val arr = JSONArray(text)
                if (arr.length() > 0) arr.getJSONObject(0).optString("id") else null
            } catch (e: IOException) {
                Log.e(TAG, "Insert failed: ${e.message}"); null
            }
        }
    }

    private suspend fun supabasePatch(table: String, id: String, body: JSONObject) {
        withContext(Dispatchers.IO) {
            val req = Request.Builder()
                .url("$SUPABASE_URL/rest/v1/$table?id=eq.$id")
                .headers(supabaseHeaders())
                .patch(body.toString().toRequestBody(JSON_TYPE))
                .build()
            try {
                val resp = http.newCall(req).execute()
                if (!resp.isSuccessful) Log.e(TAG, "Patch HTTP ${resp.code}: ${resp.body?.string()}")
            } catch (e: IOException) { Log.e(TAG, "Patch failed: ${e.message}") }
        }
    }

    private suspend fun loadSession() {
        val prefs = getSharedPreferences("korjournal", MODE_PRIVATE)
        accessToken = prefs.getString("access_token", null)
        driverId    = prefs.getString("driver_id", null)
        orgId       = prefs.getString("org_id", null)
        vehicleId   = prefs.getString("vehicle_id", null)
        Log.d(TAG, "Session laddad: driver=$driverId vehicle=$vehicleId token=${if (accessToken != null) "OK" else "SAKNAS"}")
        loadGeofences()
    }

    private suspend fun loadGeofences() {
        withContext(Dispatchers.IO) {
            try {
                val req = Request.Builder()
                    .url("$SUPABASE_URL/rest/v1/geofences?is_active=eq.true&select=name,type,latitude,longitude,radius_meters,auto_trip_type")
                    .headers(supabaseHeaders())
                    .build()
                val body = http.newCall(req).execute().body?.string() ?: return@withContext
                val arr = JSONArray(body)
                geofences = (0 until arr.length()).map { i ->
                    val o = arr.getJSONObject(i)
                    Geofence(
                        name = o.getString("name"),
                        type = o.getString("type"),
                        lat  = o.getDouble("latitude"),
                        lng  = o.getDouble("longitude"),
                        radius = o.getDouble("radius_meters"),
                        autoTripType = o.optString("auto_trip_type").takeIf { it.isNotEmpty() && it != "null" }
                    )
                }
                Log.d(TAG, "Laddade ${geofences.size} geofences")
            } catch (e: Exception) {
                Log.e(TAG, "loadGeofences fel: ${e.message}")
            }
        }
    }

    private fun haversineMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val R = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2).pow(2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2)
        return R * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    private fun findGeofence(lat: Double, lng: Double): Geofence? =
        geofences.firstOrNull { haversineMeters(lat, lng, it.lat, it.lng) <= it.radius }

    // ── Geocoding / routing ───────────────────────────────────────────────────

    private suspend fun reverseGeocode(lat: Double, lng: Double): String {
        return withContext(Dispatchers.IO) {
            try {
                val req = Request.Builder()
                    .url("https://nominatim.openstreetmap.org/reverse?format=json&lat=$lat&lon=$lng&zoom=18&accept-language=sv")
                    .header("User-Agent", "Korjournal/1.0")
                    .build()
                val body = http.newCall(req).execute().body?.string() ?: return@withContext "$lat,$lng"
                val json = JSONObject(body)
                val addr = json.optJSONObject("address")
                val road = addr?.optString("road", "") ?: ""
                val num  = addr?.optString("house_number", "") ?: ""
                val city = addr?.optString("city", "") ?: addr?.optString("town", "") ?: addr?.optString("village", "") ?: ""
                listOf(if (num.isNotEmpty()) "$road $num" else road, city)
                    .filter { it.isNotEmpty() }.joinToString(", ").ifEmpty { "$lat,$lng" }
            } catch (e: Exception) { "$lat,$lng" }
        }
    }

    private suspend fun calcRouteKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Int? {
        return withContext(Dispatchers.IO) {
            try {
                val url = "https://router.project-osrm.org/route/v1/driving/$lng1,$lat1;$lng2,$lat2?overview=false"
                val body = http.newCall(Request.Builder().url(url).build()).execute().body?.string() ?: return@withContext null
                val json = JSONObject(body)
                if (json.optString("code") == "Ok") {
                    val dist = json.getJSONArray("routes").getJSONObject(0).getDouble("distance")
                    (dist / 1000).toInt()
                } else null
            } catch (e: Exception) { null }
        }
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        val ch = NotificationChannel(CHANNEL_ID, "Körjournal", NotificationManager.IMPORTANCE_LOW)
        ch.description = "Automatisk reseloggning"
        ch.setShowBadge(false)
        getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }

    private fun buildNotification(text: String): Notification {
        val stopIntent = PendingIntent.getService(
            this, 0, Intent(this, TripMonitorService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE
        )
        val openIntent = PendingIntent.getActivity(
            this, 0, packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Korjournal")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_delete, "Stoppa", stopIntent)
            .build()
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification(text))
        TripMonitorPlugin.notifyStatus(text)
    }

    private fun showTripDoneNotification(tripId: String, endAddr: String, km: Int) {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
            ?.putExtra("complete_trip_id", tripId)
        val pi = PendingIntent.getActivity(this, 2, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notif = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Resa avslutad — $km km")
            .setContentText("Tryck för att ange ändamål: $endAddr")
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        getSystemService(NotificationManager::class.java).notify(2, notif)
    }

    private fun isoNow(): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
}
