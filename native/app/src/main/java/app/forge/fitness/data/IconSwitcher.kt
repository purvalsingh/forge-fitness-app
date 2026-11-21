package app.forge.fitness.data

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import app.forge.fitness.ui.PALETTES

/**
 * Makes the home-screen icon match the chosen gradient theme by enabling exactly one launcher alias
 * (AndroidManifest.xml `.Icon_<theme>`). Some launchers take a few seconds to redraw the icon.
 */
object IconSwitcher {
    fun apply(ctx: Context, palette: String) {
        val pm = ctx.packageManager
        val target = if (palette in PALETTES) palette else "monsoon"
        // Enable the new one first so there is never a moment with no launcher icon.
        PALETTES.keys.sortedBy { if (it == target) 0 else 1 }.forEach { k ->
            val state = if (k == target) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
            val cn = ComponentName(ctx, "app.forge.fitness.Icon_$k")
            if (pm.getComponentEnabledSetting(cn) != state || k == target) pm.setComponentEnabledSetting(cn, state, PackageManager.DONT_KILL_APP)
        }
    }
}
