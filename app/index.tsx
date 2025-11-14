import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { File, Directory, Paths } from 'expo-file-system';
import { setAudioModeAsync } from 'expo-audio';
import { VOICES } from '../kokoro/voices';
import KokoroOnnx from '../kokoro/kokoroOnnx';
import { MODELS, getDownloadedModels, downloadModel, isModelDownloaded } from '../kokoro/models';
import { useTTSStore } from '../store/ttsStore';
import SpeechRecognition from '../components/SpeechRecognition';
import llmService from '../kokoro/llmService';
import conversationDb from '../store/conversationDb';
import { generateSpeech } from '../utils/speechWrapper';

export default function Index() {
  const router = useRouter();
  const {
    selectedVoice,
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
    speed,
    isLLMMode,
    ttsEngine,
    rnSpeechVoice,
  } = useTTSStore();

  const [error, setError] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  
  // LLM state
  const [isLLMInitializing, setIsLLMInitializing] = useState(false);
  const [isLLMDownloading, setIsLLMDownloading] = useState(false);
  const [isLLMReady, setIsLLMReady] = useState(false);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const conversationScrollViewRef = useRef<ScrollView>(null);

  // TTS Model initialization state
  const [isInitializingModel, setIsInitializingModel] = useState(false);
  const [isDownloadingTTSModel, setIsDownloadingTTSModel] = useState(false);

  // Initialize models, LLM, and load conversations on mount
  useEffect(() => {
    initializeModels();
    initializeLLM();
    loadConversations();
  }, []);

  // Load conversations from database
  const loadConversations = async () => {
    try {
      await conversationDb.initialize();
      const messages = await conversationDb.getAllMessages();
      setConversationHistory(messages);
      console.log('[App] ✓ Loaded', messages.length, 'messages from database');
    } catch (error) {
      console.error('[App] ✗ Error loading conversations:', error);
    }
  };

  // Helper function to add message to both state and database
  const addMessageToConversation = async (role: 'user' | 'assistant', content: string) => {
    // Add to state immediately
    setConversationHistory(prev => [...prev, { role, content }]);
    
    // Save to database
    try {
      await conversationDb.initialize();
      await conversationDb.addMessage(role, content);
    } catch (error) {
      console.error('[App] ✗ Error saving message to database:', error);
    }
  };

  // Helper function to clear conversation from both state and database
  const clearConversation = async () => {
    try {
      await conversationDb.clearAllMessages();
      setConversationHistory([]);
      Alert.alert('Success', 'Conversation history cleared');
    } catch (error) {
      console.error('[App] Error clearing conversations:', error);
      Alert.alert('Error', 'Failed to clear conversation history');
    }
  };

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
  }, []);

  // Auto-scroll conversation when new messages are added
  useEffect(() => {
    if (conversationHistory.length > 0 && conversationScrollViewRef.current) {
      // Use setTimeout to ensure the content has been rendered before scrolling
      setTimeout(() => {
        conversationScrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [conversationHistory, interimTranscript]);


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


  // Helper function to generate and play speech
  const generateAndPlaySpeech = async (textToSpeak: string) => {
    try {
      setIsGeneratingAudio(true);
      
      // Use the unified speech wrapper that handles both engines
      await generateSpeech({
        engine: ttsEngine,
        text: textToSpeak,
        kokoroVoice: selectedVoice,
        kokoroSpeed: speed,
        rnSpeechVoice: rnSpeechVoice,
        rnSpeechSpeed: speed, // Map speed to react-native-speech rate (0.0-1.0, where 1.0 is normal)
        onProgress: () => {}, // Progress callback (not used currently)
      });
      
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
              {ttsEngine === 'kokoro' 
                ? `${currentModelId ? MODELS[currentModelId].name : selectedModelId ? MODELS[selectedModelId].name : 'Not set'} • ${getVoiceDisplayName(selectedVoice)}`
                : 'Native TTS'} • {speed.toFixed(1)}x • {isLLMMode ? 'AI' : 'TTS'}
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
                    onPress={clearConversation}
                  >
                    <Text style={styles.clearButtonText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              {conversationHistory.length > 0 ? (
                <ScrollView 
                  ref={conversationScrollViewRef}
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
            isReady={isLLMMode 
              ? (isLLMReady && (ttsEngine === 'react-native-speech' || (isModelInitialized && isVoiceAvailable(selectedVoice))))
              : (ttsEngine === 'react-native-speech' || (isModelInitialized && isVoiceAvailable(selectedVoice)))}
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
              setError(null);
              
              // Update the last message (which should be the interim one) with the final text
              // Interim messages are not saved to DB, only final ones
              let updatedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
              setConversationHistory(prev => {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage && lastMessage.role === 'user') {
                  // Replace the interim message with the final one
                  updatedHistory = [...prev.slice(0, -1), { role: 'user' as const, content: transcribedText }];
                } else {
                  // Add new message if somehow there wasn't an interim one
                  updatedHistory = [...prev, { role: 'user' as const, content: transcribedText }];
                }
                return updatedHistory;
              });
              
              // Save the final user message to database
              try {
                await conversationDb.initialize();
                await conversationDb.addMessage('user', transcribedText);
              } catch (err) {
                console.error('[App] Error saving user message:', err);
              }
              
              if (isLLMMode) {
                // LLM Mode: Send to LLM, then speak response
                if (!isLLMReady) {
                  Alert.alert(
                    'LLM Not Ready',
                    'Please wait for the LLM to initialize before asking questions.'
                  );
                  return;
                }
                
                if (ttsEngine === 'kokoro' && (!isModelInitialized || !isVoiceAvailable(selectedVoice))) {
                  Alert.alert(
                    'TTS Not Ready',
                    'Please ensure the TTS model is initialized and voice is downloaded.'
                  );
                  return;
                }
                
                try {
                  setIsGeneratingResponse(true);
                  
                  // Get history for LLM (without the user message we just added, since generateResponse adds it)
                  const historyForLLM = updatedHistory.slice(0, -1);
                  
                  const response = await llmService.generateResponse(transcribedText, historyForLLM);
                  
                  // Add assistant response to conversation
                  await addMessageToConversation('assistant', response);
                  
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
                if (ttsEngine === 'react-native-speech' || (isModelInitialized && isVoiceAvailable(selectedVoice))) {
                  await generateAndPlaySpeech(transcribedText);
                } else {
                  Alert.alert(
                    'Not Ready',
                    'Model or voice not ready. Please ensure the model is initialized and voice is downloaded.'
                  );
                }
              }
            }}
            disabled={isLLMMode 
              ? (!isLLMReady || (ttsEngine === 'kokoro' && (!isModelInitialized || !isVoiceAvailable(selectedVoice))) || isGeneratingResponse)
              : ((ttsEngine === 'kokoro' && (!isModelInitialized || !isVoiceAvailable(selectedVoice))) || isGeneratingResponse)}
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

