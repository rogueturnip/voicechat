/**
 * CMU IPA Dictionary loader and lookup utility
 * Loads the CMU IPA dictionary from JSON and provides fast word-to-IPA lookups
 */

// Import the dictionary JSON directly
import cmuDictionaryJson from './cmu_ipa.json';

// Cache for the parsed dictionary
let dictionaryCache: Map<string, string> | null = null;

/**
 * Normalize a word for dictionary lookup
 * - Convert to lowercase
 * - Remove punctuation
 * - Remove variant markers like (1), (2), etc.
 */
function normalizeWord(word: string): string {
  // Remove variant markers like (1), (2), etc.
  word = word.replace(/\(\d+\)/g, '');
  // Convert to lowercase and remove trailing punctuation
  word = word.toLowerCase().trim();
  // Remove common punctuation
  word = word.replace(/[.,!?;:'"]/g, '');
  return word;
}

/**
 * Load and parse the CMU IPA dictionary
 * @returns Promise<Map<string, string>> Map of normalized words to IPA transcriptions
 */
export async function loadCMUDictionary(): Promise<Map<string, string>> {
  // Return cached dictionary if available
  if (dictionaryCache) {
    return dictionaryCache;
  }

  try {
    console.log('[CMU Dictionary] Loading CMU IPA dictionary from JSON...');
    
    // Convert JSON object to Map, normalizing keys
    const dictionary = new Map<string, string>();
    let loadedCount = 0;
    let skippedCount = 0;

    for (const [word, ipa] of Object.entries(cmuDictionaryJson)) {
      const normalized = normalizeWord(word);
      // Only store the first variant if multiple exist
      if (!dictionary.has(normalized)) {
        dictionary.set(normalized, ipa as string);
        loadedCount++;
      } else {
        skippedCount++;
      }
    }

    dictionaryCache = dictionary;
    console.log(`[CMU Dictionary] Loaded ${loadedCount} words (skipped ${skippedCount} variants)`);
    
    return dictionaryCache;
  } catch (error) {
    console.error('[CMU Dictionary] Error loading dictionary:', error);
    dictionaryCache = new Map();
    return dictionaryCache;
  }
}

/**
 * Look up a word in the CMU dictionary
 * @param word The word to look up
 * @returns The IPA transcription or null if not found
 */
export async function lookupWord(word: string): Promise<string | null> {
  const dictionary = await loadCMUDictionary();
  const normalized = normalizeWord(word);
  return dictionary.get(normalized) || null;
}

/**
 * Check if the dictionary is loaded
 */
export function isDictionaryLoaded(): boolean {
  return dictionaryCache !== null;
}

/**
 * Clear the dictionary cache (useful for testing or reloading)
 */
export function clearDictionaryCache(): void {
  dictionaryCache = null;
}
