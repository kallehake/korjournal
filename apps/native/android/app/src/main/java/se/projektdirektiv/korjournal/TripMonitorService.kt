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

        val OBD_NAME_PREFIXES = listOf("vgate", "icar", "elm327", "obd", "veepeak")

        // Supabase
        const val SUPABASE_URL = "https://wpwjeilkzyhwzoirltbi.supabase.co"
        const val SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2plaWxrenlod3pvaXJsdGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMDM1OTYsImV4cCI6MjA4NjU3OTU5Nn0.M5ENENbHhUrSWbtnqhQytOiatKoXCpVJSi0u4x5qlAI"

        // Trip detection thresholds
        const val SPEED_START_KMH = 5         // Speed above this starts trip
        const val SPEED_STOP_MS = 5 * 60_000L // Stopped for 5 min → end trip
        const val POLL_INTERVAL_MS = 4_000L   // Poll OBD2 every 4 seconds
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val http = OkHttpClient()

    // BLE
    private var bleScanner: BluetoothLeScanner? = null
    private var gatt: BluetoothGatt? = null
    private var writeChar: BluetoothGattCharacteristic? = null
    private var pendingCommand: String? = null
    private val responseBuffer = StringBuilder()
    private val responseLock = Object()

    // GPS
    private var fusedLocation: FusedLocationProviderClient? = null
    private var lastLocation: Location? = null

    // Trip state
    private var tripId: String? = null
    private var tripStart: Long = 0
    private var startLat = 0.0
    private var startLng = 0.0
    private var odometerStart = 0
    private var stoppedSinceMs = 0L
    private var status = "Söker OBD2..."

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
        startForeground(NOTIF_ID, buildNotification("Söker OBD2-adapter..."))
        setupGps()
        scope.launch { loadSession() }
        scope.launch { startBleScan() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) stopSelf()
        return START_STICKY
    }

    override fun onBind(intent: Intent?) = null

    override fun onDestroy() {
        scope.cancel()
        gatt?.close()
        super.onDestroy()
    }

    // ── GPS ──────────────────────────────────────────────────────────────────

    private fun setupGps() {
        try {
            fusedLocation = LocationServices.getFusedLocationProviderClient(this)
            val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000).build()
            fusedLocation?.requestLocationUpdates(req, object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    lastLocation = result.lastLocation
                }
            }, Looper.getMainLooper())
        } catch (e: SecurityException) {
            Log.e(TAG, "GPS-tillstånd saknas: ${e.message}")
            updateNotification("GPS-tillstånd saknas — kontrollera inställningar")
        }
    }

    // ── BLE scan ─────────────────────────────────────────────────────────────

    private suspend fun startBleScan() {
        try {
            val adapter = (getSystemService(BLUETOOTH_SERVICE) as BluetoothManager).adapter
            if (adapter == null || !adapter.isEnabled) {
                updateNotification("Bluetooth avstängt — slå på för OBD2")
                return
            }
            bleScanner = adapter.bluetoothLeScanner

            updateNotification("Söker OBD2-adapter...")
            val callback = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult) {
                    try {
                        val name = result.device.name?.lowercase() ?: return
                        if (OBD_NAME_PREFIXES.none { name.contains(it) }) return
                        bleScanner?.stopScan(this)
                        Log.d(TAG, "Hittade OBD2: ${result.device.name}")
                        scope.launch { connectGatt(result.device) }
                    } catch (e: SecurityException) {
                        Log.e(TAG, "BLE scan result fel: ${e.message}")
                    }
                }

                override fun onScanFailed(errorCode: Int) {
                    Log.e(TAG, "BLE-skanning misslyckades: $errorCode")
                    updateNotification("BLE-skanning misslyckades (kod $errorCode)")
                }
            }
            bleScanner?.startScan(callback)
        } catch (e: SecurityException) {
            Log.e(TAG, "Bluetooth-tillstånd saknas: ${e.message}")
            updateNotification("Bluetooth-tillstånd saknas — kontrollera inställningar")
        } catch (e: Exception) {
            Log.e(TAG, "BLE-start fel: ${e.message}")
            updateNotification("Kunde inte starta BLE-skanning")
        }
    }

    // ── GATT connection ───────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private suspend fun connectGatt(device: BluetoothDevice) {
        updateNotification("Ansluter till ${device.name}...")
        withContext(Dispatchers.Main) {
            gatt = device.connectGatt(this@TripMonitorService, false, gattCallback)
        }
    }

    @SuppressLint("MissingPermission")
    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                g.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                gatt = null
                writeChar = null
                updateNotification("OBD2 frånkopplad — söker igen...")
                if (tripId != null) scope.launch { endTrip() }
                scope.launch { delay(5000); startBleScan() }
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            val service = g.getService(OBD_SERVICE) ?: run {
                Log.w(TAG, "OBD-tjänst hittades inte"); return
            }
            writeChar = service.getCharacteristic(OBD_WRITE)

            // Enable notifications
            val notifyChar = service.getCharacteristic(OBD_NOTIFY)
            g.setCharacteristicNotification(notifyChar, true)
            val desc = notifyChar.getDescriptor(CCCD)
            desc?.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            g.writeDescriptor(desc)

            scope.launch {
                delay(500)
                initElm327()
                updateNotification("OBD2 ansluten ✓")
                startMonitoring()
            }
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
        withContext(Dispatchers.Main) {
            char.value = (cmd + "\r").toByteArray()
            gatt?.writeCharacteristic(char)
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

    private fun parseHex(response: String, pid: String): Int? {
        val parts = response.replace(Regex("[\\r\\n>]"), " ").trim().split(Regex("\\s+"))
        val idx = parts.indexOfFirst { it.uppercase() == pid.uppercase() }
        return if (idx >= 0 && parts.size > idx + 1) parts[idx + 1].toIntOrNull(16) else null
    }

    private suspend fun readSpeedKmh(): Int? {
        val raw = sendCmd("010D")
        return parseHex(raw, "0D")
    }

    private suspend fun readOdometer(): Int? {
        val raw = sendCmd("01A6")
        val parts = raw.replace(Regex("[\\r\\n>]"), " ").trim().split(Regex("\\s+"))
        val idx = parts.indexOfFirst { it.uppercase() == "A6" }
        return if (idx >= 0 && parts.size > idx + 4) {
            val b = parts.slice(idx + 1..idx + 4).map { it.toIntOrNull(16) ?: 0 }
            ((b[0] shl 24) or (b[1] shl 16) or (b[2] shl 8) or b[3]) / 10
        } else null
    }

    private suspend fun readSoc(): Int? {
        val raw = sendCmd("015B")
        return parseHex(raw, "5B")?.let { (it * 100) / 255 }
    }

    // ── Trip monitoring loop ──────────────────────────────────────────────────

    private suspend fun startMonitoring() {
        stoppedSinceMs = 0L
        while (gatt != null) {
            val speed = readSpeedKmh()
            val moving = (speed ?: 0) >= SPEED_START_KMH

            if (moving) {
                stoppedSinceMs = 0L
                if (tripId == null) startTrip()
            } else {
                if (tripId != null) {
                    if (stoppedSinceMs == 0L) stoppedSinceMs = System.currentTimeMillis()
                    val stoppedFor = System.currentTimeMillis() - stoppedSinceMs
                    if (stoppedFor >= SPEED_STOP_MS) endTrip()
                    else updateNotification("Resa pågår — stannat ${stoppedFor / 60000} min")
                }
            }
            delay(POLL_INTERVAL_MS)
        }
    }

    // ── Trip start/end ────────────────────────────────────────────────────────

    private suspend fun startTrip() {
        if (accessToken == null || vehicleId == null) return
        val loc = lastLocation ?: return

        val odometer = readOdometer() ?: 0
        odometerStart = odometer
        startLat = loc.latitude
        startLng = loc.longitude
        tripStart = System.currentTimeMillis()

        val addr = reverseGeocode(startLat, startLng)
        val now = isoNow()

        val body = JSONObject().apply {
            put("vehicle_id", vehicleId)
            put("driver_id", driverId)
            put("organization_id", orgId)
            put("date", now.substring(0, 10))
            put("start_time", now)
            put("start_address", addr)
            put("odometer_start", odometer)
            put("trip_type", "business")
            put("status", "active")
        }

        val id = supabaseInsert("trips", body)
        tripId = id
        updateNotification("Resa startad — $addr")
        Log.d(TAG, "Trip started: $id")
    }

    private suspend fun endTrip() {
        val id = tripId ?: return
        tripId = null
        stoppedSinceMs = 0L

        val loc = lastLocation
        val endLat = loc?.latitude ?: startLat
        val endLng = loc?.longitude ?: startLng
        val endAddr = reverseGeocode(endLat, endLng)
        val distKm = calcRouteKm(startLat, startLng, endLat, endLng) ?: 0
        val endOdometer = odometerStart + distKm

        // Geofence-detektering vid destination
        val startZone = findGeofence(startLat, startLng)
        val endZone   = findGeofence(endLat, endLng)

        val autoTripType = when {
            endZone?.autoTripType != null              -> endZone.autoTripType
            endZone?.type in listOf("office","customer") -> "business"
            startZone?.type == "home"                  -> "business"
            else                                       -> "business" // default
        }
        val geofenceHint = when {
            endZone != null -> endZone.name
            else -> null
        }

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

        updateNotification("Resa sparad — $distKm km")
        showTripDoneNotification(id, endAddr, distKm)
        TripMonitorPlugin.notifyTripEnded(id, distKm, autoTripType ?: "business", geofenceHint)
        Log.d(TAG, "Trip ended: $id, $distKm km, zone: ${endZone?.name}")
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
                val arr = org.json.JSONArray(resp.body?.string() ?: "[]")
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
            try { http.newCall(req).execute() }
            catch (e: IOException) { Log.e(TAG, "Patch failed: ${e.message}") }
        }
    }

    private suspend fun loadSession() {
        val prefs = getSharedPreferences("korjournal", MODE_PRIVATE)
        accessToken = prefs.getString("access_token", null)
        driverId    = prefs.getString("driver_id", null)
        orgId       = prefs.getString("org_id", null)
        vehicleId   = prefs.getString("vehicle_id", null)
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
                Log.d(TAG, "Loaded ${geofences.size} geofences")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load geofences: ${e.message}")
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
                listOf(if (num.isNotEmpty()) "$road $num" else road, city).filter { it.isNotEmpty() }.joinToString(", ")
                    .ifEmpty { "$lat,$lng" }
            } catch (e: Exception) { "$lat,$lng" }
        }
    }

    private suspend fun calcRouteKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Int? {
        return withContext(Dispatchers.IO) {
            try {
                val url = "https://router.project-osrm.org/route/v1/driving/$lng1,$lat1;$lng2,$lat2?overview=false"
                val req = Request.Builder().url(url).build()
                val body = http.newCall(req).execute().body?.string() ?: return@withContext null
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
        status = text
        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification(text))
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun isoNow(): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
}
