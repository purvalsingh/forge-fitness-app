package app.forge.fitness

import app.forge.fitness.logic.FoodPhotos
import org.junit.Assert.assertEquals
import org.junit.Test
import java.nio.file.Files

class FoodPhotosTest {
    @Test fun deletesOnlyPhotosOlderThanADay() {
        val dir = Files.createTempDirectory("food").toFile()
        val now = 10L * 24 * 60 * 60 * 1000
        val old = dir.resolve("meal_old.jpg").apply { writeBytes(byteArrayOf(1)); setLastModified(now - FoodPhotos.RETENTION_MS - 60_000) }
        val fresh = dir.resolve("meal_new.jpg").apply { writeBytes(byteArrayOf(1)); setLastModified(now - 60_000) }
        assertEquals(1, FoodPhotos.cleanupDir(dir, now))
        assertEquals(false, old.exists())
        assertEquals(true, fresh.exists())
        dir.deleteRecursively()
    }
}
