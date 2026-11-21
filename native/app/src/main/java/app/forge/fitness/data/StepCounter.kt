package app.forge.fitness.data

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import app.forge.fitness.logic.Calc

/**
 * Automatic steps from the phone's hardware step counter (the same chip Google Fit uses; it counts in a
 * pocket or bag even while the app is closed). The sensor reports steps since boot, so we keep a per-day
 * baseline. A new day's baseline is the last reading we saw, so steps walked while the app was closed are
 * still counted once you open it.
 * ponytail: steps between your last open yesterday and midnight land on today; a periodic worker that
 * snapshots at the day boundary fixes that if it ever matters.
 */
class StepCounter(ctx: Context, private val onSteps: (date: String, steps: Int) -> Unit) : SensorEventListener {
    private val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val sensor: Sensor? = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    private val prefs = ctx.getSharedPreferences("forge_steps", Context.MODE_PRIVATE)
    val available get() = sensor != null

    fun start() { sensor?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) } }
    fun stop() = sm.unregisterListener(this)

    override fun onSensorChanged(e: SensorEvent) {
        val total = e.values[0].toLong()
        val today = Calc.today()
        var base = prefs.getLong("base", -1)
        var carried = prefs.getLong("carried", 0)   // steps counted today before a reboot reset the chip
        val last = prefs.getLong("last", -1)
        val day = prefs.getString("day", null)
        when {
            base < 0 -> { base = total; carried = 0 }                     // first ever reading: start counting now
            day != today -> { base = if (last in 0..total) last else 0; carried = 0 }  // new day
            total < last -> { carried += (last - base).coerceAtLeast(0); base = 0 }   // rebooted: keep what was counted
        }
        prefs.edit().putLong("base", base).putLong("carried", carried).putLong("last", total).putString("day", today).apply()
        onSteps(today, (carried + total - base).toInt().coerceAtLeast(0))
    }
    override fun onAccuracyChanged(s: Sensor?, a: Int) {}
}
