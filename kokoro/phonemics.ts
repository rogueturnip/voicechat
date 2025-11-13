/**
 * Phonemics utility for text-to-phoneme conversion and tokenization
 * Handles all phonemization logic separate from the model inference
 */

import { loadCMUDictionary, lookupWord } from './cmuDictionary';

// Complete vocabulary from Python code
export const VOCAB = (() => {
  const _pad = "$";
  const _punctuation = ';:,.!?¡¿—…"«»"" ';
  const _letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const _letters_ipa = "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ";
  
  const symbols = [_pad, ..._punctuation.split(''), ..._letters.split(''), ..._letters_ipa.split('')];
  const dicts: Record<string, number> = {};
  
  for (let i = 0; i < symbols.length; i++) {
    dicts[symbols[i]] = i;
  }
  
  return dicts;
})();

// Common English phoneme mappings for basic phonemization
const ENGLISH_PHONEME_MAP = {
  'a': 'ə',
  'e': 'ɛ',
  'i': 'ɪ',
  'o': 'oʊ',
  'u': 'ʌ',
  'th': 'θ',
  'sh': 'ʃ',
  'ch': 'tʃ',
  'ng': 'ŋ',
  'j': 'dʒ',
  'r': 'ɹ',
  'er': 'ɝ',
  'ar': 'ɑɹ',
  'or': 'ɔɹ',
  'ir': 'ɪɹ',
  'ur': 'ʊɹ',
};

// Common word to phoneme mappings
const COMMON_WORD_PHONEMES = {
  'hello': 'hɛˈloʊ',
  'world': 'wˈɝld',
  'this': 'ðˈɪs',
  'is': 'ˈɪz',
  'a': 'ə',
  'test': 'tˈɛst',
  'of': 'ʌv',
  'the': 'ðə',
  'kokoro': 'kˈoʊkəɹoʊ',
  'text': 'tˈɛkst',
  'to': 'tˈuː',
  'speech': 'spˈiːtʃ',
  'system': 'sˈɪstəm',
  'running': 'ɹˈʌnɪŋ',
  'on': 'ˈɑːn',
  'expo': 'ˈɛkspoʊ',
  'with': 'wˈɪð',
  'onnx': 'ˈɑːnɛks',
  'runtime': 'ɹˈʌntaɪm',
  // Number words
  'zero': 'zˈɪɹoʊ',
  'one': 'wˈʌn',
  'two': 'tˈuː',
  'three': 'θɹˈiː',
  'four': 'fˈɔɹ',
  'five': 'fˈaɪv',
  'six': 'sˈɪks',
  'seven': 'sˈɛvən',
  'eight': 'ˈeɪt',
  'nine': 'nˈaɪn',
  'ten': 'tˈɛn',
  'eleven': 'ɪlˈɛvən',
  'twelve': 'twˈɛlv',
  'thirteen': 'θɝtˈiːn',
  'fourteen': 'fɔɹtˈiːn',
  'fifteen': 'fɪftˈiːn',
  'sixteen': 'sɪkstˈiːn',
  'seventeen': 'sɛvəntˈiːn',
  'eighteen': 'eɪtˈiːn',
  'nineteen': 'naɪntˈiːn',
  'twenty': 'twˈɛnti',
  'thirty': 'θˈɝti',
  'forty': 'fˈɔɹti',
  'fifty': 'fˈɪfti',
  'sixty': 'sˈɪksti',
  'seventy': 'sˈɛvənti',
  'eighty': 'ˈeɪti',
  'ninety': 'nˈaɪnti',
  'hundred': 'hˈʌndɹəd',
  'thousand': 'θˈaʊzənd',
  'million': 'mˈɪljən',
  'billion': 'bˈɪljən',
};

// Number words for conversion
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/**
 * Convert a number to words
 * @param {number} num The number to convert
 * @returns {string} The number as words
 */
function numberToWords(num: number): string {
  if (num === 0) return 'zero';
  if (num < 0) return 'negative ' + numberToWords(-num);
  
  if (num < 10) return ONES[num];
  if (num < 20) return TEENS[num - 10];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return TENS[tens] + (ones > 0 ? '-' + ONES[ones] : '');
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;
    return ONES[hundreds] + ' hundred' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  if (num < 1000000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    return numberToWords(thousands) + ' thousand' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  if (num < 1000000000) {
    const millions = Math.floor(num / 1000000);
    const remainder = num % 1000000;
    return numberToWords(millions) + ' million' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  const billions = Math.floor(num / 1000000000);
  const remainder = num % 1000000000;
  return numberToWords(billions) + ' billion' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
}

/**
 * Convert numbers in text to words
 * @param {string} text The input text
 * @returns {string} Text with numbers converted to words
 */
function convertNumbersToWords(text: string): string {
  // Match numbers (integers and decimals)
  // This regex matches:
  // - Standalone integers: 123, -456
  // - Decimals: 12.34, -5.67
  // - Numbers with commas: 1,234,567
  return text.replace(/(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g, (match) => {
    // Remove commas and parse
    const numStr = match.replace(/,/g, '');
    const num = parseFloat(numStr);
    
    if (isNaN(num)) return match;
    
    // Handle decimals
    if (numStr.includes('.')) {
      const parts = numStr.split('.');
      const intPart = parseInt(parts[0], 10);
      const decPart = parts[1];
      
      // Convert integer part (handles negative numbers correctly)
      const intWords = numberToWords(intPart);
      
      // Convert decimal part digit by digit
      const decWords = decPart.split('').map(d => {
        const digit = parseInt(d, 10);
        return digit === 0 ? 'zero' : ONES[digit];
      }).join(' ');
      
      return intWords + ' point ' + decWords;
    }
    
    return numberToWords(num);
  });
}

/**
 * Normalize text for phonemization
 * @param {string} text The input text
 * @returns {string} Normalized text
 */
export function normalizeText(text: string): string {
  // Remove leading/trailing whitespace
  text = text.trim();
  
  // Replace multiple spaces with a single space
  text = text.replace(/\s+/g, ' ');
  
  // Replace curly quotes with straight quotes
  text = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  
  // Replace other special characters
  text = text.replace(/…/g, '...');
  
  return text;
}

/**
 * Phonemize a single word (helper function)
 * @param {string} word The word to phonemize
 * @returns {Promise<string>} Phonemized word
 */
async function phonemizeWord(word: string): Promise<string> {
  // First, try CMU dictionary lookup
  // Remove all punctuation characters that are in VOCAB
  const cleanWord = word.toLowerCase().replace(/[.,!?;:'"¡¿—…«»""]/g, '');
  const cmuPhoneme = await lookupWord(cleanWord);
  
  if (cmuPhoneme) {
    return cmuPhoneme;
  }
  
  // Fallback to pre-defined phonemes
  if (cleanWord in COMMON_WORD_PHONEMES) {
    return COMMON_WORD_PHONEMES[cleanWord as keyof typeof COMMON_WORD_PHONEMES];
  }
  
  // Otherwise, do a simple character-by-character phonemization
  let phonemes = '';
  let i = 0;
  
  while (i < word.length) {
    // Check for digraphs (two-letter phonemes)
    if (i < word.length - 1) {
      const digraph = word.substring(i, i + 2).toLowerCase();
      if (digraph in ENGLISH_PHONEME_MAP) {
        phonemes += ENGLISH_PHONEME_MAP[digraph as keyof typeof ENGLISH_PHONEME_MAP];
        i += 2;
        continue;
      }
    }
    
    // Check for single character phonemes
    const char = word[i].toLowerCase();
    if (char in ENGLISH_PHONEME_MAP) {
      phonemes += ENGLISH_PHONEME_MAP[char as keyof typeof ENGLISH_PHONEME_MAP];
    } else if (/[a-z]/.test(char)) {
      // For other alphabetic characters, just use the character itself
      phonemes += char;
    }
    // Note: Punctuation should be handled at the token level, not here
    // If punctuation reaches this point, it means it wasn't separated properly
    
    i++;
  }
  
  // Add stress marker to the first syllable if the word is long enough
  // Only add stress if phonemes don't contain punctuation (which shouldn't happen here)
  if (phonemes.length > 2 && !/[.,!?;:'"¡¿—…«»""]/.test(phonemes)) {
    // Find the first vowel
    const firstVowelMatch = phonemes.match(/[ɑɐɒæəɘɚɛɜɝɞɨɪʊʌɔoeiuaɑː]/);
    if (firstVowelMatch && firstVowelMatch.index !== undefined) {
      const vowelIndex = firstVowelMatch.index;
      phonemes = phonemes.substring(0, vowelIndex) + 'ˈ' + phonemes.substring(vowelIndex);
    }
  }
  
  return phonemes;
}

/**
 * Basic phonemization function with CMU dictionary support
 * @param {string} text The input text
 * @returns {Promise<string>} Phonemized text
 */
export async function phonemize(text: string): Promise<string> {
  // Normalize the text first
  text = normalizeText(text);
  
  // Convert numbers to words before phonemization
  text = convertNumbersToWords(text);
  
  // Ensure CMU dictionary is loaded
  await loadCMUDictionary();
  
  // Split text into tokens (words and punctuation separated)
  // Use a regex that matches words OR punctuation sequences, preserving order
  const punctuationPattern = '[.,!?;:\'"¡¿—…«»""]+';
  const wordPattern = '[a-zA-Z0-9\'-]+';
  const tokenPattern = new RegExp(`(${wordPattern}|${punctuationPattern})`, 'g');
  
  const tokens: string[] = [];
  let match;
  while ((match = tokenPattern.exec(text)) !== null) {
    tokens.push(match[0]);
  }
  
  // Filter out empty tokens
  const filteredTokens = tokens.filter(t => t.trim().length > 0);
  
  // Phonemize each token
  const phonemizedTokens = await Promise.all(filteredTokens.map(async (token: string) => {
    // Check if token is punctuation only
    if (/^[.,!?;:'"¡¿—…«»""]+$/.test(token)) {
      // Return punctuation as-is (with space before if not first token)
      return token;
    }
    
    // Handle hyphenated words (like "twenty-one") by splitting and phonemizing each part
    if (token.includes('-')) {
      const parts = token.split('-');
      const phonemizedParts = await Promise.all(parts.map(part => phonemizeWord(part)));
      return phonemizedParts.join(' ');
    }
    
    return await phonemizeWord(token);
  }));
  
  // Join the phonemized tokens with spaces
  return phonemizedTokens.join(' ');
}

/**
 * Tokenize phonemized text
 * @param {string} phonemes The phonemized text
 * @param {string} currentPhonemes Optional reference to current phonemes (for tracking)
 * @returns {Promise<{tokens: number[], phonemes: string}>} Tokenized input and phonemes
 */
export async function tokenize(phonemes: string, currentPhonemes?: { value: string }): Promise<{tokens: number[], phonemes: string}> {
  // If input is regular text, phonemize it first
  if (!/[ɑɐɒæəɘɚɛɜɝɞɨɪʊʌɔˈˌː]/.test(phonemes)) {
    phonemes = await phonemize(phonemes);
  }
  
  console.log('Phonemized text:', phonemes);
  
  // Update current phonemes if provided
  if (currentPhonemes) {
    currentPhonemes.value = phonemes;
  }
  
  const tokens = [];
  
  // Add start token (0)
  tokens.push(0);
  
  // Convert each character to a token if it exists in VOCAB
  for (const char of phonemes) {
    const tokenId = VOCAB[char];
    if (tokenId !== undefined) {
      tokens.push(tokenId);
    } else {
      console.warn(`Character not in vocabulary: "${char}" (code: ${char.charCodeAt(0)})`);
    }
  }
  
  // Add end token (0)
  tokens.push(0);
  
  return { tokens, phonemes };
}

