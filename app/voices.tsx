import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { File, Directory, Paths } from 'expo-file-system';
import { VOICES, combineVoices, saveCombinedVoice, getCombinedVoices } from '../kokoro/voices';
import KokoroOnnx from '../kokoro/kokoroOnnx';
import { useTTSStore } from '../store/ttsStore';

interface VoiceSelection {
  voiceId: keyof typeof VOICES;
  weight: number;
}

export default function Voices() {
  const router = useRouter();
  const {
    selectedVoice,
    setSelectedVoice,
    downloadedVoices,
    setDownloadedVoices,
  } = useTTSStore();
  
  const [activeTab, setActiveTab] = useState<'select' | 'combine'>('select');
  const [selectedVoiceForUse, setSelectedVoiceForUse] = useState<string>(selectedVoice);
  const [selectedVoices, setSelectedVoices] = useState<VoiceSelection[]>([]);
  const [combinedVoiceName, setCombinedVoiceName] = useState('');
  const [isCombining, setIsCombining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCombinedVoices, setSavedCombinedVoices] = useState<string[]>([]);
  const [availableVoices, setAvailableVoices] = useState<string[]>(Object.keys(VOICES));
  const [isVoiceDownloading, setIsVoiceDownloading] = useState(false);

  useEffect(() => {
    checkDownloadedVoices();
    loadSavedCombinedVoices();
    setSelectedVoiceForUse(selectedVoice);
  }, [selectedVoice]);

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
    } catch (err) {
      console.error('Error checking downloaded voices:', err);
    }
  };

  const loadSavedCombinedVoices = async () => {
    try {
      const combined = await getCombinedVoices();
      setSavedCombinedVoices(combined);
    } catch (err) {
      console.error('Error loading combined voices:', err);
    }
  };

  const downloadVoice = async (voiceId: keyof typeof VOICES) => {
    try {
      setIsVoiceDownloading(true);
      setError(null);
      
      const success = await KokoroOnnx.downloadVoice(voiceId);
      
      if (success) {
        await checkDownloadedVoices();
        Alert.alert('Success', `Voice "${VOICES[voiceId].name}" downloaded successfully!`);
      } else {
        setError(`Failed to download voice "${VOICES[voiceId].name}". Please try again.`);
      }
    } catch (err) {
      console.error('Error downloading voice:', err);
      setError('Error downloading voice. Please try again.');
    } finally {
      setIsVoiceDownloading(false);
    }
  };

  const selectVoice = (voiceId: string) => {
    setSelectedVoiceForUse(voiceId);
    setSelectedVoice(voiceId);
    // Navigate back
    router.back();
  };

  const addVoice = (voiceId: keyof typeof VOICES) => {
    if (selectedVoices.find(v => v.voiceId === voiceId)) {
      Alert.alert('Voice already added', 'This voice is already in your combination.');
      return;
    }

    setSelectedVoices([...selectedVoices, { voiceId, weight: 1.0 }]);
  };

  const removeVoice = (voiceId: keyof typeof VOICES) => {
    setSelectedVoices(selectedVoices.filter(v => v.voiceId !== voiceId));
  };

  const updateWeight = (voiceId: keyof typeof VOICES, weight: number) => {
    setSelectedVoices(selectedVoices.map(v => 
      v.voiceId === voiceId ? { ...v, weight: Math.max(0, weight) } : v
    ));
  };

  const normalizeWeights = () => {
    const totalWeight = selectedVoices.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight <= 0) return;
    
    setSelectedVoices(selectedVoices.map(v => ({
      ...v,
      weight: v.weight / totalWeight
    })));
  };

  const combineSelectedVoices = async () => {
    if (selectedVoices.length === 0) {
      Alert.alert('No voices selected', 'Please add at least one voice to combine.');
      return;
    }

    if (!combinedVoiceName.trim()) {
      Alert.alert('Name required', 'Please enter a name for your combined voice.');
      return;
    }

    // Check if all voices are downloaded
    const missingVoices = selectedVoices.filter(v => !downloadedVoices.has(v.voiceId));
    if (missingVoices.length > 0) {
      Alert.alert(
        'Voices not downloaded',
        `Please download the following voices first: ${missingVoices.map(v => VOICES[v.voiceId].name).join(', ')}`
      );
      return;
    }

    try {
      setIsCombining(true);
      setError(null);

      // Combine voices
      const combinedData = await combineVoices(selectedVoices);
      
      // Save combined voice
      const success = await saveCombinedVoice(combinedVoiceName.trim(), combinedData);
      
      if (success) {
        Alert.alert('Success', `Combined voice "${combinedVoiceName}" created successfully!`);
        const newCombinedVoiceId = `combined_${combinedVoiceName.trim()}`;
        setCombinedVoiceName('');
        setSelectedVoices([]);
        await loadSavedCombinedVoices();
        await checkDownloadedVoices();
        // Switch to select tab and select the new combined voice
        setActiveTab('select');
        setSelectedVoiceForUse(newCombinedVoiceId);
        setSelectedVoice(newCombinedVoiceId);
      } else {
        setError('Failed to save combined voice');
      }
    } catch (err: any) {
      console.error('Error combining voices:', err);
      setError(err.message || 'Error combining voices. Please try again.');
    } finally {
      setIsCombining(false);
    }
  };

  const deleteCombinedVoice = async (name: string) => {
    try {
      const voicesDir = new Directory(Paths.document, 'voices');
      const fileName = `combined_${name}.bin`;
      const voiceFile = new File(voicesDir, fileName);
      
      if (voiceFile.exists) {
        voiceFile.delete();
        await loadSavedCombinedVoices();
        await checkDownloadedVoices();
        // If the deleted voice was selected, clear selection
        if (selectedVoiceForUse === `combined_${name}`) {
          setSelectedVoiceForUse('');
          setSelectedVoice('af_heart'); // Reset to default
        }
        Alert.alert('Success', `Combined voice "${name}" deleted successfully!`);
      }
    } catch (err) {
      console.error('Error deleting combined voice:', err);
      Alert.alert('Error', 'Failed to delete combined voice.');
    }
  };

  const getVoiceDisplayName = (voiceId: string): string => {
    if (voiceId.startsWith('combined_')) {
      return voiceId.replace('combined_', '');
    }
    return VOICES[voiceId as keyof typeof VOICES]?.name || voiceId;
  };

  const totalWeight = selectedVoices.reduce((sum, v) => sum + v.weight, 0);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView contentContainerStyle={styles.scrollView}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => {
              // Return selected voice when going back
              router.back();
            }} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Voice Management</Text>
            <Text style={styles.subtitle}>Select or combine voices</Text>
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Tab Selector */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'select' && styles.activeTab]}
              onPress={() => setActiveTab('select')}
            >
              <Text style={[styles.tabText, activeTab === 'select' && styles.activeTabText]}>Select Voice</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'combine' && styles.activeTab]}
              onPress={() => setActiveTab('combine')}
            >
              <Text style={[styles.tabText, activeTab === 'combine' && styles.activeTabText]}>Combine Voices</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'select' ? (
            <>
              {/* Current Selection */}
              {selectedVoiceForUse && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Currently Selected</Text>
                  <View style={styles.currentVoiceCard}>
                    <Text style={styles.currentVoiceName}>{getVoiceDisplayName(selectedVoiceForUse)}</Text>
                    <Text style={styles.currentVoiceType}>
                      {selectedVoiceForUse.startsWith('combined_') ? 'Combined Voice' : 'Standard Voice'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Standard Voices */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Standard Voices</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.voiceSelector}>
                  {availableVoices.map((voiceId) => {
                    const isDownloaded = downloadedVoices.has(voiceId);
                    const isSelected = selectedVoiceForUse === voiceId;
                    return (
                      <TouchableOpacity
                        key={voiceId}
                        style={[
                          styles.voiceItem,
                          isSelected && styles.selectedVoiceItem,
                          !isDownloaded && styles.undownloadedVoiceItem
                        ]}
                        onPress={() => isDownloaded ? selectVoice(voiceId) : null}
                        disabled={!isDownloaded}
                      >
                        <Text style={styles.voiceItemName}>{VOICES[voiceId as keyof typeof VOICES].name}</Text>
                        <Text style={styles.voiceItemGender}>{VOICES[voiceId as keyof typeof VOICES].gender}</Text>
                        {!isDownloaded && (
                          <>
                            <Text style={styles.downloadIndicator}>↓</Text>
                            <TouchableOpacity
                              style={styles.downloadButtonSmall}
                              onPress={() => downloadVoice(voiceId as keyof typeof VOICES)}
                              disabled={isVoiceDownloading}
                            >
                              <Text style={styles.downloadButtonSmallText}>Download</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        {isSelected && (
                          <Text style={styles.selectedIndicator}>✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Combined Voices */}
              {savedCombinedVoices.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Combined Voices</Text>
                  {savedCombinedVoices.map((name) => {
                    const combinedId = `combined_${name}`;
                    const isSelected = selectedVoiceForUse === combinedId;
                    return (
                      <View key={name} style={[styles.combinedVoiceRow, isSelected && styles.selectedCombinedVoiceRow]}>
                        <TouchableOpacity
                          style={styles.combinedVoiceInfo}
                          onPress={() => selectVoice(combinedId)}
                        >
                          <Text style={styles.combinedVoiceName}>{name}</Text>
                          <Text style={styles.combinedVoiceType}>Combined Voice</Text>
                        </TouchableOpacity>
                        {isSelected && <Text style={styles.selectedIndicator}>✓</Text>}
                        <TouchableOpacity
                          style={styles.deleteCombinedButton}
                          onPress={() => deleteCombinedVoice(name)}
                        >
                          <Text style={styles.deleteCombinedButtonText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          ) : (
            <>
              {/* Combine Voices Tab */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Selected Voices for Combination</Text>
                {selectedVoices.length === 0 ? (
                  <Text style={styles.emptyText}>No voices selected. Add voices below.</Text>
                ) : (
                  <>
                    {selectedVoices.map((voice) => (
                      <View key={voice.voiceId} style={styles.voiceRow}>
                        <View style={styles.voiceInfo}>
                          <Text style={styles.voiceName}>{VOICES[voice.voiceId].name}</Text>
                          <Text style={styles.voiceGender}>{VOICES[voice.voiceId].gender}</Text>
                        </View>
                        <View style={styles.weightControls}>
                          <TouchableOpacity
                            style={styles.weightButton}
                            onPress={() => updateWeight(voice.voiceId, voice.weight - 0.1)}
                            disabled={voice.weight <= 0}
                          >
                            <Text style={styles.weightButtonText}>-</Text>
                          </TouchableOpacity>
                          <TextInput
                            style={styles.weightInput}
                            value={voice.weight.toFixed(2)}
                            onChangeText={(text) => {
                              const num = parseFloat(text) || 0;
                              updateWeight(voice.voiceId, num);
                            }}
                            keyboardType="numeric"
                          />
                          <TouchableOpacity
                            style={styles.weightButton}
                            onPress={() => updateWeight(voice.voiceId, voice.weight + 0.1)}
                          >
                            <Text style={styles.weightButtonText}>+</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.removeButton}
                            onPress={() => removeVoice(voice.voiceId)}
                          >
                            <Text style={styles.removeButtonText}>×</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                    <View style={styles.weightSummary}>
                      <Text style={styles.weightSummaryText}>
                        Total Weight: {totalWeight.toFixed(2)}
                        {totalWeight !== 1.0 && totalWeight > 0 && (
                          <Text style={styles.normalizeHint}> (will be normalized)</Text>
                        )}
                      </Text>
                      {totalWeight !== 1.0 && totalWeight > 0 && (
                        <TouchableOpacity style={styles.normalizeButton} onPress={normalizeWeights}>
                          <Text style={styles.normalizeButtonText}>Normalize</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Available Voices</Text>
                <Text style={styles.sectionSubtitle}>Tap to add voices to your combination</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.voiceSelector}>
                  {availableVoices.map((voiceId) => {
                    const isDownloaded = downloadedVoices.has(voiceId);
                    const isSelected = selectedVoices.find(v => v.voiceId === voiceId);
                    return (
                      <TouchableOpacity
                        key={voiceId}
                        style={[
                          styles.voiceItem,
                          isSelected && styles.selectedVoiceItem,
                          !isDownloaded && styles.undownloadedVoiceItem
                        ]}
                        onPress={() => isDownloaded ? addVoice(voiceId as keyof typeof VOICES) : null}
                        disabled={!isDownloaded || !!isSelected}
                      >
                        <Text style={styles.voiceItemName}>{VOICES[voiceId as keyof typeof VOICES].name}</Text>
                        <Text style={styles.voiceItemGender}>{VOICES[voiceId as keyof typeof VOICES].gender}</Text>
                        {!isDownloaded && (
                          <Text style={styles.downloadIndicator}>↓</Text>
                        )}
                        {isSelected && (
                          <Text style={styles.selectedIndicator}>✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Save Combined Voice</Text>
                <TextInput
                  style={styles.nameInput}
                  value={combinedVoiceName}
                  onChangeText={setCombinedVoiceName}
                  placeholder="Enter name for combined voice"
                  placeholderTextColor="#8e8e93"
                />
                <TouchableOpacity
                  style={[styles.combineButton, (isCombining || selectedVoices.length === 0) && styles.combineButtonDisabled]}
                  onPress={combineSelectedVoices}
                  disabled={isCombining || selectedVoices.length === 0}
                >
                  {isCombining ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.combineButtonText}>Create Combined Voice</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
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
  scrollView: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  subtitle: {
    fontSize: 16,
    color: '#636366',
    marginTop: 5,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#636366',
  },
  activeTabText: {
    color: '#ffffff',
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
  sectionSubtitle: {
    fontSize: 14,
    color: '#636366',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 14,
    color: '#8e8e93',
    fontStyle: 'italic',
  },
  currentVoiceCard: {
    backgroundColor: '#d1e7ff',
    padding: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  currentVoiceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  currentVoiceType: {
    fontSize: 14,
    color: '#636366',
    marginTop: 4,
  },
  voiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
  },
  voiceInfo: {
    flex: 1,
  },
  voiceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  voiceGender: {
    fontSize: 12,
    color: '#636366',
    marginTop: 2,
  },
  weightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weightButton: {
    backgroundColor: '#007AFF',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  weightInput: {
    width: 60,
    height: 35,
    borderWidth: 1,
    borderColor: '#e5e5ea',
    borderRadius: 8,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontSize: 14,
    color: '#1c1c1e',
  },
  removeButton: {
    backgroundColor: '#FF3B30',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },
  removeButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  weightSummary: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e5ea',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weightSummaryText: {
    fontSize: 14,
    color: '#636366',
  },
  normalizeHint: {
    fontSize: 12,
    color: '#8e8e93',
  },
  normalizeButton: {
    backgroundColor: '#34C759',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  normalizeButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  voiceSelector: {
    marginTop: 10,
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
    opacity: 0.5,
  },
  voiceItemName: {
    fontWeight: '600',
    fontSize: 14,
    color: '#1c1c1e',
  },
  voiceItemGender: {
    fontSize: 12,
    color: '#636366',
    marginTop: 2,
  },
  downloadIndicator: {
    fontSize: 16,
    color: '#007AFF',
    marginTop: 2,
  },
  downloadButtonSmall: {
    backgroundColor: '#007AFF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  downloadButtonSmallText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  selectedIndicator: {
    fontSize: 16,
    color: '#34C759',
    marginTop: 2,
    fontWeight: 'bold',
  },
  combinedVoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f2f2f7',
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedCombinedVoiceRow: {
    backgroundColor: '#d1e7ff',
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  combinedVoiceInfo: {
    flex: 1,
  },
  combinedVoiceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  combinedVoiceType: {
    fontSize: 12,
    color: '#636366',
    marginTop: 2,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: '#e5e5ea',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1c1c1e',
    marginBottom: 15,
  },
  combineButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  combineButtonDisabled: {
    backgroundColor: '#8e8e93',
    opacity: 0.6,
  },
  combineButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  deleteCombinedButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  deleteCombinedButtonText: {
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
});
