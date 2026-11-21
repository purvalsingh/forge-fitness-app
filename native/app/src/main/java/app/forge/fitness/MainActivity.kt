package app.forge.fitness

import app.forge.fitness.ui.Text

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.*
import app.forge.fitness.data.Store
import app.forge.fitness.data.StepCounter
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.result.contract.ActivityResultContracts
import app.forge.fitness.screens.*
import app.forge.fitness.ui.*

class MainActivity : ComponentActivity() {
    private val store: Store by viewModels()
    private val steps by lazy { StepCounter(this) { d, n -> store.onSensorSteps(d, n) } }
    private val askActivity = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) steps.start() }

    /** Start the step sensor; Android 10+ asks once for "Physical activity" permission. */
    private fun startSteps() {
        if (!store.autoSteps.value || !steps.available) return
        if (Build.VERSION.SDK_INT >= 29 && checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED)
            askActivity.launch(Manifest.permission.ACTIVITY_RECOGNITION)
        else steps.start()
    }
    override fun onResume() { super.onResume(); store.onResume(); startSteps() }
    override fun onPause() { super.onPause(); steps.stop() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val theme by store.theme.collectAsStateWithLifecycle()
            val accent by store.accent.collectAsStateWithLifecycle()
            val dark = if (theme == "system") androidx.compose.foundation.isSystemInDarkTheme() else theme == "dark"
            LaunchedEffect(dark) {
                val bar = if (dark) androidx.activity.SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                    else androidx.activity.SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
                enableEdgeToEdge(bar, bar)
            }
            ForgeTheme(dark, accent) { App(store) }
        }
    }
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)
private val TABS = listOf(
    Tab("today", "Today", Icons.Rounded.Home), Tab("diet", "Food", Icons.Rounded.RamenDining),
    Tab("workout", "Train", Icons.Rounded.FitnessCenter), Tab("progress", "Progress", Icons.Rounded.Insights),
    Tab("more", "You", Icons.Rounded.Person),
)

@Composable fun App(store: Store) {
    val st by store.state.collectAsStateWithLifecycle()
    if (!st.ready) { Box(Modifier.fillMaxSize().background(F.bgBrush), contentAlignment = Alignment.Center) { Spinner("Loading") }; return }
    if (!st.signedIn) { Box(Modifier.fillMaxSize().background(F.bgBrush)) { AuthScreen(store) }; return }
    var update by remember { mutableStateOf<app.forge.fitness.data.Updater.Release?>(null) }
    LaunchedEffect(Unit) { update = app.forge.fitness.data.Updater.check() }
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    Box(Modifier.fillMaxSize()) { LiquidBackground()
    Scaffold(containerColor = androidx.compose.ui.graphics.Color.Transparent, bottomBar = {
        if (route in TABS.map { it.route }) GlassNav(route) { r ->
            // Today is the start screen: going "to" it means popping back to it. Saving/restoring
            // Today's own state on the way there made the tap a no-op (the bug users hit).
            if (r == "today") { if (!nav.popBackStack("today", false)) nav.navigate("today") }
            else nav.navigate(r) { popUpTo("today") { saveState = true }; launchSingleTop = true; restoreState = true }
        }
    }) { pad ->
        Box(Modifier.padding(bottom = pad.calculateBottomPadding())) {
            Routes(nav, store)
            update?.let { u -> Box(Modifier.align(Alignment.TopCenter).statusBarsPadding()) { UpdateBanner(u) { update = null } } }
            st.error?.let { msg ->
                Snackbar(Modifier.align(Alignment.BottomCenter).padding(12.dp), action = { TextButton({ store.clearError() }) { Text("OK") } }) { Text(msg) }
            }
        }
    }
}
}

/** Every route of src/App.tsx. Screens receive the store and the nav controller, nothing else. */
@Composable fun Routes(nav: NavHostController, s: Store) {
    NavHost(nav, startDestination = "today") {
        composable("today") { TodayScreen(s, nav) }
        composable("diet") { DietScreen(s, nav) }
        composable("diet/camera") { CameraScreen(s, nav) }
        composable("workout") { WorkoutScreen(s, nav) }
        composable("workout/session/{dayId}") { SessionScreen(s, nav, it.arguments?.getString("dayId") ?: "") }
        composable("progress") { ProgressScreen(s, nav) }
        composable("adherence") { AdherenceScreen(s, nav) }
        composable("day/{date}") { DayDetailScreen(s, nav, it.arguments?.getString("date") ?: "") }
        composable("more") { MoreScreen(s, nav) }
        composable("more/goals") { GoalsScreen(s, nav) }
        composable("more/target") { TargetCalcScreen(s, nav) }
        composable("more/foods") { FoodsScreen(s, nav) }
        composable("more/recipes") { RecipesScreen(s, nav) }
        composable("more/plan") { PlanBuilderScreen(s, nav) }
        composable("more/settings") { SettingsScreen(s, nav) }
        composable("more/keys") { KeysScreen(s, nav) }
        composable("more/coach") { CoachSettingsScreen(s, nav) }
        composable("more/feedback") { FeedbackScreen(s, nav) }
        composable("physique") { PhysiqueScreen(s, nav) }
        composable("coach") { CoachScreen(s, nav) }
        composable("exercises") { ExercisesScreen(s, nav) }
        composable("history") { HistoryScreen(s, nav) }
    }
}


/** Standard tab bar: solid surface, hairline top edge, solid accent "+" (log food) in the middle. */
@Composable private fun GlassNav(route: String?, go: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().background(if (F.dark) androidx.compose.ui.graphics.Color(0xB314243A) else androidx.compose.ui.graphics.Color(0xB8FFFFFF))) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(if (F.dark) androidx.compose.ui.graphics.Color(0x33FFFFFF) else androidx.compose.ui.graphics.Color(0xE6FFFFFF)))
        Row(Modifier.navigationBarsPadding().fillMaxWidth().height(62.dp).padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
            val items = TABS.filter { it.route != "more" }
            items.forEachIndexed { i, t ->
                if (i == 2) Box(Modifier.size(46.dp).clip(androidx.compose.foundation.shape.CircleShape).background(F.accentBrush)
                    .clickable { go("diet") }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Add, "Log food", tint = androidx.compose.ui.graphics.Color.White)
                }
                NavItem(t, route == t.route) { go(t.route) }
            }
            NavItem(TABS.last(), route == "more") { go("more") }
        }
    }
}

@Composable private fun NavItem(t: Tab, on: Boolean, onClick: () -> Unit) {
    Column(Modifier.width(52.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(t.icon, t.label, tint = if (on) F.accent else F.mute, modifier = Modifier.size(22.dp))
        Text(t.label, fontSize = 11.sp, fontWeight = if (on) androidx.compose.ui.text.font.FontWeight.Bold else androidx.compose.ui.text.font.FontWeight.Medium,
            color = if (on) F.accent else F.mute)
    }
}
