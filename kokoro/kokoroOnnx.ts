import { File, Directory, Paths } from 'expo-file-system';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { getVoiceData } from './voices';
import { Platform } from 'react-native';
import { tokenize as phonemizeTokenize } from './phonemics';

// Constants
const SAMPLE_RATE = 24000;
const STYLE_DIM = 256;
const MAX_PHONEME_LENGTH = 510;

// Voice data URL
const VOICE_DATA_URL = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices";

class KokoroOnnx {
  private session: InferenceSession | null = null;
  private isModelLoaded: boolean = false;
  private isOnnxAvailable: boolean = true;
  private currentModelId: string | null = null;
  private isStreaming: boolean = false;
  private streamingSound: AudioPlayer | null = null;
  private tokensPerSecond: number = 0;
  private timeToFirstToken: number = 0;
  private streamingPhonemes: string = "";
  private audioQueue: Array<{ uri: string; duration: number }> = [];
  private isPlayingQueue: boolean = false;
  private currentQueuePlayer: AudioPlayer | null = null;

  constructor() {
    // Properties initialized above
  }

  /**
   * Check if ONNX runtime is available on this platform
   * @returns {boolean} Whether ONNX runtime is available
   */
  checkOnnxAvailability() {
    try {
      // Check if InferenceSession is defined and has the create method
      if (typeof InferenceSession === 'undefined' || typeof InferenceSession.create !== 'function') {
        console.error('ONNX Runtime is not properly initialized');
        this.isOnnxAvailable = false;
        return false;
      }
      
      // Additional platform-specific checks
      if (Platform.OS === 'web') {
        console.warn('ONNX Runtime may not be fully supported on web platform');
      }
      
      this.isOnnxAvailable = true;
      return true;
    } catch (error) {
      console.error('Error checking ONNX availability:', error);
      this.isOnnxAvailable = false;
      return false;
    }
  }

  /**
   * Load a specific ONNX model
   * @param {string} modelId - The model ID to load
   * @returns {Promise<boolean>} Whether the model was loaded successfully
   */
  async loadModel(modelId = 'model_q8f16.onnx') {
    try {
      // First check if ONNX runtime is available
      if (!this.checkOnnxAvailability()) {
        console.error('ONNX Runtime is not available on this platform');
        return false;
      }
      
      // Check if model exists
      const file = new File(Paths.cache, modelId);
      if (!file.exists) {
        console.error('Model file not found:', file.uri);
        return false;
      }

      console.log('Creating inference session with model at:', file.uri);
      
      // Create inference session with explicit options
      // Note: onnxruntime-react-native uses 'cpu' instead of 'cpuexecutionprovider'
      const options = {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all' as const,
        enableCpuMemArena: true,
        enableMemPattern: true,
        executionMode: 'sequential' as const
      };
      
      try {
        // Try to create the session with options first using file URI
        this.session = await InferenceSession.create(file.uri, options);
      } catch (optionsError) {
        // Fallback to creating session without options if execution providers aren't supported
        // This is common on React Native where execution providers may not be configurable
        this.session = await InferenceSession.create(file.uri);
      }
      
      if (!this.session) {
        console.error('Failed to create inference session');
        return false;
      }
      
      this.isModelLoaded = true;
      this.currentModelId = modelId;
      console.log('Model loaded successfully:', modelId);
      return true;
    } catch (error) {
      console.error('Error loading model:', error);
      
      // Provide more detailed error information
      if (error instanceof Error && error.message && error.message.includes('binding')) {
        console.error('ONNX Runtime binding error. This may be due to incompatibility with the current platform.');
      }
      
      return false;
    }
  }

  /**
   * Get the currently loaded model ID
   * @returns {string|null} The current model ID or null if no model is loaded
   */
  getCurrentModelId() {
    return this.currentModelId;
  }

  /**
   * Get the current tokens per second rate
   * @returns {number} Tokens per second
   */
  getTokensPerSecond() {
    return this.tokensPerSecond;
  }

  /**
   * Get the time to first token in milliseconds
   * @returns {number} Time to first token in ms
   */
  getTimeToFirstToken() {
    return this.timeToFirstToken;
  }

  /**
   * Check if audio is currently streaming
   * @returns {boolean} Whether audio is streaming
   */
  isAudioStreaming() {
    return this.isStreaming;
  }

  /**
   * Get the current streaming phonemes
   * @returns {string} Current phonemes being processed
   */
  getStreamingPhonemes() {
    return this.streamingPhonemes;
  }

  /**
   * Stop the current streaming audio
   * @returns {Promise<void>}
   */
  async stopStreaming() {
    if (this.streamingSound) {
      try {
        (this.streamingSound as any).stop?.();
        this.streamingSound.release();
      } catch (error) {
        console.error('Error stopping streaming audio:', error);
      }
      this.streamingSound = null;
    }
    if (this.currentQueuePlayer) {
      try {
        (this.currentQueuePlayer as any).stop?.();
        this.currentQueuePlayer.release();
      } catch (error) {
        console.error('Error stopping queue player:', error);
      }
      this.currentQueuePlayer = null;
    }
    this.audioQueue = [];
    this.isPlayingQueue = false;
    this.isStreaming = false;
    this.tokensPerSecond = 0;
    this.timeToFirstToken = 0;
    this.streamingPhonemes = "";
  }

  /**
   * Split text into chunks for streaming
   * Tries to split at sentence boundaries, falls back to word boundaries, then character boundaries
   * @param {string} text The text to chunk
   * @param {number} maxChunkLength Maximum characters per chunk
   * @returns {string[]} Array of text chunks
   */
  private _chunkText(text: string, maxChunkLength: number = 200): string[] {
    if (text.length <= maxChunkLength) {
      return [text];
    }

    const chunks: string[] = [];
    let currentIndex = 0;

    while (currentIndex < text.length) {
      const remaining = text.length - currentIndex;
      
      if (remaining <= maxChunkLength) {
        // Last chunk - take everything remaining
        chunks.push(text.slice(currentIndex).trim());
        break;
      }

      // Try to find a sentence boundary (., !, ?, followed by space)
      const sentenceEnd = text.slice(currentIndex, currentIndex + maxChunkLength).search(/[.!?]\s/);
      if (sentenceEnd > 50) { // Only use if it's not too close to the start
        const chunkEnd = currentIndex + sentenceEnd + 1;
        chunks.push(text.slice(currentIndex, chunkEnd).trim());
        currentIndex = chunkEnd + 1;
        continue;
      }

      // Try to find a word boundary (space or punctuation)
      const wordBoundary = text.slice(currentIndex, currentIndex + maxChunkLength).lastIndexOf(' ');
      if (wordBoundary > 30) { // Only use if it's not too close to the start
        const chunkEnd = currentIndex + wordBoundary;
        chunks.push(text.slice(currentIndex, chunkEnd).trim());
        currentIndex = chunkEnd + 1;
        continue;
      }

      // Fall back to character boundary
      chunks.push(text.slice(currentIndex, currentIndex + maxChunkLength).trim());
      currentIndex += maxChunkLength;
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Play the next item in the audio queue
   * @returns {Promise<void>}
   */
  private async _playNextInQueue(): Promise<void> {
    if (this.audioQueue.length === 0) {
      console.log(`[PlayQueue] Queue empty, stopping playback`);
      this.isPlayingQueue = false;
      this.currentQueuePlayer = null;
      return;
    }

    if (this.isPlayingQueue && this.currentQueuePlayer) {
      // Already playing, wait for current to finish
      console.log(`[PlayQueue] Already playing, waiting...`);
      return;
    }

    const nextItem = this.audioQueue.shift();
    if (!nextItem) {
      console.log(`[PlayQueue] No item available, stopping playback`);
      this.isPlayingQueue = false;
      this.currentQueuePlayer = null;
      return;
    }

    this.isPlayingQueue = true;
    const queueSize = this.audioQueue.length;
    console.log(`[PlayQueue] ▶ Playing chunk (${nextItem.duration.toFixed(0)}ms), ${queueSize} remaining in queue`);
    
    try {
      const sound = createAudioPlayer({ uri: nextItem.uri });
      this.currentQueuePlayer = sound;
      sound.play();

      // Wait for the audio to finish playing (duration in milliseconds)
      // Add small buffer (50ms) to account for timing inaccuracies
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, nextItem.duration + 50);

        // Try to use AudioPlayer events if available
        try {
          if ((sound as any).addListener) {
            (sound as any).addListener('playbackStatusUpdate', (status: any) => {
              if (status?.didJustFinish || status?.isPlaying === false) {
                clearTimeout(timeout);
                resolve();
              }
            });
          }
        } catch (e) {
          // Event listener not available, use timeout
        }
      });

      // Clean up
      try {
        (sound as any).stop?.();
        sound.release();
      } catch (e) {
        // Ignore cleanup errors
      }

      this.currentQueuePlayer = null;
      console.log(`[PlayQueue] ✓ Chunk finished, moving to next...`);

      // Play next item in queue
      await this._playNextInQueue();
    } catch (error) {
      console.error('Error playing queue item:', error);
      this.isPlayingQueue = false;
      this.currentQueuePlayer = null;
      // Continue with next item even on error
      await this._playNextInQueue();
    }
  }

  /**
   * Generate audio for a single chunk of text
   * @param {string} chunkText The text chunk
   * @param {string} voiceId The voice ID
   * @param {number} speed The speaking speed
   * @param {number[]} preTokenized Optional pre-tokenized tokens to avoid double tokenization
   * @returns {Promise<{ uri: string; duration: number }>} Audio file URI and duration
   */
  private async _generateChunkAudio(
    chunkText: string,
    voiceId: string,
    speed: number,
    preTokenized?: number[]
  ): Promise<{ uri: string; duration: number }> {
    // Tokenize (or use pre-tokenized if provided)
    const tokens = preTokenized || await this.tokenize(chunkText);
    const numTokens = Math.min(Math.max(tokens.length - 2, 0), MAX_PHONEME_LENGTH - 1);
    
    // Get voice style data
    const voiceData = await getVoiceData(voiceId);
    const offset = numTokens * STYLE_DIM;
    const styleData = voiceData.slice(offset, offset + STYLE_DIM);
    
    // Prepare input tensors
    const inputs: Record<string, Tensor> = {};
    try {
      inputs['input_ids'] = new Tensor('int64', new Int32Array(tokens), [1, tokens.length]);
    } catch (error) {
      inputs['input_ids'] = new Tensor('int64', tokens, [1, tokens.length]);
    }
    
    inputs['style'] = new Tensor('float32', new Float32Array(styleData), [1, STYLE_DIM]);
    inputs['speed'] = new Tensor('float32', new Float32Array([speed]), [1]);
    
    // Run inference
    if (!this.session) {
      throw new Error('Session is not initialized');
    }
    const outputs = await this.session.run(inputs);
    
    if (!outputs || !outputs['waveform'] || !outputs['waveform'].data) {
      throw new Error('Invalid output from model inference');
    }
    
    // Process waveform
    const waveformData = outputs['waveform'].data;
    const waveform = waveformData instanceof Float32Array 
      ? waveformData 
      : new Float32Array(waveformData as ArrayLike<number>);
    
    // Convert to audio file
    const audioUri = await this._floatArrayToAudioFile(waveform);
    
    // Calculate duration (samples / sample rate, adjusted for speed)
    const duration = (waveform.length / SAMPLE_RATE / speed) * 1000; // in milliseconds
    
    return { uri: audioUri, duration };
  }

  /**
   * Download a voice file if it doesn't exist locally
   * @param {string} voiceId The voice ID to download
   * @returns {Promise<boolean>} Whether the voice was downloaded successfully
   */
  async downloadVoice(voiceId: string): Promise<boolean> {
    try {
      // Skip download for combined voices (they're already saved locally)
      if (voiceId.startsWith('combined_')) {
        return true;
      }

      // Check if voice directory exists
      const voicesDir = new Directory(Paths.document, 'voices');
      
      if (!voicesDir.exists) {
        voicesDir.create({ intermediates: true });
      }
      
      // Check if voice file exists
      const voiceFile = new File(voicesDir, `${voiceId}.bin`);
      
      if (voiceFile.exists) {
        console.log(`Voice ${voiceId} already exists locally`);
        return true;
      }
      
      // Download voice file
      const voiceUrl = `${VOICE_DATA_URL}/${voiceId}.bin`;
      console.log(`Downloading voice from ${voiceUrl}`);
      
      const downloadedFile = await File.downloadFileAsync(voiceUrl, voicesDir);
      
      // Extract filename from URI and check if we need to rename
      const downloadedUri = downloadedFile.uri;
      const downloadedFileName = downloadedUri.split('/').pop() || '';
      
      // If the downloaded file has a different name, rename it
      if (downloadedFileName !== `${voiceId}.bin`) {
        downloadedFile.move(voiceFile);
      }
      
      console.log(`Voice ${voiceId} downloaded successfully`);
      return true;
    } catch (error) {
      console.error(`Error downloading voice ${voiceId}:`, error);
      return false;
    }
  }

  /**
   * Tokenize text (delegates to phonemics utility)
   * @param {string} text The input text
   * @returns {Promise<number[]>} Tokenized input
   */
  async tokenize(text: string): Promise<number[]> {
    const result = await phonemizeTokenize(text, { value: this.streamingPhonemes });
    this.streamingPhonemes = result.phonemes;
    return result.tokens;
  }

  /**
   * Generate audio from text
   * @param {string} text The input text
   * @param {string} voiceId The voice ID to use
   * @param {number} speed The speaking speed (0.5-2.0)
   * @returns {Promise<AudioPlayer>} The generated audio as an Expo AudioPlayer object
   */
  async generateAudio(text: string, voiceId: string = 'af_heart', speed: number = 1.0): Promise<AudioPlayer> {
    if (!this.isOnnxAvailable) {
      throw new Error('ONNX Runtime is not available on this platform');
    }
    
    if (!this.isModelLoaded) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    try {
      // Ensure voice is downloaded
      await this.downloadVoice(voiceId);
      
      // 1. Tokenize the input text
      const tokens = await this.tokenize(text);
      const numTokens = Math.min(Math.max(tokens.length - 2, 0), MAX_PHONEME_LENGTH - 1);
      
      // 2. Get voice style data
      const voiceData = await getVoiceData(voiceId);
      const offset = numTokens * STYLE_DIM;
      const styleData = voiceData.slice(offset, offset + STYLE_DIM);
      
      // 3. Prepare input tensors - using regular arrays instead of Int64Array
      const inputs: Record<string, Tensor> = {};
      
      try {
        // Try with Int32Array first (more compatible)
        inputs['input_ids'] = new Tensor('int64', new Int32Array(tokens), [1, tokens.length]);
      } catch (error) {
        console.warn('Failed to create int64 tensor with Int32Array, trying with regular array:', error);
        // Fallback to regular array
        inputs['input_ids'] = new Tensor('int64', tokens, [1, tokens.length]);
      }
      
      inputs['style'] = new Tensor('float32', new Float32Array(styleData), [1, STYLE_DIM]);
      inputs['speed'] = new Tensor('float32', new Float32Array([speed]), [1]);
      
      console.log('Running inference with inputs:', {
        tokens_length: tokens.length,
        style_length: styleData.length,
        speed
      });
      
      // 4. Run inference
      if (!this.session) {
        throw new Error('Session is not initialized');
      }
      const outputs = await this.session.run(inputs);
      
      if (!outputs || !outputs['waveform'] || !outputs['waveform'].data) {
        throw new Error('Invalid output from model inference');
      }
      
      // 5. Process the output waveform
      const waveformData = outputs['waveform'].data;
      // Ensure waveform is Float32Array
      const waveform = waveformData instanceof Float32Array 
        ? waveformData 
        : new Float32Array(waveformData as ArrayLike<number>);
      console.log('Generated waveform with length:', waveform.length);
      
      // 6. Convert to audio buffer
      const audioUri = await this._floatArrayToAudioFile(waveform);
      
      // 7. Create and return an Expo AudioPlayer object
      const sound = createAudioPlayer({ uri: audioUri });
      
      return sound;
    } catch (error) {
      console.error('Error generating audio:', error);
      throw error;
    }
  }

  /**
   * Generate and stream audio in real-time
   * Now uses true streaming: generates and plays audio chunks as they're created
   * @param {string} text The input text
   * @param {string} voiceId The voice ID to use
   * @param {number} speed The speaking speed (0.5-2.0)
   * @param {function} onProgress Callback for streaming progress updates
   * @returns {Promise<{tokensPerSecond: number, timeToFirstToken: number, totalTokens: number}>}
   */
  async streamAudio(
    text: string, 
    voiceId: string = 'af_heart', 
    speed: number = 1.0, 
    onProgress: ((status: any) => void) | null = null
  ): Promise<{tokensPerSecond: number, timeToFirstToken: number, totalTokens: number}> {
    if (this.isStreaming) {
      await this.stopStreaming();
    }

    if (!this.isOnnxAvailable) {
      throw new Error('ONNX Runtime is not available on this platform');
    }
    
    if (!this.isModelLoaded) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    try {
      this.isStreaming = true;
      this.timeToFirstToken = 0;
      this.streamingPhonemes = "";
      this.audioQueue = [];
      this.isPlayingQueue = false;
      
      // Ensure voice is downloaded
      await this.downloadVoice(voiceId);
      
      // Split text into chunks for streaming (use much smaller chunks for faster time-to-first-audio)
      // Smaller chunks = faster generation = audio starts sooner
      const textChunks = this._chunkText(text, 75);
      console.log(`[StreamAudio] Text length: ${text.length}, Split into ${textChunks.length} chunks`);
      if (textChunks.length > 1) {
        console.log(`[StreamAudio] Chunk sizes:`, textChunks.map(c => c.length));
      }
      
      if (textChunks.length === 0) {
        throw new Error('No text chunks to process');
      }
      
      // If only one chunk, still use streaming mode (it's the same code path)
      // This ensures consistent behavior
      
      // Start timing for time to first token
      const overallStartTime = Date.now();
      let totalTokens = 0;
      
      // Generate first chunk and start playing immediately
      const firstChunk = textChunks[0];
      console.log(`[StreamAudio] Generating first chunk (${firstChunk.length} chars): "${firstChunk.substring(0, 50)}..."`);
      const firstChunkTokens = await this.tokenize(firstChunk);
      const firstNumTokens = Math.min(Math.max(firstChunkTokens.length - 2, 0), MAX_PHONEME_LENGTH - 1);
      totalTokens += firstNumTokens;
      
      const firstChunkAudio = await this._generateChunkAudio(firstChunk, voiceId, speed, firstChunkTokens);
      this.timeToFirstToken = Date.now() - overallStartTime;
      console.log(`[StreamAudio] ✓ First chunk generated in ${this.timeToFirstToken}ms, duration: ${firstChunkAudio.duration.toFixed(0)}ms, starting playback...`);
      
      // Add first chunk to queue and start playing
      this.audioQueue.push(firstChunkAudio);
      this._playNextInQueue().catch((err) => {
        console.error('[StreamAudio] Error in playback queue:', err);
      });
      
      if (onProgress) {
        onProgress({
          chunkIndex: 1,
          totalChunks: textChunks.length,
          progress: (1 / textChunks.length) * 100,
          chunkText: firstChunk
        });
      }
      
      // Start generating remaining chunks IMMEDIATELY in parallel (don't wait)
      // This ensures chunks are ready before they're needed in the queue
      const remainingPromises: Promise<void>[] = [];
      
      for (let i = 1; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        const chunkIndex = i;
        
        const generatePromise = (async () => {
          try {
            console.log(`[StreamAudio] Generating chunk ${chunkIndex + 1}/${textChunks.length} (${chunk.length} chars)...`);
            const chunkStartTime = Date.now();
            
            // Tokenize first to get token count
            const chunkTokens = await this.tokenize(chunk);
            const numTokens = Math.min(Math.max(chunkTokens.length - 2, 0), MAX_PHONEME_LENGTH - 1);
            totalTokens += numTokens;
            
            // Generate audio using pre-tokenized tokens
            const chunkAudio = await this._generateChunkAudio(chunk, voiceId, speed, chunkTokens);
            
            // Add to queue (playback will continue automatically)
            this.audioQueue.push(chunkAudio);
            const genTime = Date.now() - chunkStartTime;
            console.log(`[StreamAudio] ✓ Chunk ${chunkIndex + 1}/${textChunks.length} generated in ${genTime}ms, duration: ${chunkAudio.duration.toFixed(0)}ms, queued for playback`);
            
            // Call progress callback if provided
            if (onProgress) {
              onProgress({
                chunkIndex: chunkIndex + 1,
                totalChunks: textChunks.length,
                progress: ((chunkIndex + 1) / textChunks.length) * 100,
                chunkText: chunk
              });
            }
          } catch (error) {
            console.error(`[StreamAudio] Error generating chunk ${chunkIndex + 1}:`, error);
            // Continue with other chunks even if one fails
          }
        })();
        
        remainingPromises.push(generatePromise);
      }
      
      // Don't wait for remaining chunks - let them generate in background
      // The queue will play them as they become available
      Promise.all(remainingPromises).then(() => {
        // Calculate overall tokens per second
        const totalTime = (Date.now() - overallStartTime) / 1000;
        this.tokensPerSecond = totalTime > 0 ? totalTokens / totalTime : 0;
        console.log(`[StreamAudio] ✓ All chunks generated. Total tokens: ${totalTokens}, Tokens/sec: ${this.tokensPerSecond.toFixed(2)}`);
      }).catch((err) => {
        console.error('[StreamAudio] Error in background chunk generation:', err);
      });
      
      // Return immediately with first chunk metrics (don't wait for all chunks)
      return {
        tokensPerSecond: 0, // Will be updated in background
        timeToFirstToken: this.timeToFirstToken,
        totalTokens: firstNumTokens // Approximate, will be updated in background
      };
    } catch (error) {
      this.isStreaming = false;
      this.audioQueue = [];
      this.isPlayingQueue = false;
      console.error('Error streaming audio:', error);
      throw error;
    }
  }

  /**
   * Convert a Float32Array to an audio file that can be played by Expo Audio
   * @param {Float32Array} floatArray The float array containing audio data
   * @returns {Promise<string>} URI to the temporary audio file
   */
  async _floatArrayToAudioFile(floatArray: Float32Array): Promise<string> {
    try {
      // 1. Convert float array to WAV format
      const wavBuffer = this._floatArrayToWav(floatArray, SAMPLE_RATE);
      
      // 2. Save to a temporary file
      const tempFile = new File(Paths.cache, `temp_audio_${Date.now()}.wav`);
      tempFile.write(new Uint8Array(wavBuffer));
      
      console.log('Audio saved to:', tempFile.uri);
      return tempFile.uri;
    } catch (error) {
      console.error('Error converting float array to audio file:', error);
      throw error;
    }
  }

  /**
   * Convert a Float32Array to a WAV buffer
   * @param {Float32Array} floatArray The float array containing audio data
   * @param {number} sampleRate The sample rate of the audio
   * @returns {ArrayBuffer} WAV buffer
   */
  _floatArrayToWav(floatArray: Float32Array, sampleRate: number): ArrayBuffer {
    // Convert float array to Int16Array (16-bit PCM)
    const numSamples = floatArray.length;
    const int16Array = new Int16Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
      // Convert float in range [-1, 1] to int16 in range [-32768, 32767]
      int16Array[i] = Math.max(-32768, Math.min(32767, Math.floor(floatArray[i] * 32767)));
    }
    
    // Create WAV header
    const headerLength = 44;
    const dataLength = int16Array.length * 2; // 2 bytes per sample
    const buffer = new ArrayBuffer(headerLength + dataLength);
    const view = new DataView(buffer);
    
    // Write WAV header
    // "RIFF" chunk descriptor
    view.setUint8(0, 'R'.charCodeAt(0));
    view.setUint8(1, 'I'.charCodeAt(0));
    view.setUint8(2, 'F'.charCodeAt(0));
    view.setUint8(3, 'F'.charCodeAt(0));
    
    // Chunk size
    view.setUint32(4, 36 + dataLength, true);
    
    // "WAVE" format
    view.setUint8(8, 'W'.charCodeAt(0));
    view.setUint8(9, 'A'.charCodeAt(0));
    view.setUint8(10, 'V'.charCodeAt(0));
    view.setUint8(11, 'E'.charCodeAt(0));
    
    // "fmt " subchunk
    view.setUint8(12, 'f'.charCodeAt(0));
    view.setUint8(13, 'm'.charCodeAt(0));
    view.setUint8(14, 't'.charCodeAt(0));
    view.setUint8(15, ' '.charCodeAt(0));
    
    // Subchunk size
    view.setUint32(16, 16, true);
    
    // Audio format (PCM)
    view.setUint16(20, 1, true);
    
    // Number of channels
    view.setUint16(22, 1, true);
    
    // Sample rate
    view.setUint32(24, sampleRate, true);
    
    // Byte rate
    view.setUint32(28, sampleRate * 2, true);
    
    // Block align
    view.setUint16(32, 2, true);
    
    // Bits per sample
    view.setUint16(34, 16, true);
    
    // "data" subchunk
    view.setUint8(36, 'd'.charCodeAt(0));
    view.setUint8(37, 'a'.charCodeAt(0));
    view.setUint8(38, 't'.charCodeAt(0));
    view.setUint8(39, 'a'.charCodeAt(0));
    
    // Subchunk size
    view.setUint32(40, dataLength, true);
    
    // Write audio data
    for (let i = 0; i < numSamples; i++) {
      view.setInt16(headerLength + i * 2, int16Array[i], true);
    }
    
    return buffer;
  }
}

// Create a singleton instance
const kokoroInstance = new KokoroOnnx();

// Export the singleton instance
export default kokoroInstance; 