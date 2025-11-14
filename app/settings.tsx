import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, Platform, Alert, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { File, Directory, Paths } from 'expo-file-system';
import { VOICES, getCombinedVoices } from '../kokoro/voices';
import KokoroOnnx from '../kokoro/kokoroOnnx';
import { MODELS, getDownloadedModels, downloadModel, isModelDownloaded } from '../kokoro/models';
import { useTTSStore } from '../store/ttsStore';
import llmService from '../kokoro/llmService';
import conversationDb from '../store/conversationDb';
import Speech from '@mhpdev/react-native-speech';

interface RNSpeechVoiceSelectorProps {
  selectedVoice: string | null;
  onVoiceSelected: (voice: string | null) => void;
}

function RNSpeechVoiceSelector({ selectedVoice, onVoiceSelected }: RNSpeechVoiceSelectorProps) {
  const [voices, setVoices] = useState<Array<{ identifier: string; name: string; language: string; quality?: 'Default' | 'Enhanced' }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const loadVoices = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('[RNSpeechVoiceSelector] Loading voices...');
      const availableVoices = await Speech.getAvailableVoices();
      console.log('[RNSpeechVoiceSelector] Loaded voices:', availableVoices.length, availableVoices);
      setVoices(availableVoices);
      // Auto-select first voice if none selected
      if (!selectedVoice && availableVoices.length > 0) {
        onVoiceSelected(availableVoices[0].identifier);
      }
    } catch (err) {
      console.error('[RNSpeechVoiceSelector] Error loading voices:', err);
      setVoices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVoices();
  }, [loadVoices]);

  // Reload voices when modal opens
  useEffect(() => {
    if (showModal) {
      loadVoices();
    }
  }, [showModal, loadVoices]);

  const selectedVoiceName = voices.find(v => v.identifier === selectedVoice)?.name || 'Default';

  return (
    <>
      <TouchableOpacity
        style={styles.voiceSelectorCard}
        onPress={() => setShowModal(true)}
      >
        <View style={styles.voiceSelectorContent}>
          <View style={styles.voiceSelectorTextContainer}>
            <Text style={styles.selectedVoiceName} numberOfLines={1}>
              {selectedVoiceName}
            </Text>
            <Text style={styles.selectedVoiceType} numberOfLines={1}>
              {voices.find(v => v.identifier === selectedVoice)?.language || 'System Voice'}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Voice</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.modalCloseButton}>Done</Text>
              </TouchableOpacity>
            </View>
            {isLoading ? (
              <View style={styles.modalLoadingContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.modalLoadingText}>Loading voices...</Text>
              </View>
            ) : voices.length === 0 ? (
              <View style={styles.modalEmptyContainer}>
                <Text style={styles.modalEmptyText}>No voices available</Text>
                <Text style={styles.modalEmptySubtext}>
                  Please check your device's text-to-speech settings or try reloading.
                </Text>
                <TouchableOpacity
                  style={styles.modalRetryButton}
                  onPress={loadVoices}
                >
                  <Text style={styles.modalRetryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={styles.modalScrollView}>
                {voices.map((voice) => (
                  <TouchableOpacity
                    key={voice.identifier}
                    style={[
                      styles.voiceOption,
                      selectedVoice === voice.identifier && styles.voiceOptionSelected,
                    ]}
                    onPress={() => {
                      onVoiceSelected(voice.identifier);
                      setShowModal(false);
                    }}
                  >
                    <View style={styles.voiceOptionContent}>
                      <Text style={[
                        styles.voiceOptionName,
                        selectedVoice === voice.identifier && styles.voiceOptionNameSelected,
                      ]}>
                        {voice.name}
                      </Text>
                      <Text style={styles.voiceOptionLanguage}>
                        {voice.language} {voice.quality && `• ${voice.quality}`}
                      </Text>
                    </View>
                    {selectedVoice === voice.identifier && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function Settings() {
  const router = useRouter();
  const {
    selectedVoice,
    setSelectedVoice,
    selectedModelId,
    setSelectedModelId,
    currentModelId,
    setCurrentModelId,
    isModelInitialized,
    setIsModelInitialized,
    downloadedModels,
    setDownloadedModels,
    downloadedVoices,
    setDownloadedVoices,
    speed,
    setSpeed,
    isLLMMode,
    setIsLLMMode,
    ttsEngine,
    setTTSEngine,
    rnSpeechVoice,
    setRNSpeechVoice,
  } = useTTSStore();
  const [error, setError] = useState<string | null>(null);
  const [isInitializingModel, setIsInitializingModel] = useState(false);
  const [isDownloadingTTSModel, setIsDownloadingTTSModel] = useState(false);
  const [isLLMInitializing, setIsLLMInitializing] = useState(false);
  const [isLLMDownloading, setIsLLMDownloading] = useState(false);
  const [isLLMReady, setIsLLMReady] = useState(false);

  // Initialize on mount
  useEffect(() => {
    initializeModels();
    initializeLLM();
  }, []);

  // Reload voice selection when returning from voices page
  useFocusEffect(
    React.useCallback(() => {
      checkDownloadedVoices();
    }, [])
  );

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
      console.error('[Settings] Error initializing LLM:', err);
      setIsLLMInitializing(false);
      setError('Failed to initialize LLM. Please try again.');
    }
  };

  // Initialize models - download if needed and set as active
  const initializeModels = async () => {
    console.log('[Settings] Starting model initialization...');
    
    // Check and download TTS model (model_q8f16.onnx) - this is required
    await ensureTTSModelDownloaded();
    
    // Check voices
    checkDownloadedVoices();
  };

  // Ensure TTS model (model_q8f16.onnx) is downloaded and active
  const ensureTTSModelDownloaded = async () => {
    try {
      const requiredModelId = 'model_q8f16.onnx' as keyof typeof MODELS;
      console.log('[Settings] Checking TTS model:', requiredModelId);
      
      const isDownloaded = await isModelDownloaded(requiredModelId);
      console.log('[Settings] TTS model downloaded:', isDownloaded);
      
      if (!isDownloaded) {
        console.log('[Settings] TTS model not found, downloading...');
        setIsDownloadingTTSModel(true);
        
        const success = await downloadModel(requiredModelId);
        setIsDownloadingTTSModel(false);
        
        if (success) {
          console.log('[Settings] ✓ TTS model downloaded successfully');
          // Update downloaded models list
          await checkDownloadedModels();
          // Set as selected and active
          setSelectedModelId(requiredModelId);
        } else {
          console.error('[Settings] ✗ Failed to download TTS model');
          setError('Failed to download TTS model. Please check your connection.');
        }
      } else {
        // Model is downloaded, ensure it's set as active
        console.log('[Settings] TTS model already downloaded, setting as active...');
        setSelectedModelId(requiredModelId);
        await checkDownloadedModels();
      }
    } catch (err) {
      console.error('[Settings] ✗ Error ensuring TTS model:', err);
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

  const getVoiceDisplayName = (voiceId: string): string => {
    if (voiceId.startsWith('combined_')) {
      return voiceId.replace('combined_', '');
    }
    return VOICES[voiceId as keyof typeof VOICES]?.name || voiceId;
  };

  const isVoiceAvailable = (voiceId: string): boolean => {
    return downloadedVoices.has(voiceId);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollView}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
        </View>
          
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        
        {/* TTS Engine Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TTS Engine</Text>
          <View style={styles.modeToggleContainer}>
            <TouchableOpacity
              style={[styles.modeButton, ttsEngine === 'kokoro' && styles.modeButtonActive]}
              onPress={() => setTTSEngine('kokoro')}
            >
              <Text style={[styles.modeButtonText, ttsEngine === 'kokoro' && styles.modeButtonTextActive]}>
                Kokoro
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, ttsEngine === 'react-native-speech' && styles.modeButtonActive]}
              onPress={() => setTTSEngine('react-native-speech')}
            >
              <Text style={[styles.modeButtonText, ttsEngine === 'react-native-speech' && styles.modeButtonTextActive]}>
                Native TTS
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* TTS Model Selection - Only show for Kokoro */}
        {ttsEngine === 'kokoro' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TTS Model</Text>
            <TouchableOpacity
              style={styles.modelSelectorCard}
              onPress={() => router.push('/models')}
            >
              <View style={styles.modelSelectorContent}>
                <View style={styles.modelSelectorTextContainer}>
                  <Text style={styles.modelSelectorText} numberOfLines={1}>
                    {currentModelId 
                      ? MODELS[currentModelId].name 
                      : selectedModelId 
                        ? MODELS[selectedModelId].name 
                        : 'Select Model'}
                  </Text>
                  <Text style={styles.modelSelectorSubtext} numberOfLines={1}>
                    {currentModelId 
                      ? MODELS[currentModelId].size 
                      : selectedModelId 
                        ? MODELS[selectedModelId].size 
                        : 'No model'}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>
            {(isInitializingModel || isDownloadingTTSModel) && (
              <View style={styles.compactLoadingContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.compactLoadingText}>
                  {isDownloadingTTSModel ? 'Downloading...' : 'Initializing...'}
                </Text>
              </View>
            )}
            {!isModelInitialized && !isInitializingModel && !isDownloadingTTSModel && (currentModelId || selectedModelId) && (
              <Text style={styles.compactWarningText}>Not initialized</Text>
            )}
          </View>
        )}

        {/* Voice Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Voice</Text>
          {ttsEngine === 'kokoro' ? (
            <>
              <TouchableOpacity
                style={styles.voiceSelectorCard}
                onPress={async () => {
                  await router.push('/voices');
                  await checkDownloadedVoices();
                }}
              >
                <View style={styles.voiceSelectorContent}>
                  <View style={styles.voiceSelectorTextContainer}>
                    <Text style={styles.selectedVoiceName} numberOfLines={1}>
                      {getVoiceDisplayName(selectedVoice)}
                    </Text>
                    <Text style={styles.selectedVoiceType} numberOfLines={1}>
                      {selectedVoice.startsWith('combined_') ? 'Combined' : 'Standard'}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </TouchableOpacity>
              {!isVoiceAvailable(selectedVoice) && (
                <Text style={styles.compactWarningText}>Not available</Text>
              )}
            </>
          ) : (
            <RNSpeechVoiceSelector
              selectedVoice={rnSpeechVoice}
              onVoiceSelected={setRNSpeechVoice}
            />
          )}
        </View>

        {/* Speed Control */}
        <View style={styles.section}>
          <View style={styles.speedSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Speed</Text>
            <View style={styles.compactSpeedControls}>
              <TouchableOpacity 
                style={styles.compactSpeedButton}
                onPress={() => setSpeed(Math.max(0.5, speed - 0.1))}
                disabled={speed <= 0.5}
              >
                <Text style={styles.compactSpeedButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.compactSpeedValue}>{speed.toFixed(1)}x</Text>
              <TouchableOpacity 
                style={styles.compactSpeedButton}
                onPress={() => setSpeed(Math.min(2.0, speed + 0.1))}
                disabled={speed >= 2.0}
              >
                <Text style={styles.compactSpeedButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Mode Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mode</Text>
          <View style={styles.modeToggleContainer}>
            <TouchableOpacity
              style={[styles.modeButton, isLLMMode && styles.modeButtonActive]}
              onPress={() => setIsLLMMode(true)}
            >
              <Text style={[styles.modeButtonText, isLLMMode && styles.modeButtonTextActive]}>
                AI Assistant
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, !isLLMMode && styles.modeButtonActive]}
              onPress={() => setIsLLMMode(false)}
            >
              <Text style={[styles.modeButtonText, !isLLMMode && styles.modeButtonTextActive]}>
                Direct TTS
              </Text>
            </TouchableOpacity>
          </View>
          
          {isLLMMode && (
            <View style={styles.llmStatusContainer}>
              {isLLMInitializing || isLLMDownloading ? (
                <View style={styles.llmStatusRow}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={styles.llmStatusText}>
                    {isLLMDownloading ? 'Downloading Qwen2.5-0.5B model (~600MB)...' : 'Initializing LLM...'}
                  </Text>
                </View>
              ) : isLLMReady ? (
                <View style={styles.llmStatusRow}>
                  <Text style={styles.llmStatusTextReady}>✓ LLM Ready</Text>
                </View>
              ) : (
                <View style={styles.llmStatusRow}>
                  <Text style={styles.llmStatusTextError}>LLM not ready</Text>
                  <TouchableOpacity onPress={initializeLLM} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Clear Conversations */}
        {isLLMMode && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Conversation History</Text>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={async () => {
                Alert.alert(
                  'Clear Conversations',
                  'Are you sure you want to clear all conversation history? This cannot be undone.',
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel',
                    },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await conversationDb.initialize();
                          await conversationDb.clearAllMessages();
                          Alert.alert('Success', 'Conversation history cleared');
                        } catch (error) {
                          console.error('[Settings] Error clearing conversations:', error);
                          Alert.alert('Error', 'Failed to clear conversation history');
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={styles.clearButtonText}>Clear All Conversations</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  scrollView: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    marginRight: 15,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1c1c1e',
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
  modeToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  modeButton: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f2f2f7',
    borderWidth: 1,
    borderColor: '#e5e5ea',
    marginRight: 10,
    alignItems: 'center',
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
    marginTop: 15,
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
  clearButton: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#ff3b30',
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  modalCloseButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  modalLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  modalLoadingText: {
    fontSize: 14,
    color: '#636366',
    marginLeft: 8,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  voiceOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f7',
  },
  voiceOptionSelected: {
    backgroundColor: '#e3f2fd',
  },
  voiceOptionContent: {
    flex: 1,
  },
  voiceOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1c1e',
    marginBottom: 4,
  },
  voiceOptionNameSelected: {
    color: '#007AFF',
  },
  voiceOptionLanguage: {
    fontSize: 12,
    color: '#636366',
  },
  checkmark: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: 'bold',
    marginLeft: 10,
  },
  modalEmptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEmptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1c1c1e',
    marginBottom: 8,
  },
  modalEmptySubtext: {
    fontSize: 14,
    color: '#636366',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalRetryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  modalRetryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

