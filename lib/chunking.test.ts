import assert from "node:assert";
import { describe, test } from "node:test";
import { createIntelligentChunks } from "./chunking.ts";
import type { SRTSegment } from "./srt.ts";

describe("Chunking Module", () => {
	describe("createIntelligentChunks", () => {
		test("should not chunk small subtitle sets", () => {
			const segments: SRTSegment[] = Array.from({ length: 10 }, (_, i) => ({
				sequence: i + 1,
				startTime: `00:00:${String(i).padStart(2, "0")},000`,
				endTime: `00:00:${String(i + 1).padStart(2, "0")},000`,
				text: `Text ${i + 1}`,
			}));

			const chunks = createIntelligentChunks(segments, 25, 3);

			assert.strictEqual(chunks.length, 1);
			assert.strictEqual(chunks[0]?.segments.length, 10);
			assert.strictEqual(chunks[0]?.contextSegments.length, 0);
			assert.strictEqual(chunks[0]?.translateSegments.length, 10);
			assert.strictEqual(chunks[0]?.chunkIndex, 0);
			assert.strictEqual(chunks[0]?.totalChunks, 1);
		});

		test("should maintain segment order and completeness", () => {
			// Test with a larger set that would trigger chunking
			const segments: SRTSegment[] = Array.from({ length: 50 }, (_, i) => ({
				sequence: i + 1,
				startTime: `00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")},000`,
				endTime: `00:${String(Math.floor((i + 1) / 60)).padStart(2, "0")}:${String((i + 1) % 60).padStart(2, "0")},000`,
				text: `Subtitle text ${i + 1}`,
			}));

			const chunks = createIntelligentChunks(segments, 25, 3);

			// Should create multiple chunks
			assert(chunks.length > 1);

			// Verify all segments are present when combining translateSegments
			const allTranslateSegments = chunks.flatMap((chunk) => chunk.translateSegments);
			assert.strictEqual(allTranslateSegments.length, 50);

			// Verify no segment is lost
			for (let i = 0; i < 50; i++) {
				const segment = allTranslateSegments.find((s) => s.sequence === i + 1);
				assert(segment, `Segment ${i + 1} should be present`);
				assert.strictEqual(segment.text, `Subtitle text ${i + 1}`);
			}

			// Verify chunk indices are correct
			for (let i = 0; i < chunks.length; i++) {
				assert.strictEqual(chunks[i]?.chunkIndex, i);
				assert.strictEqual(chunks[i]?.totalChunks, chunks.length);
			}
		});

		test("should handle segments with time gaps correctly", () => {
			const segments: SRTSegment[] = [
				{
					sequence: 1,
					startTime: "00:00:01,000",
					endTime: "00:00:02,000",
					text: "First segment",
				},
				{
					sequence: 2,
					startTime: "00:00:02,500",
					endTime: "00:00:03,500",
					text: "Second segment",
				},
				// Large gap here - more than 3 seconds
				{
					sequence: 3,
					startTime: "00:00:10,000",
					endTime: "00:00:11,000",
					text: "Third segment after gap",
				},
				{
					sequence: 4,
					startTime: "00:00:11,500",
					endTime: "00:00:12,500",
					text: "Fourth segment",
				},
			];

			const chunks = createIntelligentChunks(segments, 25, 3);

			// Should still be one chunk since total is small
			assert.strictEqual(chunks.length, 1);
			assert.strictEqual(chunks[0]?.translateSegments.length, 4);
		});

		test("should respect maxChunkSize parameter", () => {
			const segments: SRTSegment[] = Array.from({ length: 60 }, (_, i) => ({
				sequence: i + 1,
				startTime: `00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")},000`,
				endTime: `00:${String(Math.floor((i + 1) / 60)).padStart(2, "0")}:${String((i + 1) % 60).padStart(2, "0")},000`,
				text: `Text ${i + 1}`,
			}));

			const chunks = createIntelligentChunks(segments, 20, 3);

			// Should create multiple chunks
			assert(chunks.length >= 3);

			// No chunk should have more than 20 translateSegments
			for (const chunk of chunks) {
				assert(chunk.translateSegments.length <= 20);
			}
		});

		test("should provide context segments for non-first chunks", () => {
			const segments: SRTSegment[] = Array.from({ length: 60 }, (_, i) => ({
				sequence: i + 1,
				startTime: `00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")},000`,
				endTime: `00:${String(Math.floor((i + 1) / 60)).padStart(2, "0")}:${String((i + 1) % 60).padStart(2, "0")},000`,
				text: `Text ${i + 1}`,
			}));

			const chunks = createIntelligentChunks(segments, 20, 5);

			// First chunk should have no context
			assert.strictEqual(chunks[0]?.contextSegments.length, 0);

			// Subsequent chunks should have context segments
			if (chunks.length > 1) {
				const secondChunk = chunks[1];
				assert(secondChunk && secondChunk.contextSegments.length > 0);
				assert(secondChunk && secondChunk.contextSegments.length <= 5);

				// Context segments should come from the end of the previous chunk's range
				const lastContextSequence =
					secondChunk?.contextSegments[secondChunk?.contextSegments.length - 1]?.sequence;
				const firstTranslateSequence = secondChunk?.translateSegments[0]?.sequence;
				assert(lastContextSequence! < firstTranslateSequence!);
			}
		});

		test("should handle edge case with exact chunk size", () => {
			const segments: SRTSegment[] = Array.from({ length: 25 }, (_, i) => ({
				sequence: i + 1,
				startTime: `00:00:${String(i).padStart(2, "0")},000`,
				endTime: `00:00:${String(i + 1).padStart(2, "0")},000`,
				text: `Text ${i + 1}`,
			}));

			const chunks = createIntelligentChunks(segments, 25, 3);

			// Should create exactly one chunk since it fits exactly
			assert.strictEqual(chunks.length, 1);
			assert.strictEqual(chunks[0]?.translateSegments.length, 25);
			assert.strictEqual(chunks[0]?.contextSegments.length, 0);
		});

		test("should handle single segment", () => {
			const segments: SRTSegment[] = [
				{
					sequence: 1,
					startTime: "00:00:01,000",
					endTime: "00:00:02,000",
					text: "Single segment",
				},
			];

			const chunks = createIntelligentChunks(segments, 25, 3);

			assert.strictEqual(chunks.length, 1);
			assert.strictEqual(chunks[0]?.translateSegments.length, 1);
			assert.strictEqual(chunks[0]?.contextSegments.length, 0);
			assert.strictEqual(chunks[0]?.segments.length, 1);
		});

		test("should handle empty segments array", () => {
			const chunks = createIntelligentChunks([], 25, 3);

			assert.strictEqual(chunks.length, 1);
			assert.strictEqual(chunks[0]?.translateSegments.length, 0);
			assert.strictEqual(chunks[0]?.contextSegments.length, 0);
			assert.strictEqual(chunks[0]?.segments.length, 0);
		});

		test("should respect contextSize parameter", () => {
			const segments: SRTSegment[] = Array.from({ length: 60 }, (_, i) => ({
				sequence: i + 1,
				startTime: `00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")},000`,
				endTime: `00:${String(Math.floor((i + 1) / 60)).padStart(2, "0")}:${String((i + 1) % 60).padStart(2, "0")},000`,
				text: `Text ${i + 1}`,
			}));

			const chunks = createIntelligentChunks(segments, 20, 2);

			if (chunks.length > 1) {
				const secondChunk = chunks[1];
				// Context should not exceed the specified contextSize
				assert(secondChunk && secondChunk.contextSegments.length <= 2);
			}
		});

		test("should break at natural gaps when possible", () => {
			const segments: SRTSegment[] = [
				// First group - close together
				{
					sequence: 1,
					startTime: "00:00:01,000",
					endTime: "00:00:02,000",
					text: "First",
				},
				{
					sequence: 2,
					startTime: "00:00:02,100",
					endTime: "00:00:03,000",
					text: "Second",
				},
				// Large gap (more than 3 seconds)
				{
					sequence: 3,
					startTime: "00:00:10,000",
					endTime: "00:00:11,000",
					text: "Third after gap",
				},
				{
					sequence: 4,
					startTime: "00:00:11,100",
					endTime: "00:00:12,000",
					text: "Fourth",
				},
			];

			// Force chunking with very small chunk size
			const chunks = createIntelligentChunks(segments, 2, 1);

			// Should respect natural breaks when creating chunks
			assert(chunks.length >= 2);

			// Verify segments are properly distributed
			const allTranslateSegments = chunks.flatMap((chunk) => chunk.translateSegments);
			assert.strictEqual(allTranslateSegments.length, 4);
		});
	});
});
