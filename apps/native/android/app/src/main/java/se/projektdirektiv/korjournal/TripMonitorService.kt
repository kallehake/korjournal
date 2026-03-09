package se.projektdirektiv.korjournal

import android.annotation.SuppressLint
import android.app.*
import android.bluetooth.*
import android.bluetooth.le.*
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

        // BLE UUIDs för ELM327/Vgate iCar Pro 2S
        // Primärt: filtrera på tjänste-UUID (mer tillförlitligt än namn)
        val OBD_SERVICE: UUID = UUID.fromString("0000fff0-0000-1000-8000-00805f9b34fb")
        val OBD_WRITE: UUID   = UUID.fromString("0000fff2-0000-1000-8000-00805f9b34fb")
        val OBD_NOTIFY: UUID  = UUID.fromString("0000fff1-0000-1000-8000-00805f9b34fb")
        val CCCD: UUID        = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        // Supabase
        const val SUPABASE_URL = "https://wpwjeilkzyhwzoirltbi.supabase.co"
        const val SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2plaWxrenlod3pvaXJsdGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMDM1OTYsImV4cCI6MjA4NjU3OTU5Nn0.M5ENENbHhUrSWbtnqhQytOiatKoXCpVJSi0u4x5qlAI"

        // Tröskelgränser
        const val SPEED_START_KMH = 5          // OBD2-hastighet för att starta resa
        const val SPEED_STOP_DURATION = 5 * 60_000L  // Stannat 5 min → avsluta resa
        const val POLL_INTERVAL_MS = 4_000L    // Polla OBD2 var 4:e sekund
        const val BLE_RETRY_MS = 30_000L       // Försök ny BLE-skanning var 30:e sekund
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val http = OkHttpClient()

    // BLE / OBD2
    private var bleScanner: BluetoothLeScanner? = null
    private var gatt: BluetoothGatt? = null
    private var writeChar: BluetoothGattCharacteristic? = null
    private val responseBuffer = StringBuilder()
    private val responseLock = Object()
    private var obd2Connected = false
    private var scanning = false

    // GPS — används bara för position/adress, INTE för resedetektering
    private var fusedLocation: FusedLocationProviderClient? = null
    private var lastLocation: Location? = null
    private var locationCallback: LocationCallback? = null

    // Resa-state
    private var tripId: String? = null
    private var startLat = 0.0
    private var startLng = 0.0
    private var odometerStart = 0
    private var stoppedSince = 0L

    // Geofences
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
        scope.launch { bleLoop() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) stopSelf()
        return START_STICKY
    }

    override fun onBind(intent: Intent?) = null

    override fun onDestroy() {
        scope.cancel()
        try { fusedLocation?.removeLocationUpdates(locationCallback ?: return) } catch (_: Exception) {}
        try { gatt?.close() } catch (_: Exception) {}
        super.onDestroy()
    }

    // ── GPS — position och adress ─────────────────────────────────────────────
    // OBS: GPS används INTE för resedetektering — OBD2-hastighet avgör det.
    // Utan OBD2-anslutning loggas inga resor alls.

    private fun setupGps() {
        try {
            fusedLocation = LocationServices.getFusedLocationProviderClient(this)
            val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000)
                .setMinUpdateDistanceMeters(20f)
                .build()
            locationCallback = object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    lastLocation = result.lastLocation
                }
            }
            fusedLocation?.requestLocationUpdates(req, locationCallback!!, Looper.getMainLooper())
        } catch (e: SecurityException) {
            Log.e(TAG, "GPS-tillstånd saknas: ${e.message}")
            updateNotification("GPS-tillstånd saknas — adresser ej tillgängliga")
        }
    }

    // ── BLE-loop: skanna → anslut → övervaka → repetera ─────────────────────

    private suspend fun bleLoop() {
        while (true) {
            if (!obd2Connected) {
                updateNotification("Söker OBD2-adapter...")
                startBleScan()
            }
            delay(BLE_RETRY_MS)
        }
    }

    private suspend fun startBleScan() {
        if (scanning) return
        try {
            val adapter = (getSystemService(BLUETOOTH_SERVICE) as BluetoothManager).adapter
            if (adapter == null || !adapter.isEnabled) {
                updateNotification("Bluetooth avstängt — slå på för att logga resor")
                return
            }
            bleScanner = adapter.bluetoothLeScanner ?: return

            // Filtrera på OBD2-tjänstens UUID — fungerar oavsett enhetsnamn
            val filter = ScanFilter.Builder()
                .setServiceUuid(android.os.ParcelUuid(OBD_SERVICE))
                .build()
            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build()

            scanning = true
            val callback = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult) {
                    if (obd2Connected) return
                    val name = try { result.device.name } catch (_: SecurityException) { "okänd" }
                    Log.d(TAG, "Hittade OBD2-enhet: $name (${result.device.address})")
                    try { bleScanner?.stopScan(this) } catch (_: Exception) {}
                    scanning = false
                    scope.launch { connectGatt(result.device) }
                }

                override fun onScanFailed(errorCode: Int) {
                    Log.e(TAG, "BLE-skanning misslyckades: kod $errorCode")
                    scanning = false
                }
            }

            bleScanner?.startScan(listOf(filter), settings, callback)
            Log.d(TAG, "BLE-skanning startad (UUID-filter)")

            // Stoppa skanningen efter 25s om inget hittats (sparar batteri)
            delay(25_000)
            if (scanning) {
                try { bleScanner?.stopScan(callback) } catch (_: Exception) {}
                scanning = false
                Log.d(TAG, "BLE-skanning timeout — försöker igen om ${BLE_RETRY_MS/1000}s")
            }
        } catch (e: SecurityException) {
            scanning = false
            Log.e(TAG, "Bluetooth-tillstånd saknas: ${e.message}")
            updateNotification("Bluetooth-tillstånd saknas — kontrollera inställningar")
        } catch (e: Exception) {
            scanning = false
            Log.e(TAG, "BLE-fel: ${e.message}")
        }
    }

    // ── GATT anslutning ───────────────────────────────────────────────────────

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
                updateNotification("OBD2 ansluten — väntar på rörelse")
                g.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                obd2Connected = false
                gatt = null
                writeChar = null
                Log.d(TAG, "OBD2 frånkopplad (status=$status)")
                if (tripId != null) scope.launch { endTrip() }
                updateNotification("OBD2 frånkopplad — söker igen...")
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            val service = g.getService(OBD_SERVICE)
            if (service == null) {
                Log.w(TAG, "OBD2-tjänst hittades inte på enheten")
                return
            }
            writeChar = service.getCharacteristic(OBD_WRITE)
            try {
                val notifyChar = service.getCharacteristic(OBD_NOTIFY)
                g.setCharacteristicNotification(notifyChar, true)
                val desc = notifyChar.getDescriptor(CCCD)
                desc?.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                g.writeDescriptor(desc)
            } catch (e: SecurityException) {
                Log.e(TAG, "GATT notifications SecurityException: ${e.message}")
            }
            scope.launch {
                delay(500)
                initElm327()
                Log.d(TAG, "ELM327 initierad — startar OBD2-övervakning")
                startObd2Monitoring()
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

    // ── ELM327-kommandon ──────────────────────────────────────────────────────

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
            Log.e(TAG, "sendCmd SecurityException"); return ""
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

    private suspend fun readSpeedKmh(): Int? {
        val raw = sendCmd("010D")
        val parts = raw.replace(Regex("[\\r\\n>]"), " ").trim().split(Regex("\\s+"))
        val idx = parts.indexOfFirst { it.uppercase() == "0D" }
        return if (idx >= 0 && parts.size > idx + 1) parts[idx + 1].toIntOrNull(16) else null
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

    // ── OBD2-reseövervakning (körs bara när OBD2 är ansluten) ────────────────

    private suspend fun startObd2Monitoring() {
        stoppedSince = 0L
        while (obd2Connected) {
            val speed = readSpeedKmh() ?: 0

            if (speed >= SPEED_START_KMH) {
                stoppedSince = 0L
                if (tripId == null) startTrip()
                else updateNotification("Resa pågår — $speed km/h")
            } else {
                if (tripId != null) {
                    if (stoppedSince == 0L) stoppedSince = System.currentTimeMillis()
                    val stoppedFor = System.currentTimeMillis() - stoppedSince
                    if (stoppedFor >= SPEED_STOP_DURATION) {
                        endTrip()
                    } else {
                        updateNotification("Resa pågår — stannat ${stoppedFor / 60_000} min (avslutar vid 5 min)")
                    }
                } else {
                    updateNotification("OBD2 ansluten — väntar på rörelse")
                }
            }
            delay(POLL_INTERVAL_MS)
        }
        Log.d(TAG, "OBD2-övervakning avslutad (OBD2 frånkopplad)")
    }

    // ── Resa start/slut ───────────────────────────────────────────────────────

    private suspend fun startTrip() {
        if (accessToken == null || vehicleId == null) {
            Log.w(TAG, "startTrip: session saknas — kör utan auth")
            return
        }
        val loc = lastLocation
        startLat = loc?.latitude ?: 0.0
        startLng = loc?.longitude ?: 0.0
        odometerStart = readOdometer() ?: 0

        val addr = if (loc != null) reverseGeocode(startLat, startLng) else "okänd adress"
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
            updateNotification("Resa startad — $addr")
            TripMonitorPlugin.notifyTripStarted(id)
            Log.d(TAG, "Trip started: $id")
        } else {
            Log.e(TAG, "startTrip: kunde inte spara i Supabase")
            updateNotification("Fel: kunde inte spara resa")
        }
    }

    private suspend fun endTrip() {
        val id = tripId ?: return
        tripId = null
        stoppedSince = 0L

        val loc = lastLocation
        val endLat = loc?.latitude ?: startLat
        val endLng = loc?.longitude ?: startLng
        val endAddr = if (loc != null) reverseGeocode(endLat, endLng) else "okänd adress"

        val odomEnd = readOdometer()
        val distKm: Int
        val endOdometer: Int
        if (odomEnd != null && odometerStart > 0 && odomEnd > odometerStart) {
            distKm = odomEnd - odometerStart
            endOdometer = odomEnd
        } else {
            distKm = calcRouteKm(startLat, startLng, endLat, endLng) ?: 0
            endOdometer = odometerStart + distKm
        }

        val startZone = findGeofence(startLat, startLng)
        val endZone   = findGeofence(endLat, endLng)
        val autoTripType = when {
            endZone?.autoTripType != null                  -> endZone.autoTripType
            endZone?.type in listOf("office", "customer")  -> "business"
            startZone?.type == "home"                      -> "business"
            else                                           -> "business"
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
        TripMonitorPlugin.notifyTripEnded(id, distKm, autoTripType ?: "business", endZone?.name)
        Log.d(TAG, "Trip ended: $id $distKm km zone=${endZone?.name}")
    }

    // ── Supabase HTTP ─────────────────────────────────────────────────────────

    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

    private fun supabaseHeaders() = Headers.Builder()
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
                if (!resp.isSuccessful) { Log.e(TAG, "Insert HTTP ${resp.code}: $text"); return@withContext null }
                val arr = JSONArray(text)
                if (arr.length() > 0) arr.getJSONObject(0).optString("id") else null
            } catch (e: IOException) { Log.e(TAG, "Insert IOException: ${e.message}"); null }
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
            } catch (e: IOException) { Log.e(TAG, "Patch IOException: ${e.message}") }
        }
    }

    private suspend fun loadSession() {
        val prefs = getSharedPreferences("korjournal", MODE_PRIVATE)
        accessToken = prefs.getString("access_token", null)
        driverId    = prefs.getString("driver_id", null)
        orgId       = prefs.getString("org_id", null)
        vehicleId   = prefs.getString("vehicle_id", null)
        Log.d(TAG, "Session: driver=$driverId vehicle=$vehicleId token=${if (accessToken != null) "OK" else "SAKNAS"}")
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
            } catch (e: Exception) { Log.e(TAG, "loadGeofences: ${e.message}") }
        }
    }

    private fun findGeofence(lat: Double, lng: Double): Geofence? {
        val R = 6371000.0
        return geofences.firstOrNull { g ->
            val dLat = Math.toRadians(g.lat - lat)
            val dLng = Math.toRadians(g.lng - lng)
            val a = sin(dLat/2).pow(2) + cos(Math.toRadians(lat)) * cos(Math.toRadians(g.lat)) * sin(dLng/2).pow(2)
            R * 2 * atan2(sqrt(a), sqrt(1-a)) <= g.radius
        }
    }

    // ── Geokodning / ruttberäkning ────────────────────────────────────────────

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
                if (json.optString("code") == "Ok")
                    (json.getJSONArray("routes").getJSONObject(0).getDouble("distance") / 1000).toInt()
                else null
            } catch (e: Exception) { null }
        }
    }

    // ── Notiser ───────────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        val ch = NotificationChannel(CHANNEL_ID, "Körjournal", NotificationManager.IMPORTANCE_LOW)
        ch.description = "Automatisk reseloggning"; ch.setShowBadge(false)
        getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }

    private fun buildNotification(text: String): Notification {
        val stopPi = PendingIntent.getService(this, 0,
            Intent(this, TripMonitorService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE)
        val openPi = PendingIntent.getActivity(this, 0,
            packageManager.getLaunchIntentForPackage(packageName), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Korjournal")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setOngoing(true)
            .setContentIntent(openPi)
            .addAction(android.R.drawable.ic_delete, "Stoppa", stopPi)
            .build()
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification(text))
        TripMonitorPlugin.notifyStatus(text)
    }

    private fun showTripDoneNotification(tripId: String, endAddr: String, km: Int) {
        val pi = PendingIntent.getActivity(this, 2,
            packageManager.getLaunchIntentForPackage(packageName)?.putExtra("complete_trip_id", tripId),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        getSystemService(NotificationManager::class.java).notify(2,
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Resa avslutad — $km km")
                .setContentText("Tryck för att ange ändamål: $endAddr")
                .setSmallIcon(android.R.drawable.ic_menu_directions)
                .setAutoCancel(true).setContentIntent(pi).build())
    }

    private fun isoNow() = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
}
