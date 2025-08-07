import type { ChunkInfo } from "./chunking.ts";
import type { SRTSegment } from "./srt.ts";
import type { TranscriptEntry } from "./transcript.ts";

export function validateChunk(
	chunk: ChunkInfo,
	translatedEntries: TranscriptEntry[],
): void {
	const expectedCount = chunk.translateSegments.length;
	const actualCount = translatedEntries.length;

	if (expectedCount !== actualCount) {
		const expectedNumbers = chunk.translateSegments.map((s) => s.sequence);
		const actualNumbers = translatedEntries.map((e) => e.number);

		throw new Error(
			`Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} validation failed: Expected ${expectedCount} segments but got ${actualCount}. Expected segments: [${expectedNumbers.join(", ")}], Got segments: [${actualNumbers.join(", ")}]. This indicates the LLM didn't follow the expected format for this chunk.`,
		);
	}

	const expectedNumbers = new Set(
		chunk.translateSegments.map((s) => s.sequence),
	);
	const actualNumbers = new Set(translatedEntries.map((e) => e.number));

	const missingNumbers = [...expectedNumbers].filter(
		(n) => !actualNumbers.has(n),
	);
	const extraNumbers = [...actualNumbers].filter(
		(n) => !expectedNumbers.has(n),
	);

	if (missingNumbers.length > 0) {
		throw new Error(
			`Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} validation failed: Missing translations for segments: ${missingNumbers.join(", ")}. Expected segments: [${[...expectedNumbers].sort((a, b) => a - b).join(", ")}], Got segments: [${[...actualNumbers].sort((a, b) => a - b).join(", ")}]. This indicates the LLM didn't provide translations for all required segments in this chunk.`,
		);
	}

	if (extraNumbers.length > 0) {
		throw new Error(
			`Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} validation failed: Unexpected segments in translation: ${extraNumbers.join(", ")}. Expected segments: [${[...expectedNumbers].sort((a, b) => a - b).join(", ")}], Got segments: [${[...actualNumbers].sort((a, b) => a - b).join(", ")}]. This indicates the LLM provided extra segments not requested for this chunk.`,
		);
	}
}

export function validateTranslation(
	originalSegments: SRTSegment[],
	translatedEntries: TranscriptEntry[],
): void {
	const originalCount = originalSegments.length;
	const translatedCount = translatedEntries.length;

	if (originalCount !== translatedCount) {
		throw new Error(
			`Segment count mismatch: original has ${originalCount} segments, translation has ${translatedCount}. This usually indicates the LLM didn't provide translations for all segments.`,
		);
	}

	const originalNumbers = new Set(originalSegments.map((s) => s.sequence));
	const translatedNumbers = new Set(translatedEntries.map((e) => e.number));

	const missingNumbers = [...originalNumbers].filter(
		(n) => !translatedNumbers.has(n),
	);
	const extraNumbers = [...translatedNumbers].filter(
		(n) => !originalNumbers.has(n),
	);

	if (missingNumbers.length > 0) {
		throw new Error(
			`Missing translations for segments: ${missingNumbers.join(", ")}. This usually indicates the LLM didn't provide translations for all segments.`,
		);
	}

	if (extraNumbers.length > 0) {
		throw new Error(
			`Unexpected segments in translation: ${extraNumbers.join(", ")}. This indicates the LLM provided extra segments not in the original.`,
		);
	}
}

export function analyzeTranslationFailure(
	originalSegments: SRTSegment[],
	translatedEntries: TranscriptEntry[],
): {
	missingNumbers: number[];
	extraNumbers: number[];
	sequenceGaps: { start: number; end: number }[];
	insights: string[];
} {
	const originalNumbers = new Set(originalSegments.map((s) => s.sequence));
	const translatedNumbers = new Set(translatedEntries.map((e) => e.number));

	const missingNumbers = [...originalNumbers]
		.filter((n) => !translatedNumbers.has(n))
		.sort((a, b) => a - b);
	const extraNumbers = [...translatedNumbers]
		.filter((n) => !originalNumbers.has(n))
		.sort((a, b) => a - b);

	// Find gaps in missing sequences
	const sequenceGaps: { start: number; end: number }[] = [];
	if (missingNumbers.length > 0) {
		let gapStart = missingNumbers[0]!;
		let gapEnd = missingNumbers[0]!;

		for (let i = 1; i < missingNumbers.length; i++) {
			const current = missingNumbers[i]!;
			if (current === gapEnd + 1) {
				gapEnd = current;
			} else {
				sequenceGaps.push({ start: gapStart, end: gapEnd });
				gapStart = current;
				gapEnd = current;
			}
		}
		sequenceGaps.push({ start: gapStart, end: gapEnd });
	}

	// Generate insights
	const insights: string[] = [];

	if (missingNumbers.length > 0) {
		insights.push(`${missingNumbers.length} segments missing from translation`);

		if (
			sequenceGaps.length === 1 &&
			sequenceGaps[0]?.start === sequenceGaps[0]?.end
		) {
			insights.push(
				`Only missing segment ${missingNumbers[0]} - likely a single segment issue`,
			);
		} else if (sequenceGaps.length === 1) {
			const gap = sequenceGaps[0]!;
			insights.push(
				`Missing consecutive segments ${gap.start}-${gap.end} - likely a chunk processing issue`,
			);
		} else {
			insights.push(
				`Missing segments in ${sequenceGaps.length} separate ranges - likely multiple processing issues`,
			);
		}
	}

	if (extraNumbers.length > 0) {
		insights.push(
			`${extraNumbers.length} extra segments in translation - LLM may have generated additional content`,
		);
	}

	const maxOriginal = Math.max(...originalSegments.map((s) => s.sequence));
	const maxTranslated = Math.max(...translatedEntries.map((e) => e.number));

	if (maxTranslated > maxOriginal) {
		insights.push(
			`Translation goes beyond original range (${maxTranslated} > ${maxOriginal}) - LLM may have continued generating`,
		);
	}

	if (missingNumbers.length === 2 && extraNumbers.length === 0) {
		insights.push(
			"Exactly 2 missing segments - common when LLM skips or merges segments",
		);
	}

	return { missingNumbers, extraNumbers, sequenceGaps, insights };
}
