import assert from "node:assert";
import { describe, test } from "node:test";
import type { ChunkInfo } from "./chunking.ts";
import type { SRTSegment } from "./srt.ts";
import type { TranscriptEntry } from "./transcript.ts";
import {
	analyzeTranslationFailure,
	validateChunk,
	validateTranslation,
} from "./validation.ts";

describe("Validation Module", () => {
	const sampleSegments: SRTSegment[] = [
		{
			sequence: 1,
			startTime: "00:00:01,000",
			endTime: "00:00:04,000",
			text: "Hello, how are you today?",
		},
		{
			sequence: 2,
			startTime: "00:00:05,000",
			endTime: "00:00:08,000",
			text: "I'm doing well, thank you.",
		},
		{
			sequence: 3,
			startTime: "00:00:09,000",
			endTime: "00:00:12,000",
			text: "Pretty good, thanks for asking.",
		},
		{
			sequence: 4,
			startTime: "00:00:13,000",
			endTime: "00:00:16,000",
			text: "That's great to hear!",
		},
		{
			sequence: 5,
			startTime: "00:00:17,000",
			endTime: "00:00:20,000",
			text: "See you later!",
		},
	];

	describe("validateChunk", () => {
		test("should pass for valid chunk translation", () => {
			const chunk: ChunkInfo = {
				segments: [sampleSegments[0]!, sampleSegments[1]!],
				contextSegments: [],
				translateSegments: [sampleSegments[0]!, sampleSegments[1]!],
				chunkIndex: 0,
				totalChunks: 1,
			};

			const validTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
			];

			assert.doesNotThrow(() => validateChunk(chunk, validTranslation));
		});

		test("should throw for missing segments in chunk", () => {
			const chunk: ChunkInfo = {
				segments: [sampleSegments[0]!, sampleSegments[1]!, sampleSegments[2]!],
				contextSegments: [],
				translateSegments: [
					sampleSegments[0]!,
					sampleSegments[1]!,
					sampleSegments[2]!,
				],
				chunkIndex: 0,
				totalChunks: 2,
			};

			const incompleteTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				// Missing segment 2 and 3
			];

			assert.throws(
				() => validateChunk(chunk, incompleteTranslation),
				/Chunk 1\/2 validation failed: Expected 3 segments but got 1/,
			);
		});

		test("should throw for extra segments in chunk", () => {
			const chunk: ChunkInfo = {
				segments: [sampleSegments[0]!, sampleSegments[1]!],
				contextSegments: [],
				translateSegments: [sampleSegments[0]!, sampleSegments[1]!],
				chunkIndex: 1,
				totalChunks: 3,
			};

			const extraTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
				{ number: 99, text: "Extra translation" },
			];

			assert.throws(
				() => validateChunk(chunk, extraTranslation),
				/Chunk 2\/3 validation failed: Expected 2 segments but got 3/,
			);
		});

		test("should throw for wrong segment numbers in chunk", () => {
			const chunk: ChunkInfo = {
				segments: [sampleSegments[2]!, sampleSegments[3]!],
				contextSegments: [sampleSegments[1]!],
				translateSegments: [sampleSegments[2]!, sampleSegments[3]!],
				chunkIndex: 1,
				totalChunks: 2,
			};

			const wrongNumbersTranslation: TranscriptEntry[] = [
				{ number: 10, text: "Translation 1" },
				{ number: 20, text: "Translation 2" },
			];

			assert.throws(
				() => validateChunk(chunk, wrongNumbersTranslation),
				/Chunk 2\/2 validation failed: Missing translations for segments: 3, 4/,
			);
		});

		test("should handle chunk with context segments correctly", () => {
			const chunk: ChunkInfo = {
				segments: [sampleSegments[0]!, sampleSegments[1]!, sampleSegments[2]!],
				contextSegments: [sampleSegments[0]!],
				translateSegments: [sampleSegments[1]!, sampleSegments[2]!],
				chunkIndex: 1,
				totalChunks: 2,
			};

			const validTranslation: TranscriptEntry[] = [
				{ number: 2, text: "Translation 2" },
				{ number: 3, text: "Translation 3" },
			];

			assert.doesNotThrow(() => validateChunk(chunk, validTranslation));
		});

		test("should provide detailed error for mixed missing and extra in chunk", () => {
			const chunk: ChunkInfo = {
				segments: [sampleSegments[0]!, sampleSegments[1]!, sampleSegments[2]!],
				contextSegments: [],
				translateSegments: [
					sampleSegments[0]!,
					sampleSegments[1]!,
					sampleSegments[2]!,
				],
				chunkIndex: 0,
				totalChunks: 1,
			};

			const mixedTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 99, text: "Extra translation" },
				{ number: 100, text: "Another extra" },
			];

			assert.throws(
				() => validateChunk(chunk, mixedTranslation),
				/Chunk 1\/1 validation failed: Missing translations for segments: 2, 3/,
			);
		});
	});

	describe("validateTranslation", () => {
		test("should pass for valid translation", () => {
			const validTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
				{ number: 3, text: "Translation 3" },
				{ number: 4, text: "Translation 4" },
				{ number: 5, text: "Translation 5" },
			];

			assert.doesNotThrow(() =>
				validateTranslation(sampleSegments, validTranslation),
			);
		});

		test("should throw for missing segments", () => {
			const incompleteTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
			];

			assert.throws(
				() => validateTranslation(sampleSegments, incompleteTranslation),
				/Segment count mismatch/,
			);
		});

		test("should throw for extra segments", () => {
			const extraTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
				{ number: 3, text: "Translation 3" },
				{ number: 4, text: "Translation 4" },
				{ number: 5, text: "Translation 5" },
				{ number: 6, text: "Extra translation" },
			];

			assert.throws(
				() => validateTranslation(sampleSegments, extraTranslation),
				/Segment count mismatch/,
			);
		});

		test("should throw for wrong segment numbers", () => {
			const wrongNumbersTranslation: TranscriptEntry[] = [
				{ number: 10, text: "Translation 1" },
				{ number: 20, text: "Translation 2" },
				{ number: 30, text: "Translation 3" },
				{ number: 40, text: "Translation 4" },
				{ number: 50, text: "Translation 5" },
			];

			assert.throws(
				() => validateTranslation(sampleSegments, wrongNumbersTranslation),
				/Missing translations for segments: 1, 2, 3, 4, 5/,
			);
		});

		test("should throw for mixed missing and extra segments", () => {
			const mixedTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 3, text: "Translation 3" },
				{ number: 5, text: "Translation 5" },
				{ number: 99, text: "Extra translation" },
			];

			assert.throws(
				() => validateTranslation(sampleSegments, mixedTranslation),
				/Segment count mismatch/,
			);
		});

		test("should handle empty arrays", () => {
			assert.doesNotThrow(() => validateTranslation([], []));
		});

		test("should validate non-sequential segment numbers", () => {
			const nonSequentialSegments: SRTSegment[] = [
				{
					sequence: 5,
					startTime: "00:00:01,000",
					endTime: "00:00:03,000",
					text: "First",
				},
				{
					sequence: 10,
					startTime: "00:00:04,000",
					endTime: "00:00:06,000",
					text: "Second",
				},
			];

			const validTranslation: TranscriptEntry[] = [
				{ number: 5, text: "Translation 1" },
				{ number: 10, text: "Translation 2" },
			];

			assert.doesNotThrow(() =>
				validateTranslation(nonSequentialSegments, validTranslation),
			);
		});
	});

	describe("analyzeTranslationFailure", () => {
		test("should identify missing segments", () => {
			const incompleteTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 3, text: "Translation 3" },
				{ number: 5, text: "Translation 5" },
			];

			const analysis = analyzeTranslationFailure(
				sampleSegments,
				incompleteTranslation,
			);

			assert.deepStrictEqual(analysis.missingNumbers, [2, 4]);
			assert.deepStrictEqual(analysis.extraNumbers, []);
			assert.strictEqual(analysis.sequenceGaps.length, 2);
			assert.strictEqual(analysis.insights.length, 3); // Missing segments + gap analysis + specific insight
		});

		test("should identify extra segments", () => {
			const extraTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
				{ number: 3, text: "Translation 3" },
				{ number: 4, text: "Translation 4" },
				{ number: 5, text: "Translation 5" },
				{ number: 6, text: "Extra translation" },
				{ number: 7, text: "Another extra" },
			];

			const analysis = analyzeTranslationFailure(
				sampleSegments,
				extraTranslation,
			);

			assert.deepStrictEqual(analysis.missingNumbers, []);
			assert.deepStrictEqual(analysis.extraNumbers, [6, 7]);
			assert.strictEqual(analysis.sequenceGaps.length, 0);
			assert(
				analysis.insights.some((insight) =>
					insight.includes("extra segments in translation"),
				),
			);
		});

		test("should identify consecutive missing segments", () => {
			const missingConsecutiveTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 5, text: "Translation 5" },
			];

			const analysis = analyzeTranslationFailure(
				sampleSegments,
				missingConsecutiveTranslation,
			);

			assert.deepStrictEqual(analysis.missingNumbers, [2, 3, 4]);
			assert.strictEqual(analysis.sequenceGaps.length, 1);
			assert.strictEqual(analysis.sequenceGaps[0]?.start, 2);
			assert.strictEqual(analysis.sequenceGaps[0]?.end, 4);
			assert(
				analysis.insights.some((insight) =>
					insight.includes("Missing consecutive segments 2-4"),
				),
			);
		});

		test("should identify single missing segment", () => {
			const singleMissingTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
				{ number: 4, text: "Translation 4" },
				{ number: 5, text: "Translation 5" },
			];

			const analysis = analyzeTranslationFailure(
				sampleSegments,
				singleMissingTranslation,
			);

			assert.deepStrictEqual(analysis.missingNumbers, [3]);
			assert.strictEqual(analysis.sequenceGaps.length, 1);
			assert(
				analysis.insights.some((insight) =>
					insight.includes("Only missing segment 3"),
				),
			);
		});

		test("should identify exactly 2 missing segments pattern", () => {
			const twoMissingTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 3, text: "Translation 3" },
				{ number: 5, text: "Translation 5" },
			];

			const analysis = analyzeTranslationFailure(
				sampleSegments,
				twoMissingTranslation,
			);

			assert.deepStrictEqual(analysis.missingNumbers, [2, 4]);
			assert.deepStrictEqual(analysis.extraNumbers, []);
			assert(
				analysis.insights.some((insight) =>
					insight.includes("Exactly 2 missing segments"),
				),
			);
		});

		test("should identify when translation goes beyond original range", () => {
			const beyondRangeTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
				{ number: 3, text: "Translation 3" },
				{ number: 4, text: "Translation 4" },
				{ number: 5, text: "Translation 5" },
				{ number: 10, text: "Way beyond" },
			];

			const analysis = analyzeTranslationFailure(
				sampleSegments,
				beyondRangeTranslation,
			);

			assert(
				analysis.insights.some((insight) =>
					insight.includes("Translation goes beyond original range"),
				),
			);
		});

		test("should handle multiple separate gaps", () => {
			const multipleGapsTranslation: TranscriptEntry[] = [
				{ number: 2, text: "Translation 2" },
				{ number: 4, text: "Translation 4" },
			];

			const analysis = analyzeTranslationFailure(
				sampleSegments,
				multipleGapsTranslation,
			);

			assert.deepStrictEqual(analysis.missingNumbers, [1, 3, 5]);
			assert.strictEqual(analysis.sequenceGaps.length, 3);
			assert(
				analysis.insights.some((insight) =>
					insight.includes("Missing segments in 3 separate ranges"),
				),
			);
		});

		test("should handle empty translation", () => {
			const analysis = analyzeTranslationFailure(sampleSegments, []);

			assert.deepStrictEqual(analysis.missingNumbers, [1, 2, 3, 4, 5]);
			assert.deepStrictEqual(analysis.extraNumbers, []);
			assert.strictEqual(analysis.sequenceGaps.length, 1);
			assert.strictEqual(analysis.sequenceGaps[0]?.start, 1);
			assert.strictEqual(analysis.sequenceGaps[0]?.end, 5);
		});

		test("should handle perfect translation", () => {
			const perfectTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
				{ number: 3, text: "Translation 3" },
				{ number: 4, text: "Translation 4" },
				{ number: 5, text: "Translation 5" },
			];

			const analysis = analyzeTranslationFailure(
				sampleSegments,
				perfectTranslation,
			);

			assert.deepStrictEqual(analysis.missingNumbers, []);
			assert.deepStrictEqual(analysis.extraNumbers, []);
			assert.strictEqual(analysis.sequenceGaps.length, 0);
			assert.strictEqual(analysis.insights.length, 0);
		});

		test("should handle non-sequential segment numbers", () => {
			const nonSequentialSegments: SRTSegment[] = [
				{
					sequence: 5,
					startTime: "00:00:01,000",
					endTime: "00:00:03,000",
					text: "First",
				},
				{
					sequence: 10,
					startTime: "00:00:04,000",
					endTime: "00:00:06,000",
					text: "Second",
				},
				{
					sequence: 15,
					startTime: "00:00:07,000",
					endTime: "00:00:09,000",
					text: "Third",
				},
			];

			const incompleteTranslation: TranscriptEntry[] = [
				{ number: 5, text: "Translation 1" },
				{ number: 15, text: "Translation 3" },
			];

			const analysis = analyzeTranslationFailure(
				nonSequentialSegments,
				incompleteTranslation,
			);

			assert.deepStrictEqual(analysis.missingNumbers, [10]);
			assert.deepStrictEqual(analysis.extraNumbers, []);
			assert.strictEqual(analysis.sequenceGaps.length, 1);
		});
	});

	describe("Integration - Immediate chunk validation", () => {
		test("should detect chunk validation failure immediately", () => {
			// Simulate a scenario where translateChunk would call validateChunk
			// and validateChunk should throw an error immediately
			const chunk: ChunkInfo = {
				segments: [sampleSegments[0]!, sampleSegments[1]!, sampleSegments[2]!],
				contextSegments: [],
				translateSegments: [
					sampleSegments[0]!,
					sampleSegments[1]!,
					sampleSegments[2]!,
				],
				chunkIndex: 2,
				totalChunks: 5,
			};

			// Simulate LLM response that's missing one segment
			const faultyLLMResponse: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
				// Missing segment 3 - this should trigger immediate validation failure
			];

			// This should throw immediately with chunk-specific information
			assert.throws(
				() => validateChunk(chunk, faultyLLMResponse),
				(error: Error) => {
					assert.match(error.message, /Chunk 3\/5 validation failed/);
					assert.match(error.message, /Expected 3 segments but got 2/);
					assert.match(error.message, /Expected segments: \[1, 2, 3\]/);
					assert.match(error.message, /Got segments: \[1, 2\]/);
					return true;
				},
			);
		});

		test("should detect wrong segment numbers immediately", () => {
			const chunk: ChunkInfo = {
				segments: [sampleSegments[2]!, sampleSegments[3]!, sampleSegments[4]!],
				contextSegments: [sampleSegments[1]!],
				translateSegments: [
					sampleSegments[2]!,
					sampleSegments[3]!,
					sampleSegments[4]!,
				],
				chunkIndex: 1,
				totalChunks: 2,
			};

			// Simulate LLM response with wrong segment numbers
			const faultyLLMResponse: TranscriptEntry[] = [
				{ number: 10, text: "Wrong segment 10" },
				{ number: 11, text: "Wrong segment 11" },
				{ number: 12, text: "Wrong segment 12" },
			];

			assert.throws(
				() => validateChunk(chunk, faultyLLMResponse),
				(error: Error) => {
					assert.match(
						error.message,
						/Chunk 2\/2 validation failed: Missing translations for segments: 3, 4, 5/,
					);
					assert.match(error.message, /Expected segments: \[3, 4, 5\]/);
					assert.match(error.message, /Got segments: \[10, 11, 12\]/);
					return true;
				},
			);
		});

		describe("Retry mechanism integration", () => {
			test("should validate retry error detection", () => {
				// Test that validation errors are properly identified for retry
				const chunk: ChunkInfo = {
					segments: sampleSegments.slice(0, 2),
					contextSegments: [],
					translateSegments: sampleSegments.slice(0, 2),
					chunkIndex: 0,
					totalChunks: 1,
				};

				const invalidTranslation: TranscriptEntry[] = [
					{ number: 1, text: "Translation 1" },
					// Missing segment 2
				];

				// Verify this throws a validation error that would trigger retry
				assert.throws(
					() => validateChunk(chunk, invalidTranslation),
					(error: Error) => {
						const message = error.message;
						// These patterns should trigger retries in translateChunk
						assert(
							message.includes("validation failed") ||
								message.includes("Expected") ||
								message.includes("Got segments"),
						);
						return true;
					},
				);
			});

			test("should identify different types of validation errors for retry", () => {
				const chunk: ChunkInfo = {
					segments: sampleSegments.slice(0, 3),
					contextSegments: [],
					translateSegments: sampleSegments.slice(0, 3),
					chunkIndex: 2,
					totalChunks: 5,
				};

				// Test wrong segment count
				assert.throws(
					() => validateChunk(chunk, [{ number: 1, text: "Only one" }]),
					/validation failed.*Expected.*Got segments/,
				);

				// Test wrong segment numbers
				assert.throws(
					() =>
						validateChunk(chunk, [
							{ number: 10, text: "Wrong 1" },
							{ number: 11, text: "Wrong 2" },
							{ number: 12, text: "Wrong 3" },
						]),
					/validation failed.*Expected.*Got segments/,
				);

				// Test extra segments
				assert.throws(
					() =>
						validateChunk(chunk, [
							{ number: 1, text: "Translation 1" },
							{ number: 2, text: "Translation 2" },
							{ number: 3, text: "Translation 3" },
							{ number: 4, text: "Extra translation" },
						]),
					/validation failed.*Expected.*Got segments/,
				);
			});

			test("should provide clear error messages for retry scenarios", () => {
				const chunk: ChunkInfo = {
					segments: sampleSegments.slice(0, 2),
					contextSegments: [],
					translateSegments: sampleSegments.slice(0, 2),
					chunkIndex: 3,
					totalChunks: 8,
				};

				const faultyTranslation: TranscriptEntry[] = [
					{ number: 99, text: "Wrong segment number" },
				];

				assert.throws(
					() => validateChunk(chunk, faultyTranslation),
					(error: Error) => {
						const message = error.message;
						// Should include chunk information for debugging retries
						assert.match(message, /Chunk 4\/8/);
						assert.match(message, /Expected segments: \[1, 2\]/);
						assert.match(message, /Got segments: \[99\]/);
						return true;
					},
				);
			});
		});
	});
});
