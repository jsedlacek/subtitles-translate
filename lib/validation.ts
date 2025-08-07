import type { SRTSegment } from "./srt.ts";
import type { TranscriptEntry } from "./transcript.ts";

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
