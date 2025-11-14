# Kokoro TTS Expo App

## On-Device Text-to-Speech with ONNX Runtime

Kokoro TTS Demo is a mobile application that demonstrates high-quality text-to-speech capabilities running entirely on-device using ONNX Runtime. This app showcases how modern neural TTS models can be deployed on mobile devices without requiring cloud connectivity.

### Demo Video

<p align="center">
  <a href="https://youtube.com/shorts/IvZ5ahpOsZE" target="_blank">
    <img src="https://img.youtube.com/vi/IvZ5ahpOsZE/0.jpg" alt="Kokoro TTS Demo Video" width="320">
  </a>
</p>

*Click the image above to watch the demo video on YouTube*

## Features

- 🔊 High-quality neural text-to-speech
- 📱 Runs 100% on-device (no internet required after initial download)
- 🎭 Multiple voices with different accents and styles
- 🔄 Adjustable speech speed
- 📊 Performance metrics for speech generation
- 📦 Multiple model options with different size/quality tradeoffs
- 🤖 **AI Assistant Mode** - Conversational AI powered by Qwen2.5-0.5B-Instruct LLM
- 🎤 **Speech Recognition** - Voice input with real-time transcription
- 💬 **Conversation History** - Persistent conversation storage using SQLite
- 🎚️ **Dual TTS Engines** - Choose between Kokoro (ONNX) or Native TTS engines

## How It Works

Kokoro TTS uses a neural text-to-speech model converted to ONNX format, which allows it to run efficiently on mobile devices using ONNX Runtime. The app follows these steps to generate speech:

1. **Text Normalization**: Prepares the input text for processing
2. **Phonemization**: Converts text to phonetic representation
3. **Tokenization**: Converts phonemes to token IDs
4. **Neural Inference**: Processes tokens through the ONNX model
5. **Audio Generation**: Converts model output to audio waveforms
6. **Playback**: Plays the generated audio through device speakers

## Technology Stack

- **React Native**: Core framework for cross-platform mobile development
- **Expo**: Development platform for React Native
- **ONNX Runtime**: High-performance inference engine for ONNX models
- **Expo Audio**: Audio playback capabilities
- **Expo FileSystem**: File management for model and voice data
- **@react-native-ai/mlc**: On-device LLM inference engine
- **Qwen2.5-0.5B-Instruct**: Lightweight language model for AI assistant
- **Expo Speech Recognition**: Voice input and transcription
- **React Native Speech**: Native TTS engine alternative
- **Expo SQLite**: Local conversation history storage
- **Zustand**: State management

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- Expo CLI
- iOS device with iOS 13+ (for development)
- Xcode (for iOS builds)
- Android Studio (for Android builds)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/isaiahbjork/expo-kokoro-onnx.git
   cd expo-kokoro-onnx
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Expo development server:
   ```bash
   npx expo start
   ```

### Building a Development Client

To run the app on a physical device with full ONNX Runtime support:

```bash
npx eas build --platform ios --profile development
```

## Usage

### Direct TTS Mode

1. **Select TTS Engine**: Choose between Kokoro (ONNX) or Native TTS in Settings
2. **Select a Model** (Kokoro only): Choose from different model sizes based on your device capabilities
3. **Download a Voice**: Select and download one of the available voices
4. **Adjust Speed**: Set the speech rate using the speed controls
5. **Enter Text**: Type or paste the text you want to convert to speech
6. **Generate Speech**: Press the "Generate Speech" button to create and play the audio

### AI Assistant Mode

1. **Enable AI Assistant**: Switch to "AI Assistant" mode in Settings
2. **Wait for LLM**: The app will download and initialize the Qwen2.5-0.5B model (~600MB) on first use
3. **Voice Input**: Tap the microphone button to speak your question
4. **Automatic Response**: The AI will generate a response and speak it back using your selected TTS engine
5. **Conversation History**: All conversations are saved locally and persist across app sessions
6. **Clear History**: Use Settings to clear conversation history if needed

## Models

The app supports multiple model variants with different size and quality tradeoffs:

| Model | Size | Quality | Description |
|-------|------|---------|-------------|
| Full Precision | 326 MB | Highest | Best quality, largest size |
| FP16 | 163 MB | High | High quality, reduced size |
| Q8F16 | 86 MB | Good | Balanced quality and size |
| Quantized | 92.4 MB | Medium | Reduced quality, smaller size |

## Voices

The app includes multiple voices with different characteristics:

- American English (Male/Female)
- British English (Male/Female)
- Various voice styles and characteristics

## Development

### Project Structure

- `/app`: Expo Router application screens
  - `index.tsx`: Main screen with TTS and AI Assistant interface
  - `settings.tsx`: Settings and configuration screen
  - `models.tsx`: Model selection and management
  - `voices.tsx`: Voice selection and management
- `/kokoro`: Core TTS and LLM implementation
  - `kokoroOnnx.ts`: Main TTS engine implementation
  - `models.ts`: Model management and downloading
  - `voices.ts`: Voice definitions and management
  - `llmService.ts`: LLM service for AI Assistant mode
- `/components`: Reusable UI components
  - `SpeechRecognition.tsx`: Voice input component
- `/store`: State management and data persistence
  - `ttsStore.ts`: Zustand store for TTS settings
  - `conversationDb.ts`: SQLite database for conversation history
- `/utils`: Utility functions
  - `speechWrapper.ts`: Unified TTS engine wrapper
- `app.json`: Expo configuration
- `metro.config.js`: Metro bundler configuration

### Key Components

- **KokoroOnnx**: Main class that handles Kokoro TTS functionality
- **LLMService**: Singleton service for Qwen2.5-0.5B model management
- **SpeechRecognition**: Component for voice input with real-time transcription
- **generateSpeech**: Unified wrapper for both TTS engines
- **ConversationDatabase**: SQLite-based conversation history storage
- **TTSStore**: Zustand store managing TTS engine, voice, speed, and mode settings

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Modes

### Direct TTS Mode
Convert text directly to speech using your selected TTS engine. Perfect for reading text, accessibility, or simple text-to-speech needs.

### AI Assistant Mode
Engage in conversations with an on-device AI assistant. The assistant uses the Qwen2.5-0.5B-Instruct model to generate responses, which are then spoken using your selected TTS engine. All conversations are stored locally for context.

## TTS Engines

### Kokoro (ONNX)
- High-quality neural TTS
- Multiple voice options
- Customizable speed control
- Requires model download (~86MB for Q8F16)
- Best for quality and customization

### Native TTS
- Uses device's built-in TTS engine
- No model download required
- Platform-native voices
- Faster initialization
- Best for quick setup and native integration

## Acknowledgments

- ONNX Runtime team for the mobile inference engine
- Expo team for the development platform
- Contributors to the open-source TTS models
- Qwen team for the Qwen2.5 language model