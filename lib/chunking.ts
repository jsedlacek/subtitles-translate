import type { SRTSegment } from "./srt.ts";
import { parseTimestamp } from "./utils.ts";

export interface ChunkInfo {
	segments: SRTSegment[];
	contextSegments: SRTSegment[];
	translateSegments: SRTSegment[];
	chunkIndex: number;
	totalChunks: number;
}

function detectNaturalBreaks(segments: SRTSegment[]): number[] {
	const breaks: number[] = [];

	for (let i = 0; i < segments.length - 1; i++) {
		const current = segments[i];
		const next = segments[i + 1];

		if (!current || !next) continue;

		// Parse timestamps to detect longer gaps
		const currentEnd = parseTimestamp(current.endTime);
		const nextStart = parseTimestamp(next.startTime);

		// If there's a gap of more than 3 seconds, consider it a natural break
		if (nextStart - currentEnd > 3000) {
			breaks.push(i + 1); // Break after current segment
		}
	}

	return breaks;
}

export function createIntelligentChunks(
	segments: SRTSegment[],
	maxChunkSize: number = 25,
	contextSize: number = 3,
): ChunkInfo[] {
	if (segments.length <= maxChunkSize) {
		// No chunking needed
		return [
			{
				segments,
				contextSegments: [],
				translateSegments: segments,
				chunkIndex: 0,
				totalChunks: 1,
			},
		];
	}

	const chunks: ChunkInfo[] = [];
	const naturalBreaks = detectNaturalBreaks(segments);

	let currentIndex = 0;
	let chunkIndex = 0;

	while (currentIndex < segments.length) {
		const remainingSegments = segments.length - currentIndex;
		let chunkSize = Math.min(maxChunkSize, remainingSegments);

		// Try to find a natural break within the chunk
		const chunkEnd = currentIndex + chunkSize;
		const nearbyBreak = naturalBreaks.find(
			(breakPoint) =>
				breakPoint > currentIndex + Math.floor(chunkSize * 0.7) &&
				breakPoint <= chunkEnd,
		);

		if (nearbyBreak && nearbyBreak < segments.length) {
			chunkSize = nearbyBreak - currentIndex;
		}

		// Get context segments from previous chunk
		const contextStart = Math.max(0, currentIndex - contextSize);
		const contextSegments =
			currentIndex > 0 ? segments.slice(contextStart, currentIndex) : [];

		// Get segments to translate in this chunk
		const translateSegments = segments.slice(
			currentIndex,
			currentIndex + chunkSize,
		);

		// All segments for this chunk (context + translate)
		const allSegments = [...contextSegments, ...translateSegments];

		chunks.push({
			segments: allSegments,
			contextSegments,
			translateSegments,
			chunkIndex,
			totalChunks: 0, // Will be set after all chunks are created
		});

		currentIndex += chunkSize;
		chunkIndex++;
	}

	// Set total chunks count
  chunks.forEach((chunk) => { chunk.totalChunks = chunks.length });

	return chunks;
}
