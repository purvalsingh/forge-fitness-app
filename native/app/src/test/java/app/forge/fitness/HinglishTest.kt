package app.forge.fitness

import app.forge.fitness.logic.Catalog
import app.forge.fitness.logic.Hinglish
import app.forge.fitness.logic.Portions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/** Same cases as the web app's src/lib/hinglish.test.ts, on the same portions.json asset. */
class HinglishTest {
    private val p = Portions(File("src/main/assets/portions.json").readText())
    private val h = Hinglish(p)
    private fun food(id: String, name: String, kcal: Double, g: Double? = null, label: String? = null, src: String = "composed") =
        Catalog.CatalogFood(id = id, name = name, calories = kcal, protein_g = 3.0, carbs_g = 20.0, fat_g = 2.0, serving_g = g, serving_label = label, src = src)
    private val catalog = listOf(
        food("dish-dal-tadka", "Dal Tadka", 135.0, 250.0, "1 katori"),
        food("x-roti", "Chapati/Roti", 297.0, 40.0, "1 roti", "indb"),
        food("usda-2708408", "Rice, white, cooked, no added fat", 129.0, src = "fndds"),
        food("x-ghee", "Ghee, clarified butter", 880.0, src = "sr"),
        food("dish-masala-chai-1-cup", "Masala Chai (1 cup)", 41.0, 200.0, "1 cup"),
    )

    @Test fun doRotiIsTwo() { assertEquals(2.0, h.parsePhrase("do roti")!!.qty, 0.0); assertEquals("roti", h.parsePhrase("do roti")!!.food) }
    @Test fun aadhaKatoriIsHalf() { val ph = h.parsePhrase("aadha katori dal")!!; assertEquals(0.5, ph.qty, 0.0); assertEquals("katori", ph.unit) }
    @Test fun dedhDhaiMarathi() {
        assertEquals(1.5, h.parsePhrase("dedh plate poha")!!.qty, 0.0)
        assertEquals(2.5, h.parsePhrase("dhai roti")!!.qty, 0.0)
        assertEquals(2.0, h.parsePhrase("don vati varan")!!.qty, 0.0)
    }
    @Test fun sizesAndPlurals() { val ph = h.parsePhrase("2 bade parathe")!!; assertEquals("large", ph.size); assertEquals("paratha", ph.food) }
    @Test fun katoriDependsOnFood() {
        assertEquals(150.0, p.unitGrams("dal", "katori")!!, 0.0)
        assertEquals(120.0, p.unitGrams("bhindi sabzi", "katori")!!, 0.0)
        assertEquals(130.0, p.unitGrams("chawal", "katori")!!, 0.0)
        assertEquals(30.0, p.unitGrams("roti", "piece", "small")!!, 0.0)
        assertEquals(55.0, p.unitGrams("roti", "piece", "large")!!, 0.0)
        assertEquals(250.0, p.unitGrams("milk", "glass")!!, 0.0)
        assertEquals(15.0, p.unitGrams("ghee", "tbsp")!!, 0.0)
        assertEquals(30.0, p.unitGrams("whey", "scoop")!!, 0.0)
    }
    @Test fun localMeal() {
        val r = h.parse(catalog, "2 roti, 1 katori dal, thoda ghee, chai, xyzzy")
        assertEquals(listOf("Chapati/Roti" to 80.0, "Dal Tadka" to 150.0, "Ghee, clarified butter" to 5.0, "Masala Chai (1 cup)" to 150.0), r.items.map { it.name to it.grams })
        assertEquals(listOf("xyzzy"), r.unmatched)
    }
    @Test fun numberedProductStaysOneItem() {
        val r = h.parse(catalog + food("x-5star", "5 Star (Cadbury)", 470.0, 40.0, "1 bar", "off"), "5 star")
        assertEquals(listOf("5 Star (Cadbury)" to 40.0), r.items.map { it.name to it.grams })
    }
    @Test fun messyRestaurantOrder() {
        val cat = catalog + listOf(food("dish-pav-bhaji", "Pav Bhaji", 164.8, 400.0, "1 plate"),
            food("dish-pav-2-pieces", "Pav (2 pieces)", 251.2, 90.0, "2 pieces"), food("x-thumsup", "Thums Up", 42.0, src = "fndds"))
        val r = h.parse(cat, "restaurant styled pav bhaji with butter a lot and a total of 3 pav with 200ml thums up")
        assertEquals(300.0, r.items.first { it.name == "Pav Bhaji" }.grams!!, 0.0)
        assertEquals(135.0, r.items.first { it.name == "Pav (2 pieces)" }.grams!!, 0.0)
        assertEquals(200.0, r.items.first { it.name == "Thums Up" }.grams!!, 0.0)
        assertEquals(emptyList<String>(), r.tooLarge)
        assertEquals(listOf("restaurant styled pav bhaji"), r.partial)
    }
    @Test fun oilLine() {
        val l = p.oilLine("normal", ghee = true, servings = 1)!!
        assertEquals("Ghee", l.name); assertEquals(10.0, l.grams, 0.0); assertEquals("2 tsp", l.label); assertEquals(90.0, l.calories, 0.0)
        assertEquals("2 tbsp", p.oilLine("lot", ghee = false, servings = 2)!!.label)
        assertNull(p.oilLine("none", ghee = false, servings = 3))
    }
}
