# Subtitles Translation Library

This directory contains the modular components of the subtitles translation library, split from the original monolithic `lib.ts` file into focused, maintainable modules.

## Module Structure

### Core Modules

- **`srt.ts`** - SRT file parsing and reconstruction
  - Parse SRT content into structured segments
  - Reconstruct SRT files from segments and translations
  - SRT-like format conversion utilities
  - Segment counting

- **`transcript.ts`** - Transcript manipulation
  - Convert SRT segments to transcript entries
  - Parse translated transcript formats
  - Handle transcript data structures

- **`translation.ts`** - Core translation logic
  - Intelligent chunking for large subtitle files
  - Translation orchestration with context
  - Progress tracking and chunk management

- **`main.ts`** - Main SRT translation orchestrator
  - High-level API for translating complete SRT files
  - Brings together all modules for end-to-end translation
  - Error handling and debug data collection

- **`validation.ts`** - Translation validation and analysis
  - Validate translation completeness
  - Analyze translation failures
  - Provide detailed error insights

- **`chunking.ts`** - Intelligent subtitle chunking
  - Break large subtitle sets into manageable chunks
  - Natural break detection based on timing gaps
  - Context preservation across chunks

- **`debug.ts`** - Debug data management
  - Save translation failure data for analysis
  - Structured logging for debugging

- **`utils.ts`** - Utility functions
  - Timestamp parsing and manipulation
  - Common helper functions



## Test Structure

Tests are co-located with their corresponding source files:

- **`srt.test.ts`** - Tests for SRT parsing, reconstruction, and format conversion
- **`transcript.test.ts`** - Tests for transcript manipulation functions
- **`validation.test.ts`** - Tests for validation and analysis functions
- **`chunking.test.ts`** - Tests for intelligent chunking functionality
- **`utils.test.ts`** - Tests for utility functions
- **`integration.test.ts`** - End-to-end integration tests


## Usage

Import directly from specific modules as needed:

```typescript
import { translateSRTContent } from './lib/main.js';
import { parseSRTContent } from './lib/srt.js';
import { createIntelligentChunks } from './lib/chunking.js';
import { validateTranslation } from './lib/validation.js';
```

## Benefits of This Structure

1. **Separation of Concerns** - Each module has a single, well-defined responsibility
2. **Maintainability** - Easier to understand, modify, and extend individual components
3. **Testability** - Focused test suites co-located with source code for better discoverability
4. **Reusability** - Individual modules can be used independently
5. **Type Safety** - Better TypeScript support with focused interfaces
6. **Debugging** - Easier to isolate and fix issues in specific functionality
7. **Co-location** - Tests are next to the code they test for better organization

## Final Directory Structure

```
lib/
├── README.md
├── chunking.ts              # Intelligent chunking logic
├── chunking.test.ts         # Tests for chunking
├── debug.ts                 # Debug data utilities
├── integration.test.ts      # End-to-end integration tests
├── main.ts                  # Main SRT translation orchestrator
├── srt.ts                   # SRT parsing and reconstruction
├── srt.test.ts             # Tests for SRT functionality
├── transcript.ts            # Transcript manipulation
├── transcript.test.ts       # Tests for transcript functions
├── translation.ts           # Core translation logic
├── utils.ts                 # Utility functions
├── utils.test.ts           # Tests for utilities
├── validation.ts            # Translation validation
└── validation.test.ts       # Tests for validation
```

## Module Dependencies

```
main.ts
├── srt.ts
├── transcript.ts
├── translation.ts
│   ├── chunking.ts
│   │   ├── srt.ts
│   │   └── utils.ts
│   └── srt.ts
├── validation.ts
│   ├── srt.ts
│   └── transcript.ts
└── debug.ts
    ├── srt.ts
    ├── transcript.ts
    └── validation.ts
```

## Running Tests

```bash
# Run all tests
npm test

# Type checking
npm run type-check
```

All tests pass and the modular structure provides a clean, maintainable architecture with focused responsibilities.
