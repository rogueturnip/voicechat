import { Platform } from 'react-native';
import KokoroOnnx from '../kokoro/kokoroOnnx';
import Speech from '@mhpdev/react-native-speech';

export type TTSEngine = 'kokoro' | 'react-native-speech';

interface SpeechOptions {
  engine: TTSEngine;
  text: string;
  kokoroVoice?: string;
  kokoroSpeed?: number;
  rnSpeechVoice?: string | null;
  rnSpeechSpeed?: number;
  onProgress?: (status: any) => void;
}

/**
 * Unified speech generation wrapper that uses the selected TTS engine
 */
export async function generateSpeech(options: SpeechOptions): Promise<void> {
  const {
    engine,
    text,
    kokoroVoice = 'af_heart',
    kokoroSpeed = 1.0,
    rnSpeechVoice = null,
    rnSpeechSpeed = 1.0,
    onProgress,
  } = options;

  if (engine === 'kokoro') {
    // Use Kokoro TTS
    await KokoroOnnx.streamAudio(
      text,
      kokoroVoice,
      kokoroSpeed,
      onProgress || null
    );
  } else if (engine === 'react-native-speech') {
    // Use React Native Speech
    // Map speed (0.5-2.0) to rate properly based on platform:
    // - iOS: AVSpeechUtterance rates are 0.0-1.0, where ~0.5 is normal (AVSpeechUtteranceDefaultSpeechRate)
    // - Android: rates are 0.1-2.0, where 1.0 is normal
    // Speed 1.0 should map to normal rate on each platform
    
    const speechOptions: any = {};
    
    // Only set rate if speed is significantly different from 1.0 (normal)
    if (Math.abs(rnSpeechSpeed - 1.0) > 0.05) {
      let rate: number;
      
      if (Platform.OS === 'ios') {
        // iOS: map speed 0.5-2.0 to rate 0.25-1.0 (where 0.5 is normal)
        // Linear mapping: speed 0.5 -> rate 0.25, speed 1.0 -> rate 0.5, speed 2.0 -> rate 1.0
        rate = Math.max(0.25, Math.min(1.0, (rnSpeechSpeed - 0.5) * 0.5 + 0.5));
      } else {
        // Android: map speed 0.5-2.0 to rate 0.5-2.0 (where 1.0 is normal)
        rate = Math.max(0.5, Math.min(2.0, rnSpeechSpeed));
      }
      
      speechOptions.rate = rate;
    }
    // If speed is ~1.0, don't set rate at all to use platform default (normal speed)
    
    if (rnSpeechVoice) {
      speechOptions.voice = rnSpeechVoice;
    }
    
    // Use speakWithOptions to pass voice and rate
    await Speech.speakWithOptions(text, speechOptions);
  } else {
    throw new Error(`Unknown TTS engine: ${engine}`);
  }
}

