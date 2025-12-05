package com.ceronest.storage

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query as RoomQuery
import androidx.room.RoomDatabase

@Entity(tableName = "weather_hourly")
data class WeatherHourlyEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,

    @ColumnInfo(name = "location_id")
    val locationId: String,

    @ColumnInfo(name = "time_utc")
    val timeUtc: String,

    @ColumnInfo(name = "temperature")
    val temperature: Double?,

    @ColumnInfo(name = "humidity")
    val humidity: Double?,

    @ColumnInfo(name = "wind_speed")
    val windSpeed: Double?,

    @ColumnInfo(name = "symbol_code")
    val symbolCode: String?,
)

@Dao
interface WeatherDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun insertAll(items: List<WeatherHourlyEntity>)

    @RoomQuery(
        """
        SELECT * FROM weather_hourly
        WHERE location_id = :locationId
          AND time_utc BETWEEN :fromIso AND :toIso
        ORDER BY time_utc ASC
        """
    )
    fun getRange(
        locationId: String,
        fromIso: String,
        toIso: String,
    ): List<WeatherHourlyEntity>

    @RoomQuery(
        "DELETE FROM weather_hourly WHERE time_utc < :minIso"
    )
    fun deleteOlderThan(minIso: String)
}

@Entity(tableName = "power_schedule")
data class PowerScheduleEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,

    @ColumnInfo(name = "address_id")
    val addressId: String,

    @ColumnInfo(name = "address_label")
    val addressLabel: String,

    @ColumnInfo(name = "start_utc")
    val startUtc: String,

    @ColumnInfo(name = "end_utc")
    val endUtc: String,

    @ColumnInfo(name = "description")
    val description: String,
)

@Dao
interface PowerScheduleDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun insertAll(items: List<PowerScheduleEntity>)

    @RoomQuery(
        """
        SELECT * FROM power_schedule
        WHERE address_id = :addressId
          AND end_utc >= :fromIso
        ORDER BY start_utc ASC
        """
    )
    fun getUpcomingForAddress(
        addressId: String,
        fromIso: String,
    ): List<PowerScheduleEntity>

    @RoomQuery(
        "DELETE FROM power_schedule WHERE end_utc < :minIso"
    )
    fun deleteOlderThan(minIso: String)

    @RoomQuery(
        "DELETE FROM power_schedule WHERE address_id = :addressId"
    )
    fun deleteForAddress(addressId: String)
}

@Entity(tableName = "esp_hourly")
data class EspHourlyEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,

    @ColumnInfo(name = "device_id")
    val deviceId: String,

    @ColumnInfo(name = "time_utc")
    val timeUtc: String,

    @ColumnInfo(name = "temperature")
    val temperature: Double?,

    @ColumnInfo(name = "humidity")
    val humidity: Double?,

    @ColumnInfo(name = "pressure")
    val pressure: Double?,

    @ColumnInfo(name = "light")
    val light: Double?,
)

@Entity(
    tableName = "esp_daily",
    primaryKeys = ["device_id", "date"]
)
data class EspDailyEntity(
    @ColumnInfo(name = "device_id")
    val deviceId: String,

    @ColumnInfo(name = "date")
    val date: String,

    @ColumnInfo(name = "avg_temperature")
    val avgTemperature: Double?,

    @ColumnInfo(name = "avg_humidity")
    val avgHumidity: Double?,

    @ColumnInfo(name = "avg_pressure")
    val avgPressure: Double?,

    @ColumnInfo(name = "avg_light")
    val avgLight: Double?,
)

data class EspHourlyForAggregation(
    @ColumnInfo(name = "device_id")
    val deviceId: String,
    @ColumnInfo(name = "time_utc")
    val timeUtc: String,
    @ColumnInfo(name = "temperature")
    val temperature: Double?,
    @ColumnInfo(name = "humidity")
    val humidity: Double?,
    @ColumnInfo(name = "pressure")
    val pressure: Double?,
    @ColumnInfo(name = "light")
    val light: Double?,
    @ColumnInfo(name = "id")
    val id: Long,
)

@Dao
interface EspDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun insertHourly(item: EspHourlyEntity)

    @RoomQuery(
        """
        SELECT id, device_id, time_utc, temperature, humidity, pressure, light
        FROM esp_hourly
        WHERE time_utc < :maxIso
        ORDER BY device_id, time_utc
        """
    )
    fun getHourlyBefore(maxIso: String): List<EspHourlyForAggregation>

    @RoomQuery(
        "DELETE FROM esp_hourly WHERE id IN (:ids)"
    )
    fun deleteHourlyByIds(ids: List<Long>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun insertDaily(items: List<EspDailyEntity>)

    @RoomQuery(
        """
        SELECT * FROM esp_daily
        WHERE device_id = :deviceId
          AND date >= :fromDate
        ORDER BY date ASC
        """
    )
    fun getDailyFromDate(
        deviceId: String,
        fromDate: String,
    ): List<EspDailyEntity>

    @RoomQuery(
        "DELETE FROM esp_daily WHERE date < :minDate"
    )
    fun deleteDailyOlderThan(minDate: String)
}

@Database(
    entities = [
        WeatherHourlyEntity::class,
        PowerScheduleEntity::class,
        EspHourlyEntity::class,
        EspDailyEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class CeroNestDatabase : RoomDatabase() {
    abstract fun weatherDao(): WeatherDao
    abstract fun powerScheduleDao(): PowerScheduleDao
    abstract fun espDao(): EspDao
}