import { create } from 'zustand';
import { MODELS } from '../kokoro/models';
import { VOICES } from '../kokoro/voices';

const DEFAULT_MODEL_ID = 'model_q8f16.onnx';

interface TTSStore {
  // Voice state
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
  
  // Model state
  selectedModelId: keyof typeof MODELS;
  setSelectedModelId: (modelId: keyof typeof MODELS) => void;
  currentModelId: keyof typeof MODELS | null;
  setCurrentModelId: (modelId: keyof typeof MODELS | null) => void;
  
  // Model initialization state
  isModelInitialized: boolean;
  setIsModelInitialized: (initialized: boolean) => void;
  
  // Downloaded models
  downloadedModels: string[];
  setDownloadedModels: (models: string[]) => void;
  
  // Downloaded voices
  downloadedVoices: Set<string>;
  setDownloadedVoices: (voices: Set<string>) => void;
  
  // Settings
  speed: number;
  setSpeed: (speed: number) => void;
  isLLMMode: boolean;
  setIsLLMMode: (isLLMMode: boolean) => void;
  
  // TTS Engine selection
  ttsEngine: 'kokoro' | 'react-native-speech';
  setTTSEngine: (engine: 'kokoro' | 'react-native-speech') => void;
  
  // React Native Speech voice
  rnSpeechVoice: string | null;
  setRNSpeechVoice: (voice: string | null) => void;
}

export const useTTSStore = create<TTSStore>((set) => ({
  // Voice state
  selectedVoice: 'af_heart',
  setSelectedVoice: (voice) => set({ selectedVoice: voice }),
  
  // Model state
  selectedModelId: DEFAULT_MODEL_ID as keyof typeof MODELS,
  setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),
  currentModelId: null,
  setCurrentModelId: (modelId) => set({ currentModelId: modelId }),
  
  // Model initialization state
  isModelInitialized: false,
  setIsModelInitialized: (initialized) => set({ isModelInitialized: initialized }),
  
  // Downloaded models
  downloadedModels: [],
  setDownloadedModels: (models) => set({ downloadedModels: models }),
  
  // Downloaded voices
  downloadedVoices: new Set<string>(),
  setDownloadedVoices: (voices) => set({ downloadedVoices: voices }),
  
  // Settings
  speed: 1.0,
  setSpeed: (speed) => set({ speed }),
  isLLMMode: true,
  setIsLLMMode: (isLLMMode) => set({ isLLMMode }),
  
  // TTS Engine selection (default to kokoro to preserve current behavior)
  ttsEngine: 'kokoro',
  setTTSEngine: (engine) => set({ ttsEngine: engine }),
  
  // React Native Speech voice
  rnSpeechVoice: null,
  setRNSpeechVoice: (voice) => set({ rnSpeechVoice: voice }),
}));

