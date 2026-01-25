// ✅ DEPRECATED: All settings loading now uses src/ui/settings.js::loadAllSettingsAtOnce()
// This module is kept for backward compatibility stubs only.

// ✅ GPT-FIX: No longer cache results locally
export async function loadCachedResultFast(resultText) {
  // No-op: Results are now fetched from Supabase chat_history when needed
  console.log('[Storage] loadCachedResultFast deprecated - use Supabase chat_history');
}
