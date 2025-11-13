import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView, Alert, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MODELS, downloadModel, getDownloadedModels, deleteModel } from '../kokoro/models';
import KokoroOnnx from '../kokoro/kokoroOnnx';
import { useTTSStore } from '../store/ttsStore';

export default function Models() {
  const router = useRouter();
  const {
    selectedModelId,
    setSelectedModelId,
    currentModelId,
    setCurrentModelId,
    isModelInitialized,
    setIsModelInitialized,
    downloadedModels,
    setDownloadedModels,
  } = useTTSStore();

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkDownloadedModels();
  }, []);

  const checkDownloadedModels = async () => {
    try {
      const models = await getDownloadedModels();
      setDownloadedModels(models);
    } catch (err) {
      console.error('Error checking downloaded models:', err);
      setError('Error checking downloaded models');
    }
  };

  const downloadSelectedModel = async (modelId: keyof typeof MODELS) => {
    if (isDownloading) {
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      setError(null);

      const success = await downloadModel(modelId, (progress) => {
        setDownloadProgress(progress);
      });

      if (success) {
        await checkDownloadedModels();
        Alert.alert('Success', `Model ${MODELS[modelId].name} downloaded successfully!`);
        
        // Auto-initialize if this is the selected model
        if (modelId === selectedModelId) {
          await initializeModel(modelId);
        }
      } else {
        setError(`Failed to download model ${MODELS[modelId].name}. Please try again.`);
      }
    } catch (err) {
      console.error('Error downloading model:', err);
      setError('Error downloading model. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const deleteSelectedModel = async (modelId: keyof typeof MODELS) => {
    try {
      // Don't delete the currently loaded model
      if (modelId === currentModelId) {
        Alert.alert('Cannot Delete', 'Cannot delete the currently loaded model. Please load a different model first.');
        return;
      }

      const success = await deleteModel(modelId);
      
      if (success) {
        await checkDownloadedModels();
        Alert.alert('Success', `Model ${MODELS[modelId].name} deleted successfully!`);
      } else {
        setError(`Failed to delete model ${MODELS[modelId].name}. Please try again.`);
      }
    } catch (err) {
      console.error('Error deleting model:', err);
      setError('Error deleting model. Please try again.');
    }
  };

  const initializeModel = async (modelId: keyof typeof MODELS) => {
    try {
      setIsModelLoading(true);
      setLoadingMessage(`Initializing ${MODELS[modelId].name} model...`);
      
      const success = await KokoroOnnx.loadModel(modelId);
      
      if (success) {
        setIsModelInitialized(true);
        setCurrentModelId(modelId);
        setSelectedModelId(modelId);
        setLoadingMessage('Model initialized successfully!');
      } else {
        setError(`Failed to initialize model ${MODELS[modelId].name}`);
      }
    } catch (err) {
      console.error('Error initializing model:', err);
      setError('Error initializing model. Please try again.');
    } finally {
      setIsModelLoading(false);
    }
  };

  const handleModelSelect = async (modelId: keyof typeof MODELS) => {
    setSelectedModelId(modelId);
    
    // Auto-initialize if downloaded and not already loaded
    const isDownloaded = downloadedModels.includes(modelId);
    const isLoaded = modelId === currentModelId;
    
    if (isDownloaded && !isLoaded && !isModelLoading) {
      await initializeModel(modelId);
    }
  };

  const renderModelItem = ({ item }: { item: keyof typeof MODELS }) => {
    const model = MODELS[item];
    const isDownloaded = downloadedModels.includes(item);
    const isSelected = item === selectedModelId;
    const isLoaded = item === currentModelId;
    
    return (
      <View style={[
        styles.modelItem, 
        isSelected && styles.selectedModelItem,
        isLoaded && styles.loadedModelItem
      ]}>
        <TouchableOpacity
          style={styles.modelItemContent}
          onPress={() => handleModelSelect(item)}
          disabled={isModelLoading}
        >
          <View style={styles.modelItemHeader}>
            <Text style={styles.modelName}>{model.name}</Text>
            <Text style={styles.modelSize}>{model.size}</Text>
          </View>
          <Text style={styles.modelDescription}>{model.description}</Text>
          <View style={styles.modelItemFooter}>
            {isDownloaded ? (
              <>
                <Text style={styles.modelStatus}>
                  {isLoaded ? '✓ Currently Loaded' : isSelected ? 'Initializing...' : '✓ Downloaded'}
                </Text>
                <View style={styles.modelActions}>
                  {!isLoaded && (
                    <TouchableOpacity 
                      style={styles.deleteButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        deleteSelectedModel(item);
                      }}
                    >
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : (
              <TouchableOpacity 
                style={styles.downloadButton}
                onPress={(e) => {
                  e.stopPropagation();
                  downloadSelectedModel(item);
                }}
                disabled={isDownloading}
              >
                <Text style={styles.downloadButtonText}>
                  {isDownloading ? 'Downloading...' : 'Download'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {isDownloading && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${downloadProgress * 100}%` }]} />
              <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}%</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView contentContainerStyle={styles.scrollView}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Model Management</Text>
            <Text style={styles.subtitle}>Select, download, or manage models</Text>
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {isModelLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.loadingText}>{loadingMessage}</Text>
            </View>
          )}

          <View style={styles.section}>
            {currentModelId && (
              <View style={styles.currentModelCard}>
                <Text style={styles.currentModelLabel}>Currently Loaded</Text>
                <Text style={styles.currentModelName}>{MODELS[currentModelId].name}</Text>
                <Text style={styles.currentModelSize}>{MODELS[currentModelId].size}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Available Models</Text>
            <FlatList
              data={(() => {
                const allModels = Object.keys(MODELS) as Array<keyof typeof MODELS>;
                // Sort so selected model appears first
                return allModels.sort((a, b) => {
                  if (a === selectedModelId) return -1;
                  if (b === selectedModelId) return 1;
                  return 0;
                });
              })()}
              renderItem={renderModelItem}
              keyExtractor={(item) => item}
              scrollEnabled={false}
            />
          </View>
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
  currentModelCard: {
    backgroundColor: '#d1e7ff',
    padding: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  currentModelLabel: {
    fontSize: 12,
    color: '#636366',
    marginBottom: 4,
  },
  currentModelName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  currentModelSize: {
    fontSize: 14,
    color: '#636366',
    marginTop: 4,
  },
  modelItem: {
    backgroundColor: '#f2f2f7',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  selectedModelItem: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  loadedModelItem: {
    backgroundColor: '#d1e7ff',
  },
  modelItemContent: {
    padding: 15,
  },
  modelItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  modelName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  modelSize: {
    fontSize: 14,
    color: '#636366',
  },
  modelDescription: {
    fontSize: 14,
    color: '#636366',
    marginBottom: 10,
  },
  modelItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelStatus: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '500',
  },
  modelActions: {
    flexDirection: 'row',
    gap: 10,
  },
  loadButton: {
    backgroundColor: '#34C759',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  loadButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  downloadButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  downloadButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  progressContainer: {
    marginTop: 10,
    height: 20,
    backgroundColor: '#e5e5ea',
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#34C759',
  },
  progressText: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    color: '#000',
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 20,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  loadingText: {
    marginLeft: 10,
    color: '#636366',
    fontSize: 14,
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

