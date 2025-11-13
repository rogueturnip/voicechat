import { mlc } from '@react-native-ai/mlc';
import { generateText } from 'ai';

// Model ID for Qwen2.5-0.5B-Instruct (~600MB - good balance of speed and quality)
const QWEN_MODEL_ID = 'Qwen2.5-0.5B-Instruct';

class LLMService {
  private model: ReturnType<typeof mlc.languageModel> | null = null;
  private isModelReady: boolean = false;
  private isInitializing: boolean = false;
  private isDownloading: boolean = false;

  /**
   * Initialize the Qwen2.5-0.5B-Instruct model
   * Downloads and prepares the model if needed
   */
  async initialize(): Promise<boolean> {
    if (this.isModelReady) {
      return true;
    }

    if (this.isInitializing) {
      // Wait for initialization to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isInitializing) {
            clearInterval(checkInterval);
            resolve(this.isModelReady);
          }
        }, 100);
      });
    }

    try {
      this.isInitializing = true;
      console.log('[LLM] Initializing Qwen2.5-0.5B-Instruct model...');

      // Create model instance
      this.model = mlc.languageModel(QWEN_MODEL_ID);

      // Download model first (this will be a no-op if already downloaded)
      // Then prepare the model
      try {
        console.log('[LLM] Downloading model (if needed)...');
        this.isDownloading = true;
        await this.model.download();
        console.log('[LLM] Model download complete, preparing...');
        this.isDownloading = false;
        
        await this.model.prepare();
        this.isModelReady = true;
        console.log('[LLM] ✓ Qwen2.5-0.5B-Instruct model ready');
      } catch (error: any) {
        console.error('[LLM] Error during download/prepare:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('[LLM] ✗ Error initializing model:', error);
      this.isInitializing = false;
      this.isDownloading = false;
      return false;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Check if model is ready
   */
  isReady(): boolean {
    return this.isModelReady;
  }

  /**
   * Check if model is currently initializing
   */
  isInitializingModel(): boolean {
    return this.isInitializing;
  }

  /**
   * Check if model is currently downloading
   */
  isDownloadingModel(): boolean {
    return this.isDownloading;
  }

  /**
   * Generate text response from user prompt
   */
  async generateResponse(prompt: string, conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []): Promise<string> {
    if (!this.isModelReady || !this.model) {
      throw new Error('Model not ready. Call initialize() first.');
    }

    try {
      console.log('[LLM] Generating response for prompt:', prompt);

      // Build messages array with conversation history
      const messages = [
        {
          role: 'system' as const,
          content: 'You are a helpful AI assistant. Provide clear, concise, and friendly responses.',
        },
        ...conversationHistory.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      const { text } = await generateText({
        model: this.model,
        messages,
        maxTokens: 500, // Limit response length
        temperature: 0.7,
      });

      console.log('[LLM] ✓ Response generated:', text.substring(0, 100) + '...');
      return text;
    } catch (error) {
      console.error('[LLM] ✗ Error generating response:', error);
      throw error;
    }
  }

  /**
   * Reset the model state
   */
  reset() {
    this.model = null;
    this.isModelReady = false;
    this.isInitializing = false;
    this.isDownloading = false;
  }
}

// Create singleton instance
const llmService = new LLMService();

export default llmService;

