package app.forge.fitness.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import app.forge.fitness.ui.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.forge.fitness.data.*
import app.forge.fitness.logic.Calc
import app.forge.fitness.logic.Catalog
import app.forge.fitness.ui.*
import kotlinx.coroutines.launch

@Composable
fun RecipesScreen(s: Store, nav: NavController) {
    val context = LocalContext.current
    val st by s.state.collectAsStateWithLifecycle()
    val date by s.date.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var editingRecipe by remember { mutableStateOf<Recipe?>(null) }
    var addToRecipe by remember { mutableStateOf<Recipe?>(null) }

    fun totalsOf(r: Recipe): Calc.Totals {
        return r.ingredients.fold(Calc.Totals()) { acc, ing ->
            val food = st.foods.find { it.id == ing.food_id }
            if (food != null) acc + Calc.scaleFood(food, ing.qty) else acc
        }
    }

    val sortedRecipes = remember(st.recipes) {
        st.recipes.sortedWith(compareByDescending<Recipe> { it.favorite == true }.thenBy { it.name })
    }

    Screen(
        title = "Quick meals",
        sub = "Saved recipes",
        back = { nav.popBackStack() },
        right = {
            IconButton(
                onClick = { editingRecipe = Recipe(id = uid(), name = "", ingredients = emptyList()) },
                modifier = Modifier.clip(CircleShape)
            ) {
                Icon(Icons.Filled.Add, contentDescription = "New recipe", tint = F.text)
            }
        }
    ) {
        if (sortedRecipes.isEmpty()) {
            Empty(
                title = "No quick meals yet",
                body = "Save a combination you eat often and log it in one tap."
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            sortedRecipes.forEach { r ->
                val tot = totalsOf(r)
                Card {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(r.name, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = F.text)
                            Spacer(Modifier.height(2.dp))
                            val parts = r.ingredients.mapNotNull { ing ->
                                val f = st.foods.find { it.id == ing.food_id }
                                if (f != null) "${f.name} ${Calc.round1(ing.qty)}${unitShort(f.unit)}" else null
                            }
                            val summary = if (parts.isNotEmpty()) parts.joinToString(" · ") else "No ingredients yet"
                            Text(summary, fontSize = 12.sp, color = F.mute)
                        }

                        IconButton(
                            onClick = {
                                scope.launch {
                                    s.save(Tables.recipes, r.copy(favorite = !(r.favorite ?: false)))
                                }
                            },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                Icons.Filled.AutoAwesome,
                                contentDescription = if (r.favorite == true) "Unfavorite" else "Favorite",
                                tint = if (r.favorite == true) F.accent else F.mute,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(
                            "kcal" to "${Math.round(tot.calories)}",
                            "P" to "${Calc.round1(tot.protein_g)}",
                            "C" to "${Calc.round1(tot.carbs_g)}",
                            "F" to "${Calc.round1(tot.fat_g)}"
                        ).forEach { (label, value) ->
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(F.raised)
                                    .padding(vertical = 6.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Eyebrow(label)
                                Text(value, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = F.text)
                            }
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FButton(
                            text = "Add to meal",
                            modifier = Modifier.weight(1f),
                            variant = Variant.Quiet,
                            onClick = { addToRecipe = r }
                        )
                        FButton(
                            text = "Edit",
                            modifier = Modifier.weight(1f),
                            variant = Variant.Ghost,
                            onClick = { editingRecipe = r }
                        )
                    }
                }
            }
        }

        if (editingRecipe != null) {
            RecipeSheet(
                recipe = editingRecipe!!,
                s = s,
                onClose = { editingRecipe = null }
            )
        }

        if (addToRecipe != null) {
            Sheet(
                open = true,
                title = "Add “${addToRecipe!!.name}” to",
                onClose = { addToRecipe = null }
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    st.mealTypes.forEach { m ->
                        FButton(
                            text = m.name,
                            modifier = Modifier.fillMaxWidth(),
                            variant = Variant.Quiet,
                            onClick = {
                                val currentRecipe = addToRecipe!!
                                scope.launch {
                                    currentRecipe.ingredients.forEach { ing ->
                                        val food = st.foods.find { it.id == ing.food_id }
                                        if (food != null) {
                                            val scaled = Calc.scaleFood(food, ing.qty)
                                            s.save(
                                                Tables.foodLogs,
                                                FoodLog(
                                                    id = uid(),
                                                    date = date,
                                                    meal_type_id = m.id,
                                                    food_id = food.id,
                                                    name = food.name,
                                                    qty = ing.qty,
                                                    unit = normUnit(food.unit),
                                                    source = "recipe",
                                                    calories = scaled.calories,
                                                    protein_g = scaled.protein_g,
                                                    carbs_g = scaled.carbs_g,
                                                    fat_g = scaled.fat_g
                                                )
                                            )
                                        }
                                    }
                                    addToRecipe = null
                                    nav.navigate("diet")
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RecipeSheet(recipe: Recipe, s: Store, onClose: () -> Unit) {
    val context = LocalContext.current
    val st by s.state.collectAsStateWithLifecycle()
    val exists = remember(recipe.id) { st.recipes.any { it.id == recipe.id } }
    val scope = rememberCoroutineScope()

    var name by remember(recipe) { mutableStateOf(recipe.name) }
    var ingredients by remember(recipe) { mutableStateOf(recipe.ingredients) }
    var q by remember { mutableStateOf("") }
    var catalog by remember { mutableStateOf<List<Catalog.CatalogFood>?>(null) }

    LaunchedEffect(Unit) {
        catalog = runCatching { Catalog.loadCatalog(context) }.getOrDefault(emptyList())
    }

    val searchOptions = remember(q, st.foods, catalog) {
        if (q.isBlank()) emptyList()
        else {
            val needle = q.trim().lowercase()
            val mine = st.foods.filter { it.name.lowercase().contains(needle) }.take(8)
            val seen = mine.map { it.name.lowercase() }.toSet()
            val fromCat = catalog?.let { Catalog.searchFoods(it, q, 20) }
                ?.filter { !seen.contains(it.name.lowercase()) }
                ?.map { Catalog.toFoodRow(it) } ?: emptyList()
            (mine + fromCat).take(20)
        }
    }

    Sheet(
        open = true,
        title = if (exists) "Edit recipe" else "New recipe",
        onClose = onClose
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Field(label = "Name") {
                Input(value = name, onChange = { name = it }, placeholder = "Chicken Rice Bowl")
            }

            Eyebrow("INGREDIENTS")
            ingredients.forEachIndexed { i, ing ->
                val food = st.foods.find { it.id == ing.food_id }
                val scaled = if (food != null) Calc.scaleFood(food, ing.qty) else null

                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(food?.name ?: "Unknown food", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = F.text)
                            if (scaled != null) {
                                Text("${Math.round(scaled.calories)} kcal", fontFamily = Mono, fontSize = 12.sp, color = F.mute)
                            }
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            NumberInput(
                                value = ing.qty,
                                onCommit = { v ->
                                    ingredients = ingredients.mapIndexed { idx, item ->
                                        if (idx == i) item.copy(qty = v ?: 0.0) else item
                                    }
                                },
                                modifier = Modifier.width(90.dp),
                                placeholder = "Qty"
                            )

                            IconButton(
                                onClick = { ingredients = ingredients.filterIndexed { idx, _ -> idx != i } },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(Icons.Filled.Delete, contentDescription = "Remove ingredient", tint = F.danger, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }

            Input(
                value = q,
                onChange = { q = it },
                placeholder = "Search a food to add"
            )

            if (q.isNotBlank() && catalog == null) {
                Spinner("Loading food database")
            }

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                searchOptions.forEach { f ->
                    Card(
                        onClick = {
                            scope.launch {
                                if (st.foods.none { it.id == f.id }) {
                                    s.save(Tables.foods, f)
                                }
                                val defaultQty = f.serving_g?.takeIf { it > 0 } ?: f.base
                                ingredients = ingredients + RecipeIngredient(food_id = f.id, qty = defaultQty)
                                q = ""
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(f.name, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = F.text)
                        Text(
                            "${Math.round(f.calories)} kcal / ${Math.round(f.base)}${unitShort(f.unit)}",
                            fontFamily = Mono,
                            fontSize = 12.sp,
                            color = F.mute
                        )
                    }
                }
            }

            FButton(
                text = "Save recipe",
                modifier = Modifier.fillMaxWidth(),
                enabled = name.isNotBlank(),
                onClick = {
                    scope.launch {
                        s.save(Tables.recipes, recipe.copy(name = name.trim(), ingredients = ingredients))
                        onClose()
                    }
                }
            )

            if (exists) {
                FButton(
                    text = "Duplicate",
                    modifier = Modifier.fillMaxWidth(),
                    variant = Variant.Quiet,
                    onClick = {
                        scope.launch {
                            s.save(Tables.recipes, recipe.copy(id = uid(), name = "$name (copy)", ingredients = ingredients))
                            onClose()
                        }
                    }
                )

                FButton(
                    text = "Delete recipe",
                    modifier = Modifier.fillMaxWidth(),
                    variant = Variant.Danger,
                    onClick = {
                        scope.launch {
                            s.del(Tables.recipes, recipe.id)
                            onClose()
                        }
                    }
                )
            }
        }
    }
}
