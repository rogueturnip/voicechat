import { File, Directory, Paths } from 'expo-file-system';

export const VOICES = Object.freeze({
  af_heart: {
    name: "Heart",
    language: "en-us",
    gender: "Female",
    traits: "❤️",
    targetQuality: "A",
    overallGrade: "A",
  },
  af_alloy: {
    name: "Alloy",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C",
  },
  af_aoede: {
    name: "Aoede",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C+",
  },
  af_bella: {
    name: "Bella",
    language: "en-us",
    gender: "Female",
    traits: "🔥",
    targetQuality: "A",
    overallGrade: "A-",
  },
  af_jessica: {
    name: "Jessica",
    language: "en-us",
    gender: "Female",
    targetQuality: "C",
    overallGrade: "D",
  },
  af_kore: {
    name: "Kore",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C+",
  },
  af_nicole: {
    name: "Nicole",
    language: "en-us",
    gender: "Female",
    traits: "🎧",
    targetQuality: "B",
    overallGrade: "B-",
  },
  af_nova: {
    name: "Nova",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C",
  },
  af_river: {
    name: "River",
    language: "en-us",
    gender: "Female",
    targetQuality: "C",
    overallGrade: "D",
  },
  af_sarah: {
    name: "Sarah",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C+",
  },
  af_sky: {
    name: "Sky",
    language: "en-us",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C-",
  },
  am_adam: {
    name: "Adam",
    language: "en-us",
    gender: "Male",
    targetQuality: "D",
    overallGrade: "F+",
  },
  am_echo: {
    name: "Echo",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D",
  },
  am_eric: {
    name: "Eric",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D",
  },
  am_fenrir: {
    name: "Fenrir",
    language: "en-us",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C+",
  },
  am_liam: {
    name: "Liam",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D",
  },
  am_michael: {
    name: "Michael",
    language: "en-us",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C+",
  },
  am_onyx: {
    name: "Onyx",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D",
  },
  am_puck: {
    name: "Puck",
    language: "en-us",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C+",
  },
  am_santa: {
    name: "Santa",
    language: "en-us",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D-",
  },
  bf_emma: {
    name: "Emma",
    language: "en-gb",
    gender: "Female",
    traits: "🚺",
    targetQuality: "B",
    overallGrade: "B-",
  },
  bf_isabella: {
    name: "Isabella",
    language: "en-gb",
    gender: "Female",
    targetQuality: "B",
    overallGrade: "C",
  },
  bm_george: {
    name: "George",
    language: "en-gb",
    gender: "Male",
    targetQuality: "B",
    overallGrade: "C",
  },
  bm_lewis: {
    name: "Lewis",
    language: "en-gb",
    gender: "Male",
    targetQuality: "C",
    overallGrade: "D+",
  },
  bf_alice: {
    name: "Alice",
    language: "en-gb",
    gender: "Female",
    traits: "🚺",
    targetQuality: "C",
    overallGrade: "D",
  },
  bf_lily: {
    name: "Lily",
    language: "en-gb",
    gender: "Female",
    traits: "🚺",
    targetQuality: "C",
    overallGrade: "D",
  },
  bm_daniel: {
    name: "Daniel",
    language: "en-gb",
    gender: "Male",
    traits: "🚹",
    targetQuality: "C",
    overallGrade: "D",
  },
  bm_fable: {
    name: "Fable",
    language: "en-gb",
    gender: "Male",
    traits: "🚹",
    targetQuality: "B",
    overallGrade: "C",
  },
});

const VOICE_DATA_URL = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices";

/**
 *
 * @param {keyof typeof VOICES} id
 * @returns {Promise<ArrayBufferLike>}
 */
async function getVoiceFile(id) {
  try {
    const voicesDir = new Directory(Paths.document, 'voices');
    const file = new File(voicesDir, `${id}.bin`);
    
    if (file.exists) {
      const bytes = await file.bytes();
      return bytes.buffer;
    }
  } catch (e) {
    console.warn("Unable to read from local file system", e);
  }

  try {
    const url = `${VOICE_DATA_URL}/${id}.bin`;
    
    let cache;
    try {
      cache = await caches.open("kokoro-voices");
      const cachedResponse = await cache.match(url);
      if (cachedResponse) {
        return await cachedResponse.arrayBuffer();
      }
    } catch (e) {
      console.warn("Unable to open cache", e);
    }

    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    if (cache) {
      try {
        await cache.put(
          url,
          new Response(buffer, {
            headers: response.headers,
          }),
        );
      } catch (e) {
        console.warn("Unable to cache voice file", e);
      }
    }

    try {
      const voicesDir = new Directory(Paths.document, 'voices');
      if (!voicesDir.exists) {
        voicesDir.create({ intermediates: true });
      }
      
      const voiceFile = new File(voicesDir, `${id}.bin`);
      voiceFile.write(new Uint8Array(buffer));
    } catch (e) {
      console.warn("Unable to save voice file to local storage", e);
    }

    return buffer;
  } catch (e) {
    console.error("Failed to fetch voice file", e);
    throw e;
  }
}

function _arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function _base64ToArrayBuffer(base64) {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

const VOICE_CACHE = new Map();
export async function getVoiceData(voice: string | keyof typeof VOICES) {
  if (VOICE_CACHE.has(voice)) {
    return VOICE_CACHE.get(voice);
  }

  // Check if it's a combined voice first
  if (typeof voice === 'string' && voice.startsWith('combined_')) {
    const name = voice.replace('combined_', '');
    const combinedData = await loadCombinedVoice(name);
    if (combinedData) {
      VOICE_CACHE.set(voice, combinedData);
      return combinedData;
    }
  }

  // Otherwise, treat it as a regular voice
  const buffer = new Float32Array(await getVoiceFile(voice as keyof typeof VOICES));
  VOICE_CACHE.set(voice, buffer);
  return buffer;
}

/**
 * Combine multiple voices with specified weights
 * @param {Array<{voiceId: keyof typeof VOICES, weight: number}>} voices Array of voice IDs and their weights
 * @returns {Promise<Float32Array>} Combined voice data
 */
export async function combineVoices(voices: Array<{voiceId: keyof typeof VOICES, weight: number}>): Promise<Float32Array> {
  if (voices.length === 0) {
    throw new Error('At least one voice is required');
  }

  // Normalize weights to sum to 1
  const totalWeight = voices.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('Total weight must be greater than 0');
  }

  const normalizedVoices = voices.map(v => ({
    voiceId: v.voiceId,
    weight: v.weight / totalWeight
  }));

  // Load all voice data
  const voiceDataArrays = await Promise.all(
    normalizedVoices.map(v => getVoiceData(v.voiceId))
  );

  // Check that all voices have the same length
  const length = voiceDataArrays[0].length;
  for (let i = 1; i < voiceDataArrays.length; i++) {
    if (voiceDataArrays[i].length !== length) {
      throw new Error(`Voice ${normalizedVoices[i].voiceId} has different length than ${normalizedVoices[0].voiceId}`);
    }
  }

  // Combine voices with weighted sum
  const combined = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let j = 0; j < normalizedVoices.length; j++) {
      sum += voiceDataArrays[j][i] * normalizedVoices[j].weight;
    }
    combined[i] = sum;
  }

  return combined;
}

/**
 * Save a combined voice to disk
 * @param {string} name The name for the combined voice
 * @param {Float32Array} voiceData The combined voice data
 * @returns {Promise<boolean>} Whether the save was successful
 */
export async function saveCombinedVoice(name: string, voiceData: Float32Array): Promise<boolean> {
  try {
    const voicesDir = new Directory(Paths.document, 'voices');
    if (!voicesDir.exists) {
      voicesDir.create({ intermediates: true });
    }
    
    // Use a prefix to distinguish combined voices
    const fileName = `combined_${name}.bin`;
    const voiceFile = new File(voicesDir, fileName);
    voiceFile.write(new Uint8Array(voiceData.buffer));
    
    return true;
  } catch (e) {
    console.error('Error saving combined voice:', e);
    return false;
  }
}

/**
 * Load a combined voice from disk
 * @param {string} name The name of the combined voice
 * @returns {Promise<Float32Array | null>} The voice data or null if not found
 */
export async function loadCombinedVoice(name: string): Promise<Float32Array | null> {
  try {
    const voicesDir = new Directory(Paths.document, 'voices');
    const fileName = `combined_${name}.bin`;
    const voiceFile = new File(voicesDir, fileName);
    
    if (!voiceFile.exists) {
      return null;
    }
    
    const bytes = await voiceFile.bytes();
    return new Float32Array(bytes.buffer);
  } catch (e) {
    console.error('Error loading combined voice:', e);
    return null;
  }
}

/**
 * Get list of all saved combined voices
 * @returns {Promise<string[]>} Array of combined voice names
 */
export async function getCombinedVoices(): Promise<string[]> {
  try {
    const voicesDir = new Directory(Paths.document, 'voices');
    
    if (!voicesDir.exists) {
      return [];
    }
    
    const contents = voicesDir.list();
    const combinedVoices: string[] = [];
    
    for (const item of contents) {
      if (item instanceof File && item.name.startsWith('combined_') && item.name.endsWith('.bin')) {
        const name = item.name.replace('combined_', '').replace('.bin', '');
        combinedVoices.push(name);
      }
    }
    
    return combinedVoices;
  } catch (e) {
    console.error('Error getting combined voices:', e);
    return [];
  }
}