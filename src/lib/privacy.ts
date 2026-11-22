/** Shown before the first food photo and in Settings. Physique check-ins keep their own consent step. */
export const PHOTO_PRIVACY = "FORGE never stores your photo on its servers. It goes only to Google's Gemini AI, just to get this answer. FORGE's free AI and free Gemini keys use Google's free tier, where Google may use what you send to improve its products."
export const VOICE_PRIVACY = "Voice is turned into text by your browser's speech service (Google or Apple). FORGE only receives the text."

const flag = (k: string) => ({
  seen: () => { try { return localStorage.getItem(k) === '1' } catch { return false } },
  mark: () => { try { localStorage.setItem(k, '1') } catch { /* private mode: show again next time */ } },
})
export const photoNotice = flag('forge:photo-privacy-seen')
export const voiceNotice = flag('forge:voice-privacy-seen')
/** The user confirmed their own age (physique check-ins are 18+; the stored age defaults to 25). Sent with the physique request. */
export const ageConfirmed = flag('forge:age-confirmed')
