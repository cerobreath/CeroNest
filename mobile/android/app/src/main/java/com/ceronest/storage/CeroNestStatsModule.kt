package com.ceronest.storage

import androidx.room.Room
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.concurrent.Executors
import kotlin.math.roundToInt

@ReactModule(name = CeroNestStatsModule.NAME)
class CeroNestStatsModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "CeroNestStatsModule"

        private val ISO_INSTANT: DateTimeFormatter =
            DateTimeFormatter.ISO_INSTANT
    }

    private val executor = Executors.newSingleThreadExecutor()

    private val db: CeroNestDatabase by lazy {
        Room.databaseBuilder(
            reactApplicationContext,
            CeroNestDatabase::class.java,
            "ceronest.db",
        ).build()
    }

    override fun getName(): String = NAME

    /**
     * JS передає:
     * locationId: string
     * hours: Array<{ time: string, temperature?: number, humidity?: number, windSpeed?: number, symbolCode?: string }>
     */
    @ReactMethod
    fun saveWeatherHours(
        locationId: String,
        hours: ReadableArray,
        promise: Promise,
    ) {
        executor.execute {
            try {
                val dao = db.weatherDao()
                val entities = mutableListOf<WeatherHourlyEntity>()

                for (i in 0 until hours.size()) {
                    val obj = hours.getMap(i) ?: continue
                    val time = obj.getString("time") ?: continue

                    val temp = obj.getDoubleOrNull("temperature")
                    val hum = obj.getDoubleOrNull("humidity")
                    val wind = obj.getDoubleOrNull("windSpeed")
                    val symbol = obj.getStringOrNull("symbolCode")

                    entities += WeatherHourlyEntity(
                        locationId = locationId,
                        timeUtc = time,
                        temperature = temp,
                        humidity = hum,
                        windSpeed = wind,
                        symbolCode = symbol,
                    )
                }

                val now = Instant.now()
                val threeDaysAgo =
                    now.minus(3, ChronoUnit.DAYS).toString()

                db.runInTransaction {
                    if (entities.isNotEmpty()) {
                        dao.insertAll(entities)
                    }
                    dao.deleteOlderThan(threeDaysAgo)
                }

                UiThreadUtil.runOnUiThread {
                    promise.resolve(null)
                }
            } catch (e: Exception) {
                UiThreadUtil.runOnUiThread {
                    promise.reject("WEATHER_SAVE_ERROR", e.message, e)
                }
            }
        }
    }

    /**
     * Отримати погодинні дані для locationId в діапазоні [fromIso, toIso]
     */
    @ReactMethod
    fun getWeatherHours(
        locationId: String,
        fromIso: String,
        toIso: String,
        promise: Promise,
    ) {
        executor.execute {
            try {
                val dao = db.weatherDao()
                val list = dao.getRange(locationId, fromIso, toIso)

                val arr: WritableArray = Arguments.createArray()
                for (e in list) {
                    val m = Arguments.createMap()
                    m.putString("time", e.timeUtc)
                    e.temperature?.let { m.putDouble("temperature", it) }
                    e.humidity?.let { m.putDouble("humidity", it) }
                    e.windSpeed?.let { m.putDouble("windSpeed", it) }
                    e.symbolCode?.let { m.putString("symbolCode", it) }
                    arr.pushMap(m)
                }

                UiThreadUtil.runOnUiThread {
                    promise.resolve(arr)
                }
            } catch (e: Exception) {
                UiThreadUtil.runOnUiThread {
                    promise.reject("WEATHER_LOAD_ERROR", e.message, e)
                }
            }
        }
    }

    /**
     * JS передає:
     * addressId: string
     * addressLabel: string (місто, вулиця, будинок)
     * items: Array<{ start: string, end: string, description: string }>
     *
     * Логіка:
     * - видалити старі записи для цієї addressId
     * - записати нові
     * - зачистити все, що старше 7 днів від сьогодні
     */
    @ReactMethod
    fun savePowerSchedule(
        addressId: String,
        addressLabel: String,
        items: ReadableArray,
        promise: Promise,
    ) {
        executor.execute {
            try {
                val dao = db.powerScheduleDao()
                val entities = mutableListOf<PowerScheduleEntity>()

                for (i in 0 until items.size()) {
                    val obj = items.getMap(i) ?: continue
                    val start = obj.getString("start") ?: continue
                    val end = obj.getString("end") ?: continue
                    val desc = obj.getString("description") ?: ""

                    entities += PowerScheduleEntity(
                        addressId = addressId,
                        addressLabel = addressLabel,
                        startUtc = start,
                        endUtc = end,
                        description = desc,
                    )
                }

                val now = Instant.now()
                val threeDaysAgo =
                    now.minus(3, ChronoUnit.DAYS).toString()

                db.runInTransaction {
                    if (entities.isNotEmpty()) {
                        dao.insertAll(entities)
                    }
                    dao.deleteOlderThan(threeDaysAgo)
                }

                UiThreadUtil.runOnUiThread {
                    promise.resolve(null)
                }
            } catch (e: Exception) {
                UiThreadUtil.runOnUiThread {
                    promise.reject("POWER_SAVE_ERROR", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun getPowerScheduleForAddress(
        addressId: String,
        fromIso: String,
        promise: Promise,
    ) {
        executor.execute {
            try {
                val dao = db.powerScheduleDao()
                val list = dao.getUpcomingForAddress(addressId, fromIso)

                val arr: WritableArray = Arguments.createArray()
                for (e in list) {
                    val m = Arguments.createMap()
                    m.putString("start", e.startUtc)
                    m.putString("end", e.endUtc)
                    m.putString("description", e.description)
                    m.putString("addressLabel", e.addressLabel)
                    arr.pushMap(m)
                }

                UiThreadUtil.runOnUiThread {
                    promise.resolve(arr)
                }
            } catch (e: Exception) {
                UiThreadUtil.runOnUiThread {
                    promise.reject("POWER_LOAD_ERROR", e.message, e)
                }
            }
        }
    }

    /**
     * Один знімок з ESP (раз на годину)
     * sample: { time: string, temperature?: number, humidity?: number, pressure?: number, light?: number }
     *
     * Логіка:
     * - вставити в esp_hourly
     * - агрегувати все старше 24 годин у esp_daily
     * - видалити агреговані esp_hourly
     * - зачистити esp_daily старше 7 днів
     */
    @ReactMethod
    fun saveEspSample(
        deviceId: String,
        sample: ReadableMap,
        promise: Promise,
    ) {
        executor.execute {
            try {
                val dao = db.espDao()
                val time = sample.getString("time")
                    ?: throw IllegalArgumentException("time is required")

                val temp = sample.getDoubleOrNull("temperature")
                val hum = sample.getDoubleOrNull("humidity")
                val press = sample.getDoubleOrNull("pressure")
                val light = sample.getDoubleOrNull("light")

                val hourly = EspHourlyEntity(
                    deviceId = deviceId,
                    timeUtc = time,
                    temperature = temp,
                    humidity = hum,
                    pressure = press,
                    light = light,
                )

                val now = Instant.now()
                val oneDayAgo = now.minus(1, ChronoUnit.DAYS).toString()
                val threeDaysAgoDate = now
                    .minus(3, ChronoUnit.DAYS)
                    .atOffset(ZoneOffset.UTC)
                    .toLocalDate()
                    .toString()

                db.runInTransaction {
                    dao.insertHourly(hourly)

                    val forAgg = dao.getHourlyBefore(oneDayAgo)
                    if (forAgg.isNotEmpty()) {
                        val dailyMap =
                            mutableMapOf<String, MutableList<EspHourlyForAggregation>>()
                        for (h in forAgg) {
                            val day = h.timeUtc.take(10)
                            val key = "${h.deviceId}#$day"
                            dailyMap.getOrPut(key) { mutableListOf() }
                                .add(h)
                        }

                        val dailyEntities = mutableListOf<EspDailyEntity>()
                        val toDeleteIds = mutableListOf<Long>()

                        for ((key, list) in dailyMap) {
                            val (devId, day) = key.split("#", limit = 2)

                            fun avgOf(selector: (EspHourlyForAggregation) -> Double?): Double? {
                                val vals = list.mapNotNull(selector)
                                if (vals.isEmpty()) return null
                                return vals.average()
                            }

                            val avgT = avgOf { it.temperature }
                            val avgH = avgOf { it.humidity }
                            val avgP = avgOf { it.pressure }
                            val avgL = avgOf { it.light }

                            dailyEntities += EspDailyEntity(
                                deviceId = devId,
                                date = day,
                                avgTemperature = avgT,
                                avgHumidity = avgH,
                                avgPressure = avgP,
                                avgLight = avgL,
                            )

                            list.forEach { toDeleteIds += it.id }
                        }

                        if (dailyEntities.isNotEmpty()) {
                            dao.insertDaily(dailyEntities)
                        }
                        if (toDeleteIds.isNotEmpty()) {
                            dao.deleteHourlyByIds(toDeleteIds)
                        }
                    }

                    dao.deleteDailyOlderThan(threeDaysAgoDate)
                }

                UiThreadUtil.runOnUiThread {
                    promise.resolve(null)
                }
            } catch (e: Exception) {
                UiThreadUtil.runOnUiThread {
                    promise.reject("ESP_SAVE_ERROR", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun getEspDaily(
        deviceId: String,
        days: Int,
        promise: Promise,
    ) {
        executor.execute {
            try {
                val now = Instant.now()
                val fromDate = now
                    .minus(days.toLong(), ChronoUnit.DAYS)
                    .atOffset(ZoneOffset.UTC)
                    .toLocalDate()
                    .toString()

                val dao = db.espDao()
                val list = dao.getDailyFromDate(deviceId, fromDate)

                val arr = Arguments.createArray()
                for (e in list) {
                    val m: WritableMap = Arguments.createMap()
                    m.putString("date", e.date)
                    e.avgTemperature?.let { m.putDouble("temperature", it) }
                    e.avgHumidity?.let { m.putDouble("humidity", it) }
                    e.avgPressure?.let { m.putDouble("pressure", it) }
                    e.avgLight?.let { m.putDouble("light", it) }
                    arr.pushMap(m)
                }

                UiThreadUtil.runOnUiThread {
                    promise.resolve(arr)
                }
            } catch (e: Exception) {
                UiThreadUtil.runOnUiThread {
                    promise.reject("ESP_LOAD_ERROR", e.message, e)
                }
            }
        }
    }
}

private fun ReadableMap.getDoubleOrNull(key: String): Double? =
    if (hasKey(key) && !isNull(key)) {
        try {
            getDouble(key)
        } catch (_: Exception) {
            null
        }
    } else null

private fun ReadableMap.getStringOrNull(key: String): String? =
    if (hasKey(key) && !isNull(key)) getString(key) else null