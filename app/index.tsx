import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { File, Directory, Paths } from 'expo-file-system';
import { setAudioModeAsync, createAudioPlayer, AudioPlayer } from 'expo-audio';
import { VOICES, getCombinedVoices } from '../kokoro/voices';
import KokoroOnnx from '../kokoro/kokoroOnnx';
import { MODELS, getDownloadedModels, downloadModel, isModelDownloaded } from '../kokoro/models';
import { useTTSStore } from '../store/ttsStore';
import SpeechRecognition from '../components/SpeechRecognition';
import llmService from '../kokoro/llmService';

export default function Index() {
  const router = useRouter();
  const {
    selectedVoice,
    setSelectedVoice,
    selectedModelId,
    setSelectedModelId,
    currentModelId,
    isModelInitialized,
    setIsModelInitialized,
    setCurrentModelId,
    downloadedModels,
    setDownloadedModels,
    downloadedVoices,
    setDownloadedVoices,
  } = useTTSStore();

  const {
    speed,
    isLLMMode,
  } = useTTSStore();

  const [text, setText] = useState("Hello, this is a test of the Kokoro text to speech system running on Expo with ONNX Runtime.");
  const [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState<AudioPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [tokensPerSecond, setTokensPerSecond] = useState(0);
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamDuration, setStreamDuration] = useState(0);
  const [streamPosition, setStreamPosition] = useState(0);
  const [timeToFirstToken, setTimeToFirstToken] = useState(0);
  const [streamingPhonemes, setStreamingPhonemes] = useState("");
  
  // LLM state
  const [isLLMInitializing, setIsLLMInitializing] = useState(false);
  const [isLLMDownloading, setIsLLMDownloading] = useState(false);
  const [isLLMReady, setIsLLMReady] = useState(false);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [interimTranscript, setInterimTranscript] = useState<string>('');

  // TTS Model initialization state
  const [isInitializingModel, setIsInitializingModel] = useState(false);
  const [isDownloadingTTSModel, setIsDownloadingTTSModel] = useState(false);

  // Initialize models and LLM on mount
  useEffect(() => {
    initializeModels();
    initializeLLM();
  }, []);

  // Initialize models - download if needed and set as active
  const initializeModels = async () => {
    console.log('[App] Starting model initialization...');
    
    // Check and download TTS model (model_q8f16.onnx) - this is required
    await ensureTTSModelDownloaded();
    
    // Check voices
    checkDownloadedVoices();
  };

  // Ensure TTS model (model_q8f16.onnx) is downloaded and active
  const ensureTTSModelDownloaded = async () => {
    try {
      const requiredModelId = 'model_q8f16.onnx' as keyof typeof MODELS;
      console.log('[App] Checking TTS model:', requiredModelId);
      
      const isDownloaded = await isModelDownloaded(requiredModelId);
      console.log('[App] TTS model downloaded:', isDownloaded);
      
      if (!isDownloaded) {
        console.log('[App] TTS model not found, downloading...');
        setIsDownloadingTTSModel(true);
        
        const success = await downloadModel(requiredModelId);
        setIsDownloadingTTSModel(false);
        
        if (success) {
          console.log('[App] ✓ TTS model downloaded successfully');
          // Update downloaded models list
          await checkDownloadedModels();
          // Set as selected and active
          setSelectedModelId(requiredModelId);
        } else {
          console.error('[App] ✗ Failed to download TTS model');
          setError('Failed to download TTS model. Please check your connection.');
        }
      } else {
        // Model is downloaded, ensure it's set as active
        console.log('[App] TTS model already downloaded, setting as active...');
        setSelectedModelId(requiredModelId);
        await checkDownloadedModels();
      }
    } catch (err) {
      console.error('[App] ✗ Error ensuring TTS model:', err);
      setIsDownloadingTTSModel(false);
      setError('Error checking TTS model. Please try again.');
    }
  };

  const checkDownloadedModels = async () => {
    try {
      const models = await getDownloadedModels();
      setDownloadedModels(models);
    } catch (err) {
      console.error('Error checking downloaded models:', err);
      setError('Error checking downloaded models');
    }
  };

  // Initialize LLM
  const initializeLLM = async () => {
    try {
      setIsLLMInitializing(true);
      const ready = await llmService.initialize();
      setIsLLMReady(ready);
      
      // Check download status periodically
      const checkDownloadStatus = setInterval(() => {
        setIsLLMDownloading(llmService.isDownloadingModel());
        if (llmService.isReady()) {
          setIsLLMReady(true);
          setIsLLMInitializing(false);
          clearInterval(checkDownloadStatus);
        }
      }, 500);
      
      // Cleanup after 5 minutes
      setTimeout(() => clearInterval(checkDownloadStatus), 5 * 60 * 1000);
    } catch (err) {
      console.error('[App] Error initializing LLM:', err);
      setIsLLMInitializing(false);
      setError('Failed to initialize LLM. Please try again.');
    }
  };


  // Auto-initialize the selected model when it's downloaded
  useEffect(() => {
    const autoInitializeModel = async () => {
      // If we have a selected model that's downloaded but not initialized
      if (
        selectedModelId &&
        downloadedModels.includes(selectedModelId) &&
        !isModelInitialized &&
        currentModelId !== selectedModelId &&
        !isInitializingModel
      ) {
        try {
          setIsInitializingModel(true);
          const success = await KokoroOnnx.loadModel(selectedModelId);
          if (success) {
            setIsModelInitialized(true);
            setCurrentModelId(selectedModelId);
          }
        } catch (err) {
          console.error('Error auto-initializing model:', err);
        } finally {
          setIsInitializingModel(false);
        }
      }
    };

    autoInitializeModel();
  }, [selectedModelId, downloadedModels, isModelInitialized, currentModelId, isInitializingModel]);

  // Reload voice selection when returning from voices page
  useFocusEffect(
    React.useCallback(() => {
      checkDownloadedVoices();
    }, [])
  );

  // Initialize audio
  useEffect(() => {
    async function setupAudio() {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    }
    
    setupAudio();
    
    return () => {
      // Clean up sound when component unmounts
      if (sound) {
        sound.release();
      }
    };
  }, []);


  const checkDownloadedVoices = async () => {
    try {
      const voicesDir = new Directory(Paths.document, 'voices');
      
      if (!voicesDir.exists) {
        return;
      }
      
      const contents = voicesDir.list();
      const voices = new Set<string>();
      
      for (const item of contents) {
        if (item instanceof File && item.name.endsWith('.bin')) {
          if (item.name.startsWith('combined_')) {
            const voiceId = `combined_${item.name.replace('combined_', '').replace('.bin', '')}`;
            voices.add(voiceId);
          } else {
            const voiceId = item.name.replace('.bin', '');
            voices.add(voiceId);
          }
        }
      }
      
      setDownloadedVoices(voices);
      console.log('Downloaded voices:', voices);
    } catch (err) {
      console.error('Error checking downloaded voices:', err);
    }
  };


  const getVoiceDisplayName = (voiceId: string): string => {
    if (voiceId.startsWith('combined_')) {
      return voiceId.replace('combined_', '');
    }
    return VOICES[voiceId as keyof typeof VOICES]?.name || voiceId;
  };

  const isVoiceAvailable = (voiceId: string): boolean => {
    return downloadedVoices.has(voiceId);
  };


  const generateSpeech = async () => {
    if (!isModelInitialized) {
      Alert.alert('Model not initialized', 'Please wait for the model to initialize or download it first.');
      return;
    }

    if (!isVoiceAvailable(selectedVoice)) {
      Alert.alert('Voice not available', `Please download or select the "${getVoiceDisplayName(selectedVoice)}" voice first.`);
      return;
    }

    try {
      setIsGeneratingAudio(true);
      setError(null);
      
      let textToSpeak = text;
      
      // If in LLM mode, send text to LLM first
      if (isLLMMode) {
        if (!isLLMReady) {
          Alert.alert('LLM Not Ready', 'Please wait for the LLM to initialize before asking questions.');
          setIsGeneratingAudio(false);
          return;
        }
        
        try {
          setIsGeneratingResponse(true);
          
          // Add user message to conversation
          const userMessage = { role: 'user' as const, content: text };
          const updatedHistory = [...conversationHistory, userMessage];
          setConversationHistory(updatedHistory);
          
          // Generate LLM response
          const response = await llmService.generateResponse(text, conversationHistory);
          
          // Add assistant response to conversation
          const assistantMessage = { role: 'assistant' as const, content: response };
          setConversationHistory(prev => [...prev, assistantMessage]);
          
          // Use LLM response as text to speak
          textToSpeak = response;
        } catch (err: any) {
          console.error('Error in LLM flow:', err);
          setError(err.message || 'Failed to generate response. Please try again.');
          setIsGeneratingAudio(false);
          setIsGeneratingResponse(false);
          return;
        } finally {
          setIsGeneratingResponse(false);
        }
      }
      
      // Stop any existing streaming audio
      if (sound) {
        sound.release();
        setSound(null);
        setIsPlaying(false);
      }
      
      setIsStreaming(true);
      setStreamProgress(0);
      setTokensPerSecond(0);
      setTimeToFirstToken(0);
      setStreamingPhonemes("");
      
      // Generate and stream audio
      const progressCallback = (status: {
        progress: number;
        tokensPerSecond: number;
        position: number;
        duration: number;
        phonemes: string;
      }) => {
        setStreamProgress(status.progress);
        setTokensPerSecond(status.tokensPerSecond);
        setStreamPosition(status.position);
        setStreamDuration(status.duration);
        setStreamingPhonemes(status.phonemes);
      };
      const result = await KokoroOnnx.streamAudio(
        textToSpeak,
        selectedVoice,
        speed,
        progressCallback as any
      );
      
      // Update initial metrics
      setTokensPerSecond(result.tokensPerSecond);
      setTimeToFirstToken(result.timeToFirstToken);
      
    } catch (err) {
      console.error('Error generating speech:', err);
      setError('Error generating speech. Please try again.');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const playSound = async () => {
    if (!sound) {
      Alert.alert('No audio', 'Please generate audio first.');
      return;
    }

    try {
      if (isPlaying) {
        sound.pause();
        setIsPlaying(false);
      } else {
        sound.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Error playing sound:', err);
      setError('Error playing sound. Please try again.');
    }
  };

  const stopSound = async () => {
    if (!sound) {
      return;
    }

    try {
      sound.pause();
      sound.seekTo(0);
      setIsPlaying(false);
    } catch (err) {
      console.error('Error stopping sound:', err);
      setError('Error stopping sound. Please try again.');
    }
  };

  // Helper function to generate and play speech
  const generateAndPlaySpeech = async (textToSpeak: string) => {
    try {
      setIsGeneratingAudio(true);
      
      // Stop any existing streaming audio
      if (sound) {
        sound.release();
        setSound(null);
        setIsPlaying(false);
      }
      
      setIsStreaming(true);
      setStreamProgress(0);
      setTokensPerSecond(0);
      setTimeToFirstToken(0);
      setStreamingPhonemes("");
      
      // Generate and stream audio
      const progressCallback = (status: {
        progress: number;
        tokensPerSecond: number;
        position: number;
        duration: number;
        phonemes: string;
      }) => {
        setStreamProgress(status.progress);
        setTokensPerSecond(status.tokensPerSecond);
        setStreamPosition(status.position);
        setStreamDuration(status.duration);
        setStreamingPhonemes(status.phonemes);
      };
      const result = await KokoroOnnx.streamAudio(
        textToSpeak,
        selectedVoice,
        speed,
        progressCallback as any
      );
      
      // Update initial metrics
      setTokensPerSecond(result.tokensPerSecond);
      setTimeToFirstToken(result.timeToFirstToken);
      setIsGeneratingAudio(false);
    } catch (err) {
      console.error('Error generating speech:', err);
      setError('Error generating speech. Please try again.');
      setIsGeneratingAudio(false);
    }
  };



  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollView}
          style={styles.scrollViewContainer}
        >
        
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.title}>VoiceChat</Text>
            <TouchableOpacity 
              style={styles.settingsButton}
              onPress={() => router.push('/settings')}
            >
              <Ionicons name="settings-outline" size={24} color="#1c1c1e" />
            </TouchableOpacity>
          </View>
        </View>
          
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          
          {/* Current Settings Summary - Simple Row */}
          <View style={styles.settingsSummaryRow}>
            <Text style={styles.settingsSummaryText}>
              {currentModelId 
                ? MODELS[currentModelId].name 
                : selectedModelId 
                  ? MODELS[selectedModelId].name 
                  : 'Not set'} • {getVoiceDisplayName(selectedVoice)} • {speed.toFixed(1)}x • {isLLMMode ? 'AI' : 'TTS'}
            </Text>
            <TouchableOpacity 
              onPress={() => router.push('/settings')}
            >
              <Ionicons name="chevron-forward" size={20} color="#8e8e93" />
            </TouchableOpacity>
          </View>
          
          {isGeneratingResponse && (
            <View style={styles.generatingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.generatingText}>Generating response...</Text>
            </View>
          )}
          
          {/* Conversation History */}
          {isLLMMode && (
            <View style={styles.section}>
              <View style={styles.conversationHeader}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Conversation</Text>
                {conversationHistory.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearButtonInline}
                    onPress={() => setConversationHistory([])}
                  >
                    <Text style={styles.clearButtonText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              {conversationHistory.length > 0 ? (
                <ScrollView 
                  style={styles.conversationContainer} 
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={true}
                >
                  {conversationHistory.map((message, index) => {
                    const isInterim = index === conversationHistory.length - 1 && message.role === 'user' && interimTranscript && message.content === interimTranscript;
                    return (
                      <View
                        key={index}
                        style={[
                          styles.messageContainer,
                          message.role === 'user' ? styles.userMessage : styles.assistantMessage,
                          isInterim && styles.messageInterim,
                        ]}
                      >
                        <Text style={styles.messageRole}>
                          {message.role === 'user' ? 'You' : 'Assistant'}
                        </Text>
                        <Text style={styles.messageText}>{message.content}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.emptyConversationContainer}>
                  <Ionicons name="chatbubbles-outline" size={64} color="#c7c7cc" />
                  <Text style={styles.emptyConversationTitle}>Start a Conversation</Text>
                  <Text style={styles.emptyConversationText}>
                    Tap the microphone button below to start speaking. Your messages will appear here.
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
        
        {/* Fixed microphone button at bottom */}
        <View style={styles.fixedMicrophoneContainer}>
          <SpeechRecognition
            isReady={isLLMMode ? (isLLMReady && isModelInitialized && isVoiceAvailable(selectedVoice)) : (isModelInitialized && isVoiceAvailable(selectedVoice))}
            isGeneratingResponse={isGeneratingResponse}
            llmStatus={isLLMMode ? {
              isInitializing: isLLMInitializing,
              isDownloading: isLLMDownloading,
              isReady: isLLMReady,
              message: isLLMInitializing ? 'Initializing LLM...' : isLLMDownloading ? 'Downloading model...' : !isLLMReady ? 'LLM not ready' : undefined,
            } : undefined}
            onInterimResult={(text) => {
              // Add interim transcript to conversation immediately
              setInterimTranscript(text);
              // Update the last user message if it's an interim one, otherwise create a new one
              setConversationHistory(prev => {
                const lastMessage = prev[prev.length - 1];
                // Check if last message is a user message and might be interim (starts with same text or is similar)
                if (lastMessage && lastMessage.role === 'user') {
                  // Update existing interim message
                  return [...prev.slice(0, -1), { role: 'user' as const, content: text }];
                } else {
                  // Add new interim message
                  return [...prev, { role: 'user' as const, content: text }];
                }
              });
            }}
            onTranscriptionComplete={async (transcribedText) => {
              setInterimTranscript('');
              setText(transcribedText);
              setError(null);
              
              // Update the last message (which should be the interim one) with the final text
              setConversationHistory(prev => {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage && lastMessage.role === 'user') {
                  // Replace the interim message with the final one
                  return [...prev.slice(0, -1), { role: 'user' as const, content: transcribedText }];
                } else {
                  // Add new message if somehow there wasn't an interim one
                  return [...prev, { role: 'user' as const, content: transcribedText }];
                }
              });
              
              if (isLLMMode) {
                // LLM Mode: Send to LLM, then speak response
                if (!isLLMReady) {
                  Alert.alert(
                    'LLM Not Ready',
                    'Please wait for the LLM to initialize before asking questions.'
                  );
                  return;
                }
                
                if (!isModelInitialized || !isVoiceAvailable(selectedVoice)) {
                  Alert.alert(
                    'TTS Not Ready',
                    'Please ensure the TTS model is initialized and voice is downloaded.'
                  );
                  return;
                }
                
                try {
                  setIsGeneratingResponse(true);
                  
                  // Generate LLM response (pass history without the new user message since generateResponse adds it)
                  // Get the current history (which should have the final user message)
                  const historyForLLM = conversationHistory.slice(0, -1); // Remove the last user message since generateResponse adds it
                  
                  const response = await llmService.generateResponse(transcribedText, historyForLLM);
                  
                  // Add assistant response to conversation
                  const assistantMessage = { role: 'assistant' as const, content: response };
                  setConversationHistory(prev => [...prev, assistantMessage]);
                  
                  // Speak the response using Kokoro TTS
                  await generateAndPlaySpeech(response);
                } catch (err: any) {
                  console.error('Error in LLM flow:', err);
                  setError(err.message || 'Failed to generate response. Please try again.');
                } finally {
                  setIsGeneratingResponse(false);
                }
              } else {
                // Direct TTS Mode: convert transcribed text to speech
                if (isModelInitialized && isVoiceAvailable(selectedVoice)) {
                  await generateAndPlaySpeech(transcribedText);
                } else {
                  Alert.alert(
                    'Not Ready',
                    'Model or voice not ready. Please ensure the model is initialized and voice is downloaded.'
                  );
                }
              }
            }}
            disabled={isLLMMode ? (!isLLMReady || !isModelInitialized || !isVoiceAvailable(selectedVoice) || isGeneratingResponse) : (!isModelInitialized || !isVoiceAvailable(selectedVoice) || isGeneratingResponse)}
          />
        </View>
     </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollViewContainer: {
    flex: 1,
  },
  scrollView: {
    padding: 20,
    paddingBottom: 120, // Extra padding for fixed microphone button (reduced)
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1c1c1e',
    flex: 1,
    textAlign: 'center',
  },
  settingsButton: {
    padding: 8,
  },
  settingsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  settingsSummaryText: {
    fontSize: 14,
    color: '#636366',
    flex: 1,
  },
  voiceSelectorCard: {
    backgroundColor: '#f2f2f7',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  voiceSelectorContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voiceSelectorTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  selectedVoiceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  selectedVoiceType: {
    fontSize: 12,
    color: '#636366',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 16,
    color: '#636366',
    marginTop: 5,
  },
  section: {
    marginBottom: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#1c1c1e',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e5e5ea',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 16,
    color: '#1c1c1e',
  },
  modelVoiceRow: {
    flexDirection: 'row',
  },
  modelVoiceColumn: {
    flex: 1,
    marginRight: 10,
  },
  modelVoiceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#636366',
    marginBottom: 8,
  },
  modelSelectorCard: {
    backgroundColor: '#f2f2f7',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  modelSelectorContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelSelectorTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  modelSelectorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  modelSelectorSubtext: {
    fontSize: 12,
    color: '#636366',
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: '#8e8e93',
  },
  compactLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  compactLoadingText: {
    fontSize: 12,
    color: '#636366',
    marginLeft: 6,
  },
  compactWarningText: {
    fontSize: 12,
    color: '#ff6b6b',
    marginTop: 6,
  },
  speedSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactSpeedControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactSpeedButton: {
    backgroundColor: '#007AFF',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactSpeedButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  compactSpeedValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1c1e',
    minWidth: 50,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  voiceSelector: {
    marginBottom: 10,
  },
  voiceItem: {
    padding: 10,
    backgroundColor: '#f2f2f7',
    borderRadius: 8,
    marginRight: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  selectedVoiceItem: {
    backgroundColor: '#d1e7ff',
    borderColor: '#007AFF',
    borderWidth: 1,
  },
  undownloadedVoiceItem: {
    opacity: 0.7,
  },
  voiceName: {
    fontWeight: '600',
    fontSize: 14,
    color: '#1c1c1e',
  },
  voiceGender: {
    fontSize: 12,
    color: '#636366',
    marginTop: 2,
  },
  downloadIndicator: {
    fontSize: 16,
    color: '#007AFF',
    marginTop: 2,
  },
  streamingInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  streamingMetric: {
    fontSize: 14,
    color: '#636366',
  },
  streamProgressBar: {
    height: 4,
    backgroundColor: '#e5e5ea',
    borderRadius: 2,
    overflow: 'hidden',
  },
  streamProgress: {
    height: '100%',
    backgroundColor: '#34C759',
  },
  errorContainer: {
    backgroundColor: '#ffdddd',
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    borderColor: '#ff6b6b',
    borderWidth: 1,
  },
  errorText: {
    color: '#d63031',
    fontSize: 14,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    padding: 10,
  },
  loadingText: {
    marginLeft: 10,
    color: '#636366',
    fontSize: 14,
  },
  buttonContainer: {
    marginBottom: 20,
  },
  generateButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  generateButton: {
    backgroundColor: '#FF2D55',
  },
  playbackControls: {
    flexDirection: 'row',
    marginLeft: 10,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f2f2f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },
  iconButtonText: {
    fontSize: 24,
  },
  streamingMetricsContainer: {
    marginBottom: 10,
  },
  streamingMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  streamingMetricLabel: {
    fontSize: 14,
    color: '#636366',
    fontWeight: '500',
  },
  streamingMetricValue: {
    fontSize: 14,
    color: '#1c1c1e',
    fontWeight: '600',
  },
  phonemesContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f2f2f7',
    borderRadius: 8,
  },
  phonemesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#636366',
    marginBottom: 5,
  },
  phonemesText: {
    fontSize: 14,
    color: '#1c1c1e',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  responseContainer: {
    backgroundColor: '#f2f2f7',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  responseText: {
    fontSize: 16,
    color: '#1c1c1e',
    lineHeight: 24,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  conversationContainer: {
    maxHeight: 400,
    marginTop: 8,
  },
  messageContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  userMessage: {
    backgroundColor: '#e3f2fd',
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  assistantMessage: {
    backgroundColor: '#f2f2f7',
    alignSelf: 'flex-start',
    maxWidth: '80%',
  },
  messageRole: {
    fontSize: 12,
    fontWeight: '600',
    color: '#636366',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#1c1c1e',
    lineHeight: 20,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1c1e',
    marginRight: 10,
  },
  modeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f2f2f7',
    borderWidth: 1,
    borderColor: '#e5e5ea',
    marginLeft: 10,
  },
  modeButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#636366',
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  llmStatusContainer: {
    marginBottom: 15,
    padding: 12,
    backgroundColor: '#f2f2f7',
    borderRadius: 8,
  },
  llmStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  llmStatusText: {
    fontSize: 14,
    color: '#636366',
    marginLeft: 8,
  },
  llmStatusTextReady: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '600',
  },
  llmStatusTextError: {
    fontSize: 14,
    color: '#ff6b6b',
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 6,
    marginLeft: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  generatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  generatingText: {
    fontSize: 14,
    color: '#636366',
    marginLeft: 8,
  },
  clearButton: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#f2f2f7',
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonInline: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f2f2f7',
    borderRadius: 6,
  },
  clearButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  fixedMicrophoneContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  emptyConversationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyConversationTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1c1c1e',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyConversationText: {
    fontSize: 14,
    color: '#636366',
    textAlign: 'center',
    lineHeight: 20,
  },
  messageInterim: {
    opacity: 0.6,
  },
});

