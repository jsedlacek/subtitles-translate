# Subtitles Translator

A modern TypeScript/Node.js application that downloads subtitles from OpenSubtitles and translates them using Google's Gemini AI.

## Features

- 🔍 Search and download subtitles from OpenSubtitles.com
- 🌐 Translate subtitles using Google Gemini AI
- 📘 Written in TypeScript with full type safety
- ⚡ Modern ES modules with top-level await
- 🚀 Native Node.js APIs (fetch, fs/promises)
- 🔧 Native Node.js TypeScript transpilation (no build step required)
- 📝 Support for SRT subtitles format
- ⚙️ Configurable source and target languages
- 🏃 Parallel batch processing for performance
- 🎯 Functional programming approach

## Prerequisites

- **Node.js 18+** (for native `--env-file` support, `--experimental-strip-types`, and modern features)
- **OpenSubtitles Account & API Key**:
  - Create a free account at [OpenSubtitles.com](https://www.opensubtitles.com/)
  - Get your API key from [OpenSubtitles Consumers](https://www.opensubtitles.com/consumers)
- **Google Gemini API Key**: Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd subtitles-translate
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Edit `.env` file with your credentials:
```env
# OpenSubtitles API Configuration
OPENSUBTITLES_API_KEY=your_opensubtitles_api_key_here
OPENSUBTITLES_USERNAME=your_username_here
OPENSUBTITLES_PASSWORD=your_password_here

# Google Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# Translation Configuration (optional)
TARGET_LANGUAGE=es
SOURCE_LANGUAGE=en
```

## Usage

### Basic Usage

```bash
npm start "Movie or TV Show Name"
```

Or directly with Node.js:
```bash
node --env-file=.env --experimental-strip-types index.ts "Movie or TV Show Name"
```

### Examples

```bash
# Translate The Matrix subtitles to Spanish
npm start "The Matrix"

# Translate Breaking Bad episode
npm start "Breaking Bad S01E01"

# Translate Wednesday series
npm start "Wednesday"

# Translate specific movie with year
npm start "Inception 2010"

# Development mode with file watching
npm run dev "The Matrix"
```

### Language Codes

Common language codes you can use:
- `en` - English
- `es` - Spanish
- `fr` - French
- `de` - German
- `it` - Italian
- `pt` - Portuguese
- `ru` - Russian
- `ja` - Japanese
- `ko` - Korean
- `zh` - Chinese

## How It Works

1. **Login**: Authenticates with OpenSubtitles using the official API
2. **Search**: Searches OpenSubtitles for subtitles matching your query
3. **Download**: Downloads the best matching subtitles file using native fetch
4. **Parse**: Parses the SRT format to extract individual subtitles entries
5. **Translate**: Uses Google Gemini to translate entries in parallel batches
6. **Generate**: Creates a new translated subtitles file with native Node.js APIs

## Output

The script creates a `downloads` directory with:
- Original subtitles file (e.g., `movie.srt`)
- Translated subtitles file (e.g., `movie_es.srt`)

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENSUBTITLES_API_KEY` | Your OpenSubtitles API key | Required |
| `OPENSUBTITLES_USERNAME` | Your OpenSubtitles username | Required |
| `OPENSUBTITLES_PASSWORD` | Your OpenSubtitles password | Required |
| `GEMINI_API_KEY` | Your Google Gemini API key | Required |
| `TARGET_LANGUAGE` | Language to translate to | `es` (Spanish) |
| `SOURCE_LANGUAGE` | Source language of subtitles | `en` (English) |

## Error Handling

The script includes comprehensive error handling for:
- Network connectivity issues
- Missing API credentials
- Invalid subtitles formats
- Translation API rate limits
- File system errors

If a translation fails for a specific subtitles entry, the script will keep the original text and continue with the next entry.

## Rate Limiting

The script translates subtitles in parallel batches of 5 entries with a 1-second delay between batches to respect API rate limits while maximizing performance.

## Supported Subtitles Formats

Currently supports:
- SRT (SubRip Subtitles) - direct download from OpenSubtitles

## Troubleshooting

### Common Issues

1. **"No subtitles found"**: Try a more specific or different search term
2. **API key errors**: Verify your API keys are correct and active
3. **Login errors**: Check your OpenSubtitles credentials and API key
4. **Node.js version**: Ensure you're using Node.js 18+ for `--env-file` support

### Debug Mode

To see more detailed output, you can modify the script or add console.log statements.

## Modern Node.js & TypeScript Features

This project showcases modern Node.js and TypeScript development practices:

- **TypeScript**: Full type safety with native Node.js transpilation
- **ES Modules**: Native module system with `import`/`export`
- **Top-level await**: Direct async execution without wrapper functions
- **Native fetch**: Built-in HTTP client (Node.js 18+)
- **Native fs/promises**: Modern file operations without external libraries
- **--env-file**: Native environment variable loading (no dotenv needed)
- **--experimental-strip-types**: Native TypeScript execution without build step
- **Functional programming**: Pure functions instead of classes
- **Parallel processing**: Concurrent translation for optimal performance
- **Interface definitions**: Proper TypeScript interfaces for type safety

## Dependencies

- `@google/genai` - Google Gemini AI integration
- `opensubtitles.com` - Official OpenSubtitles API client

### Dev Dependencies

- `typescript` - Type checking and compilation
- `@types/node` - Node.js type definitions
- `@biomejs/biome` - Fast linter and formatter

## TypeScript

This project uses TypeScript for type checking only - execution is handled by Node.js native TypeScript transpilation using the `--experimental-strip-types` flag. This means:

- ✅ Full TypeScript type checking during development
- ✅ No build step required
- ✅ Direct execution of `.ts` files
- ✅ Fast development iteration

### Available Scripts

```bash
npm run type-check    # Check TypeScript types without emitting files
npm run build        # Compile TypeScript (for CI/CD if needed)
npm start           # Run the application
npm run dev         # Run with file watching
```

## LLM Request/Response Logging

All LLM requests and responses are automatically logged to separate text files in the `./logs/` directory for debugging and analysis purposes.

### Log Structure

For each LLM request, two files are created:
- `{requestId}_request.txt` - Contains the full prompt sent to the LLM
- `{requestId}_response.txt` - Contains the full response received from the LLM

In case of errors, an additional file is created:
- `{requestId}_error.txt` - Contains error details and the original prompt

### Example Log Files

**Request file** (`req_1705312245123_abc123def_request.txt`):
```
TIMESTAMP: 2024-01-15T10:30:45.123Z
REQUEST_ID: req_1705312245123_abc123def
MODEL: gemini-2.5-flash
SOURCE_LANGUAGE: en
TARGET_LANGUAGE: cs
CHUNK_INDEX: 1
TOTAL_CHUNKS: 5
SEGMENTS_TO_TRANSLATE: 25
CONTEXT_SEGMENTS: 3
PROMPT_LENGTH: 1847

=== PROMPT ===
You are a professional subtitles translator. Translate the following subtitles from en to cs.
...
```

**Response file** (`req_1705312245123_abc123def_response.txt`):
```
TIMESTAMP: 2024-01-15T10:30:45.890Z
REQUEST_ID: req_1705312245123_abc123def
MODEL: gemini-2.5-flash
SOURCE_LANGUAGE: en
TARGET_LANGUAGE: cs
CHUNK_INDEX: 1
TOTAL_CHUNKS: 5
DURATION_MS: 1500
RESPONSE_LENGTH: 892
TRANSLATED_SEGMENTS: 25

=== RESPONSE ===
1
Přeložený text titulků...
```

### Log Management

- Logs are stored locally in the `./logs/` directory
- Each request gets a unique ID for easy correlation between request and response
- Log files are automatically ignored by git (in `.gitignore`)
- Files include timestamps, chunk information, and performance metrics

## License

ISC License

## Contributing

Feel free to submit issues and pull requests to improve the script.

## Disclaimer

This tool is for personal use only. Please respect copyright laws and the terms of service of OpenSubtitles and Google's APIs.
