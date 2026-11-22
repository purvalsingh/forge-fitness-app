package app.forge.fitness.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import app.forge.fitness.ui.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.Store
import app.forge.fitness.ui.*

private data class MenuItem(val route: String, val label: String, val icon: ImageVector)
private data class MenuGroup(val title: String, val items: List<MenuItem>)

private val GROUPS = listOf(
    MenuGroup(
        title = "Plan",
        items = listOf(
            MenuItem("more/goals", "Goals", Icons.Filled.FitnessCenter),
            MenuItem("more/target", "Nutrition target", Icons.Filled.AutoAwesome),
            MenuItem("more/plan", "Workout plans", Icons.Filled.FormatListNumbered),
            MenuItem("more/coach", "Coach & training settings", Icons.Filled.Tune),
            MenuItem("physique", "Physique Lab", Icons.Filled.AutoAwesome),
            MenuItem("coach", "Ask the coach (AI)", Icons.Filled.Bolt),
        )
    ),
    MenuGroup(
        title = "Training",
        items = listOf(
            MenuItem("history", "History, heatmap & muscle map", Icons.Filled.CalendarMonth),
            MenuItem("exercises", "Exercise library", Icons.Filled.Search),
        )
    ),
    MenuGroup(
        title = "Data",
        items = listOf(
            MenuItem("more/foods", "Food database", Icons.Filled.Restaurant),
            MenuItem("more/recipes", "Quick meals", Icons.Filled.RestaurantMenu),
            MenuItem("adherence", "Monthly adherence", Icons.Filled.Today),
        )
    ),
    MenuGroup(
        title = "System",
        items = listOf(
            MenuItem("more/keys", "My Gemini AI keys", Icons.Filled.Key),
            MenuItem("more/settings", "Settings, theme & export", Icons.Filled.Settings),
            MenuItem("more/feedback", "Send feedback", Icons.Filled.Bolt),
        )
    ),
)

@Composable
fun MoreScreen(s: Store, nav: NavController) {
    val st by s.state.collectAsStateWithLifecycle()
    val profile = st.profile
    val goal = st.goal

    Screen("You", sub = "FORGE", back = null) {
        if (st.localMode) Card {
            Pill("Demo mode")
            Spacer(Modifier.height(10.dp))
            Body("You're trying FORGE without an account. Sign in to back up your data, sync devices and use AI.", size = 14)
            Spacer(Modifier.height(12.dp))
            FButton("Sign in or create an account", Modifier.fillMaxWidth()) { s.leaveDemo() }
        }
        Card(paper = true) {
            Eyebrow("Profile")
            Spacer(Modifier.height(4.dp))
            Title(profile?.display_name?.ifBlank { "Athlete" } ?: "Athlete", size = 22)
            Spacer(Modifier.height(2.dp))
            Body(
                text = if (goal != null) {
                    "${goal.mode.replaceFirstChar { it.uppercase() }} · ${goal.current_weight_kg} kg → ${goal.target_weight_kg} kg"
                } else "No goal set",
                color = F.paperDim,
                size = 12
            )
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(F.raised)
                        .padding(10.dp)
                ) {
                    Eyebrow("Your data")
                    Spacer(Modifier.height(2.dp))
                    Text(
                        if (s.api.configured && !st.localMode) "Synced to your account" else "On this phone only",
                        color = F.text,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                }
                Column(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(F.raised)
                        .padding(10.dp)
                ) {
                    Eyebrow("AI")
                    Spacer(Modifier.height(2.dp))
                    Text(
                        if (s.api.configured && !st.localMode) "On" else "Off without an account",
                        color = F.text,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                }
            }
        }

        GROUPS.forEach { g ->
            Spacer(Modifier.height(4.dp))
            Eyebrow(g.title)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                g.items.forEach { item ->
                    Card(onClick = { nav.navigate(item.route) }) {
                        Row(
                            Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(item.icon, contentDescription = null, tint = F.accent, modifier = Modifier.size(20.dp))
                            Text(
                                item.label,
                                modifier = Modifier.weight(1f),
                                color = F.text,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowForwardIos,
                                contentDescription = null,
                                tint = F.mute,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(4.dp))
        Card(onClick = { nav.navigate("progress") }) {
            Eyebrow("Insights")
            Spacer(Modifier.height(4.dp))
            Body(
                if (st.insights.isNotEmpty()) st.insights.first().text
                else "AI insights appear here once Gemini is configured and you have a few days of data.",
                size = 13
            )
        }
    }
}
