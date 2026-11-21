package app.forge.fitness.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import app.forge.fitness.R

/**
 * "Monsoon": liquid-glass cards floating on a soft gradient. The user picks the gradient (a Palette);
 * every card, button, ring and the water wave take their colours from it. Lime = done, blue = protein.
 */
@Immutable data class Palette(val label: String, val g1: Long, val g2: Long, val g3: Long, val a1: Long, val a2: Long)

val PALETTES = linkedMapOf(
    "monsoon" to Palette("Monsoon", 0xFFD7F3EE, 0xFFB9E3F2, 0xFFC9C6F5, 0xFF1A7F92, 0xFF3D5FE8),
    "dusk" to Palette("Saffron dusk", 0xFFFFE6CC, 0xFFFFC7B4, 0xFFF6CBE3, 0xFFD0501F, 0xFFD13A6C),
    "lagoon" to Palette("Lagoon", 0xFFDDF7E6, 0xFFBFEFE0, 0xFFB8E0F2, 0xFF137A58, 0xFF1F86A3),
    "lilac" to Palette("Lilac", 0xFFEFE6FF, 0xFFDAD5FB, 0xFFF8D8EC, 0xFF6747CF, 0xFFC23A6C),
    "citrus" to Palette("Citrus", 0xFFFFF7CC, 0xFFFFE4A8, 0xFFFFD2BC, 0xFFB45F00, 0xFFD2452D),
    "rose" to Palette("Rose quartz", 0xFFFFE9EE, 0xFFF7D3E2, 0xFFE3D9F7, 0xFFC23866, 0xFF8649D6),
)
/** Night gradient used when the user picks dark mode; the palette's accent pair stays. */
private val NIGHT = Triple(0xFF0E1A2B, 0xFF132A3E, 0xFF221D40)

/** Back-compat for code that lists accents: name -> (main, deep, ink). */
val ACCENTS: Map<String, Triple<Long, Long, Long>> = PALETTES.mapValues { (_, p) -> Triple(p.a1, p.a2, 0xFFFFFFFF) }

@Immutable data class ForgeColors(
    val bg: Color, val bgBrush: Brush, val surface: Color, val raised: Color, val high: Color, val line: Color,
    val paper: Color, val paperInk: Color, val paperDim: Color,
    val text: Color, val dim: Color, val mute: Color,
    val accent: Color, val accent2: Color, val accentDeep: Color, val accentInk: Color, val accentSoft: Color,
    val dark: Boolean,
    val lime: Color = Color(0xFF1E9E74), val protein: Color = Color(0xFF4C6FFF), val carbs: Color = Color(0xFFE3A12E),
    val fat: Color = Color(0xFFE0577C), val danger: Color = Color(0xFFD64545),
    val turmeric: Color = Color(0xFFF2B33D), val turmericSoft: Color = Color(0x73FFFFFF),
    val mint: Color = Color(0xFF1E9E74), val mintSoft: Color = Color(0x66FFFFFF),
) {
    /** The palette's accent gradient, used for primary actions and selected states. */
    val accentBrush get() = Brush.linearGradient(listOf(accent, accent2))
}

/**
 * Apple-Health-style surfaces: grouped grey background, solid white cards, hairline separators, one solid accent
 * (from the chosen palette). No glass, no gradients behind content.
 */
fun forgeColors(dark: Boolean, palette: String): ForgeColors {
    val p = PALETTES[palette] ?: PALETTES.getValue("monsoon")
    val a1 = Color(p.a1); val a2 = Color(p.a2)
    return if (!dark) ForgeColors(
        bg = Color(p.g2), bgBrush = Brush.linearGradient(listOf(Color(p.g1), Color(p.g2), Color(p.g3)),
            start = androidx.compose.ui.geometry.Offset(0f, 0f), end = androidx.compose.ui.geometry.Offset(600f, 2200f)),
        surface = Color(0x9EFFFFFF), raised = Color(0x80FFFFFF), high = Color(0xA6FFFFFF), line = Color(0x1F0F2A3A),
        paper = Color.White, paperInk = Color(0xFF000000), paperDim = Color(0xFF636366),
        text = Color(0xFF000000), dim = Color(0xFF3A3A3C), mute = Color(0xFF6C6C70),
        accent = a1, accent2 = a2, accentDeep = a2, accentInk = Color.White, accentSoft = a1.copy(alpha = .12f), dark = false,
        lime = Color(0xFF248A3D), protein = Color(0xFF0A60D6), carbs = Color(0xFFB25E00), fat = Color(0xFFD70040),
        danger = Color(0xFFD70015), turmericSoft = Color(0xFFF2F2F7), mint = Color(0xFF248A3D), mintSoft = Color(0xFFE8F5EC),
    ) else ForgeColors(
        bg = Color(0xFF132A3E), bgBrush = Brush.linearGradient(listOf(Color(0xFF0E1A2B), Color(0xFF132A3E), Color(0xFF221D40)),
            end = androidx.compose.ui.geometry.Offset(600f, 2200f)),
        surface = Color(0x1FFFFFFF), raised = Color(0x14FFFFFF), high = Color(0x29FFFFFF), line = Color(0x24FFFFFF),
        paper = Color(0xFF1C1C1E), paperInk = Color.White, paperDim = Color(0xFFAEAEB2),
        text = Color.White, dim = Color(0xFFD1D1D6), mute = Color(0xFF98989F),
        accent = a1.copy(red = minOf(1f, a1.red * 1.15f), green = minOf(1f, a1.green * 1.15f), blue = minOf(1f, a1.blue * 1.15f)),
        accent2 = a2, accentDeep = a2, accentInk = Color.White, accentSoft = a1.copy(alpha = .22f), dark = true,
        lime = Color(0xFF30D158), protein = Color(0xFF409CFF), carbs = Color(0xFFFFB340), fat = Color(0xFFFF6482),
        danger = Color(0xFFFF453A), turmericSoft = Color(0xFF2C2C2E), mint = Color(0xFF30D158), mintSoft = Color(0xFF1E3A26),
    )
}

val Figtree = FontFamily(
    Font(R.font.figtree_400, FontWeight.Normal), Font(R.font.figtree_500, FontWeight.Medium),
    Font(R.font.figtree_600, FontWeight.SemiBold), Font(R.font.figtree_700, FontWeight.Bold),
    Font(R.font.figtree_800, FontWeight.ExtraBold),
)
/** Display face for titles and big numbers. */
val Display = FontFamily(Font(R.font.dmsans_500, FontWeight.Medium), Font(R.font.dmsans_700, FontWeight.Bold))

private val base = TextStyle(fontFamily = Figtree)
private val type = Typography(
    displayLarge = base, displayMedium = base, displaySmall = base, headlineLarge = base, headlineMedium = base,
    headlineSmall = base, titleLarge = base, titleMedium = base, titleSmall = base, bodyLarge = base, bodyMedium = base,
    bodySmall = base, labelLarge = base, labelMedium = base, labelSmall = base,
)

val LocalForge = staticCompositionLocalOf { forgeColors(false, "monsoon") }
val F: ForgeColors @Composable get() = LocalForge.current

@Composable fun ForgeTheme(dark: Boolean, accent: String, content: @Composable () -> Unit) {
    val c = forgeColors(dark, accent)
    val solid = if (dark) Color(0xFF16263A) else Color.White
    val scheme = if (dark) darkColorScheme(primary = c.accent, onPrimary = c.accentInk, background = c.bg, surface = solid,
        onBackground = c.text, onSurface = c.text, surfaceVariant = c.raised, outline = c.line, error = c.danger,
        surfaceContainerLow = solid, surfaceContainer = solid, surfaceContainerHigh = solid, surfaceContainerHighest = c.surface, surfaceContainerLowest = solid)
    else lightColorScheme(primary = c.accent, onPrimary = c.accentInk, background = c.bg, surface = solid,
        onBackground = c.text, onSurface = c.text, surfaceVariant = c.raised, outline = c.line, error = c.danger,
        surfaceContainerLow = solid, surfaceContainer = solid, surfaceContainerHigh = solid, surfaceContainerHighest = c.surface, surfaceContainerLowest = solid)
    CompositionLocalProvider(LocalForge provides c) { MaterialTheme(colorScheme = scheme, typography = type, content = content) }
}
