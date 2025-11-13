import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

interface SpeechRecognitionProps {
  onTranscriptionComplete: (text: string) => void;
  onInterimResult?: (text: string) => void;
  disabled?: boolean;
  isReady?: boolean;
  isGeneratingResponse?: boolean;
  llmStatus?: {
    isInitializing: boolean;
    isDownloading: boolean;
    isReady: boolean;
    message?: string;
  };
}

export default function SpeechRecognition({
  onTranscriptionComplete,
  onInterimResult,
  disabled = false,
  isReady = true,
  isGeneratingResponse = false,
  llmStatus,
}: SpeechRecognitionProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  
  // Animation values using React Native's Animated API
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.3)).current;
  const micScale = useRef(new Animated.Value(1)).current;
  
  // Silence timeout tracking
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasReceivedSpeechRef = useRef<boolean>(false); // Track if we've received any speech
  const SILENCE_TIMEOUT_MS = 2000; // 2 seconds
  const SILENCE_THRESHOLD = 5; // Volume threshold below which we consider it silence (0-100)

  // Animate pulse when listening
  useEffect(() => {
    if (isListening) {
      // Start pulsing animation for ring (scale)
      const scaleAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.4,
            duration: 1000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 1000,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      
      // Start pulsing animation for ring (opacity)
      const opacityAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0.7,
            duration: 1000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.3,
            duration: 1000,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      
      // Start pulsing animation for mic button
      const micAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(micScale, {
            toValue: 1.15,
            duration: 800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(micScale, {
            toValue: 1,
            duration: 800,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      
      scaleAnimation.start();
      opacityAnimation.start();
      micAnimation.start();
      
      return () => {
        scaleAnimation.stop();
        opacityAnimation.stop();
        micAnimation.stop();
      };
    } else {
      // Stop animation and reset to initial values
      Animated.parallel([
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(micScale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isListening]);

  // Listen to speech recognition events
  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('audiostart', () => {
    setIsListening(true);
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (event.results && event.results.length > 0) {
      const latestResult = event.results[event.results.length - 1];
      if (latestResult.transcript) {
        const newTranscript = latestResult.transcript;
        setTranscript(newTranscript);
        
        // Mark that we've received speech
        if (newTranscript.trim().length > 0) {
          hasReceivedSpeechRef.current = true;
        }
        
        // Send interim results to parent for immediate display
        if (onInterimResult && !event.isFinal) {
          onInterimResult(newTranscript);
        }
      }
      
      // If this is a final result, trigger completion
      if (event.isFinal && latestResult.transcript) {
        const finalText = latestResult.transcript.trim();
        if (finalText) {
          // Clear silence timeout since we got a final result
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
          
          // Small delay to ensure state is updated
          setTimeout(() => {
            onTranscriptionComplete(finalText);
            setTranscript('');
          }, 100);
        }
      }
    }
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    if (event.value !== undefined) {
      // Normalize volume to 0-1 range for animation
      const normalizedVolume = Math.min(Math.max(event.value / 100, 0), 1);
      setVolume(normalizedVolume);
      
      // Handle silence timeout
      if (isListening) {
        const volumeValue = event.value;
        
        // Clear existing timeout
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        
        // If volume is below threshold (silence detected)
        if (volumeValue < SILENCE_THRESHOLD) {
          // Only start timeout if we have received speech (user has spoken)
          if (hasReceivedSpeechRef.current) {
            silenceTimeoutRef.current = setTimeout(() => {
              // Silence timeout reached - stop listening
              stopListening();
            }, SILENCE_TIMEOUT_MS);
          }
        }
        // If volume is above threshold (voice detected), timeout is already cleared above
      }
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    setVolume(0);
    // Clear silence timeout when recording ends
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    setError(event.error || 'Speech recognition error');
    // Clear silence timeout on error
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  });

  const startListening = async () => {
    try {
      setError(null);
      setTranscript('');
      setVolume(0);
      
      // Reset speech detection tracking
      hasReceivedSpeechRef.current = false;
      
      // Clear any existing silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      await ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to start speech recognition');
      setIsListening(false);
    }
  };

  const stopListening = async () => {
    try {
      // Clear silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      
      await ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    } catch (err: any) {
      setError(err.message || 'Failed to stop speech recognition');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.microphoneContainer}>
        {/* Animated pulsing ring */}
        {isListening && (
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />
        )}
        
        {/* Volume-based ring */}
        {isListening && volume > 0 && (
          <Animated.View
            style={[
              styles.volumeRing,
              { opacity: Math.max(0, Math.min(1, volume * 0.5)) },
            ]}
          />
        )}

        {/* Microphone button */}
        <Animated.View
          style={{
            transform: [{ scale: micScale }],
          }}
        >
          <TouchableOpacity
            style={[
              styles.microphoneButton,
              isListening && styles.microphoneButtonRecording,
              !isListening && isReady && !disabled && !isGeneratingResponse && styles.microphoneButtonReady,
              (disabled || isGeneratingResponse) && styles.microphoneButtonDisabled,
            ]}
            onPress={toggleListening}
            disabled={disabled || isGeneratingResponse}
            activeOpacity={0.8}
          >
            <Ionicons 
              name={isListening ? "mic" : "mic-outline"} 
              size={28} 
              color={isListening ? "#FFFFFF" : (isReady && !disabled && !isGeneratingResponse ? "#FFFFFF" : "#1c1c1e")} 
            />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Status text */}
      <Text style={styles.statusText}>
        {isGeneratingResponse
          ? 'Generating response...'
          : isListening
          ? 'Listening... (will stop after 2s silence)'
          : disabled && llmStatus && !llmStatus.isReady
          ? llmStatus.message || 'LLM not ready'
          : transcript
          ? 'Tap to speak again'
          : 'Tap to start speaking'}
      </Text>
      
      {/* LLM Status */}
      {llmStatus && (
        <View style={styles.llmStatusContainer}>
          {llmStatus.isInitializing || llmStatus.isDownloading ? (
            <View style={styles.llmStatusRow}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.llmStatusText}>
                {llmStatus.isDownloading ? 'Downloading Qwen2.5-0.5B model (~600MB)...' : 'Initializing LLM...'}
              </Text>
            </View>
          ) : llmStatus.isReady ? (
            <Text style={styles.llmStatusTextReady}>✓ LLM Ready</Text>
          ) : (
            <Text style={styles.llmStatusTextError}>LLM not ready</Text>
          )}
        </View>
      )}


      {/* Error display */}
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 0,
  },
  microphoneContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#007AFF',
  },
  volumeRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#34C759',
  },
  microphoneButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f2f2f7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  microphoneButtonReady: {
    backgroundColor: '#34C759',
  },
  microphoneButtonRecording: {
    backgroundColor: '#007AFF',
  },
  microphoneButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#f2f2f7',
  },
  statusText: {
    fontSize: 12,
    color: '#636366',
    marginBottom: 4,
    fontWeight: '500',
  },
  transcriptContainer: {
    width: '100%',
    backgroundColor: '#f2f2f7',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  transcriptLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#636366',
    marginBottom: 8,
  },
  transcriptText: {
    fontSize: 16,
    color: '#1c1c1e',
    lineHeight: 24,
  },
  errorContainer: {
    backgroundColor: '#ffdddd',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderColor: '#ff6b6b',
    borderWidth: 1,
  },
  errorText: {
    color: '#d63031',
    fontSize: 14,
  },
  llmStatusContainer: {
    marginTop: 4,
    alignItems: 'center',
  },
  llmStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  llmStatusText: {
    fontSize: 12,
    color: '#636366',
    marginLeft: 6,
  },
  llmStatusTextReady: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '600',
  },
  llmStatusTextError: {
    fontSize: 12,
    color: '#ff6b6b',
  },
});
