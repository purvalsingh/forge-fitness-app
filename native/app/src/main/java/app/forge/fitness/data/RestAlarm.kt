package app.forge.fitness.data

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import app.forge.fitness.MainActivity
import app.forge.fitness.R

/**
 * Rest-over alert that still fires with the phone locked in a pocket. While the app is on screen the Session
 * screen buzzes itself and cancels this; once the screen is off, the screen's own timer stops running and this
 * system alarm takes over.
 */
object RestAlarm {
    private const val CHANNEL = "rest"
    private fun pending(ctx: Context) = PendingIntent.getBroadcast(ctx, 7, Intent(ctx, RestAlarmReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun schedule(ctx: Context, atMillis: Long) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
        runCatching {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending(ctx))
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending(ctx)) // ponytail: may run a little late without exact-alarm permission
        }
    }

    fun cancel(ctx: Context) { ctx.getSystemService(AlarmManager::class.java)?.cancel(pending(ctx)) }

    internal fun notify(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Rest timer", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Tells you when your rest between sets is over"
                enableVibration(true); vibrationPattern = longArrayOf(0, 300, 150, 300, 150, 300)
            })
        val open = PendingIntent.getActivity(ctx, 8, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_mono)
            .setContentTitle(app.forge.fitness.ui.I18n.t("Rest over"))
            .setContentText(app.forge.fitness.ui.I18n.t("Time for your next set."))
            .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVibrate(longArrayOf(0, 300, 150, 300, 150, 300)).setAutoCancel(true).setContentIntent(open).build()
        runCatching { nm.notify(7, n) }
    }
}

class RestAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) = RestAlarm.notify(ctx)
}
