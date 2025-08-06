import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { GoogleGenAI } from "@google/genai";
import type pino from "pino";

export interface SRTSegment {
	sequence: number;
	startTime: string;
	endTime: string;
	text: string;
}

export interface TranscriptEntry {
	number: number;
	text: string;
}

export function parseSRTContent(srtContent: string): SRTSegment[] {
	const segments: SRTSegment[] = [];
	const blocks = srtContent
		.split(/\n\s*\n/)
		.filter((block) => block.trim().length > 0);

	for (const block of blocks) {
		const lines = block.trim().split("\n");
		if (lines.length < 3) continue;

		const firstLine = lines[0];
		const secondLine = lines[1];
		if (!firstLine || !secondLine) continue;

		const sequence = parseInt(firstLine.trim(), 10);
		if (Number.isNaN(sequence)) continue;

		const timeMatch = secondLine.match(
			/^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})$/,
		);
		if (!timeMatch || !timeMatch[1] || !timeMatch[2]) continue;

		const text = lines.slice(2).join("\n").trim();

		segments.push({
			sequence,
			startTime: timeMatch[1],
			endTime: timeMatch[2],
			text,
		});
	}

	return segments;
}

export function createTranscript(segments: SRTSegment[]): TranscriptEntry[] {
	return segments.map((segment) => ({
		number: segment.sequence,
		text: segment.text,
	}));
}

export function parseTranslatedTranscript(
	translatedText: string,
): TranscriptEntry[] {
	const entries: TranscriptEntry[] = [];
	const lines = translatedText
		.split("\n")
		.filter((line) => line.trim().length > 0);

	for (const line of lines) {
		const match = line.match(/^(\d+):\s*(.+)$/);
		if (match?.[1] && match[2]) {
			const number = parseInt(match[1], 10);
			const text = match[2].trim();
			if (!Number.isNaN(number) && text) {
				entries.push({ number, text });
			}
		}
	}

	return entries;
}

export function createSRTLikeFormat(segments: SRTSegment[]): string {
	return segments
		.map((segment) => `${segment.sequence}\n${segment.text}`)
		.join("\n\n");
}

export function parseSRTLikeFormat(srtLikeText: string): TranscriptEntry[] {
	const entries: TranscriptEntry[] = [];
	const blocks = srtLikeText
		.split(/\n\s*\n/)
		.filter((block) => block.trim().length > 0);

	for (const block of blocks) {
		const lines = block.trim().split("\n");
		if (lines.length < 2) continue;

		const firstLine = lines[0];
		if (!firstLine) continue;

		const sequence = parseInt(firstLine.trim(), 10);
		if (Number.isNaN(sequence)) continue;

		const text = lines.slice(1).join("\n").trim();
		if (text) {
			entries.push({
				number: sequence,
				text,
			});
		}
	}

	return entries;
}

export function reconstructSRT(
	originalSegments: SRTSegment[],
	translatedEntries: TranscriptEntry[],
): string {
	const translatedMap = new Map<number, string>();

	for (const entry of translatedEntries) {
		translatedMap.set(entry.number, entry.text);
	}

	const reconstructedSegments: string[] = [];

	for (const segment of originalSegments) {
		const translatedText = translatedMap.get(segment.sequence);
		if (!translatedText) {
			throw new Error(
				`Missing translation for segment ${segment.sequence}. Original text was: "${segment.text}"`,
			);
		}

		const srtBlock = [
			segment.sequence.toString(),
			`${segment.startTime} --> ${segment.endTime}`,
			translatedText,
			"",
		].join("\n");

		reconstructedSegments.push(srtBlock);
	}

	return reconstructedSegments.join("\n").trim();
}

async function saveDebugData(
	originalSegments: SRTSegment[],
	translatedEntries: TranscriptEntry[],
	transcriptEntries: TranscriptEntry[],
	rawLLMInput: string,
	rawLLMOutput: string,
	logger: pino.Logger,
): Promise<void> {
	try {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const debugDir = "logs";

		const analysis = analyzeTranslationFailure(
			originalSegments,
			translatedEntries,
		);

		const debugData = {
			timestamp: new Date().toISOString(),
			originalSegments,
			translatedEntries,
			transcriptEntries,
			rawLLMInput,
			rawLLMOutput,
			analysis: {
				originalCount: originalSegments.length,
				translatedCount: translatedEntries.length,
				originalNumbers: originalSegments
					.map((s) => s.sequence)
					.sort((a, b) => a - b),
				translatedNumbers: translatedEntries
					.map((e) => e.number)
					.sort((a, b) => a - b),
				...analysis,
			},
		};

		// Create debug directory if it doesn't exist
		await writeFile(
			path.join(debugDir, `translation-failure-${timestamp}.json`),
			JSON.stringify(debugData, null, 2),
		).catch(async (err) => {
			// If directory doesn't exist, try to create it first
			if (err.code === "ENOENT") {
				const { mkdir } = await import("node:fs/promises");
				await mkdir(debugDir, { recursive: true });
				await writeFile(
					path.join(debugDir, `translation-failure-${timestamp}.json`),
					JSON.stringify(debugData, null, 2),
				);
			} else {
				throw err;
			}
		});

		logger.info(
			{ debugFile: `${debugDir}/translation-failure-${timestamp}.json` },
			"Debug data saved for translation failure analysis",
		);
	} catch (error) {
		logger.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to save debug data",
		);
	}
}

function analyzeTranslationFailure(
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

interface ChunkInfo {
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

function parseTimestamp(timestamp: string): number {
	const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
	if (!match) return 0;

	const hours = parseInt(match[1]!, 10);
	const minutes = parseInt(match[2]!, 10);
	const seconds = parseInt(match[3]!, 10);
	const milliseconds = parseInt(match[4]!, 10);

	return hours * 3600000 + minutes * 60000 + seconds * 1000 + milliseconds;
}

function createIntelligentChunks(
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
	chunks.forEach((chunk) => (chunk.totalChunks = chunks.length));

	return chunks;
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

export function countSRTSegments(srtContent: string): number {
	return parseSRTContent(srtContent).length;
}

async function translateChunk(
	model: GoogleGenAI,
	chunk: ChunkInfo,
	sourceLanguage: string,
	targetLanguage: string,
	logger: pino.Logger,
): Promise<{
	entries: TranscriptEntry[];
	rawInput: string;
	rawOutput: string;
}> {
	const contextText =
		chunk.contextSegments.length > 0
			? chunk.contextSegments
					.map((segment) => `${segment.sequence}\n${segment.text}`)
					.join("\n\n")
			: "";

	const translateText = chunk.translateSegments
		.map((segment) => `${segment.sequence}\n${segment.text}`)
		.join("\n\n");

	const translateSegmentNumbers = chunk.translateSegments.map(
		(s) => s.sequence,
	);

	let prompt = `You are a professional subtitles translator. Translate the following subtitles from ${sourceLanguage} to ${targetLanguage}.

CONTEXT AND TRANSLATION INSTRUCTIONS:
- This is chunk ${chunk.chunkIndex + 1} of ${chunk.totalChunks}
- You will see some segments for CONTEXT ONLY, then segments to TRANSLATE
- ONLY translate the segments listed in the "TRANSLATE THESE SEGMENTS" section
- Context segments help you understand the flow but should NOT be included in your output

`;

	if (chunk.contextSegments.length > 0) {
		prompt += `CONTEXT ONLY (do not translate these):
${contextText}

--- END OF CONTEXT ---

`;
	}

	prompt += `TRANSLATE THESE SEGMENTS (segments ${translateSegmentNumbers.join(", ")}):
${translateText}

CRITICAL RULES:
- Output EXACTLY ${chunk.translateSegments.length} segments (${translateSegmentNumbers.join(", ")})
- Use SRT-like format: number on one line, translated text on following lines, blank line between segments
- Translate each segment independently - NO merging content across segments
- Preserve HTML tags like <i>, <b>, {\\an8} exactly as shown
- Preserve line breaks within subtitle text exactly as they appear
- Translate descriptions in square brackets (e.g., [music playing])

EXAMPLE OUTPUT FORMAT:
${translateSegmentNumbers[0]}
[translated text for segment ${translateSegmentNumbers[0]}]

${translateSegmentNumbers[1] || translateSegmentNumbers[0]! + 1}
[translated text for segment ${translateSegmentNumbers[1] || translateSegmentNumbers[0]! + 1}]

Remember: Output ONLY the ${chunk.translateSegments.length} segments listed above, maintaining exact 1:1 mapping.`;

	const stream = await model.models.generateContentStream({
		model: "gemini-2.5-flash",
		contents: prompt,
	});

	let translatedContent = "";
	for await (const streamChunk of stream) {
		translatedContent += streamChunk.text || "";
	}

	const finalContent = translatedContent.trim();
	const translatedEntries = parseSRTLikeFormat(finalContent);

	logger.debug(
		{
			chunkIndex: chunk.chunkIndex,
			contextSegments: chunk.contextSegments.length,
			translateSegments: chunk.translateSegments.length,
			translatedEntries: translatedEntries.length,
			expectedSegments: translateSegmentNumbers,
			actualSegments: translatedEntries.map((e) => e.number),
		},
		"Translated chunk",
	);

	return {
		entries: translatedEntries,
		rawInput: prompt,
		rawOutput: finalContent,
	};
}

export async function translateTranscript(
	model: GoogleGenAI,
	transcript: TranscriptEntry[],
	sourceLanguage: string,
	targetLanguage: string,
	logger: pino.Logger,
	onProgress?: (progress: {
		completed: number;
		total: number;
		percentage: number;
	}) => void,
): Promise<{
	translatedEntries: TranscriptEntry[];
	rawInput: string;
	rawOutput: string;
}> {
	const totalSegments = transcript.length;

	logger.debug(
		{
			totalSegments,
			sourceLanguage,
			targetLanguage,
		},
		"Translating transcript with Gemini using intelligent chunking",
	);

	// Convert transcript entries back to segments for chunking analysis
	const segments: SRTSegment[] = transcript.map((entry) => ({
		sequence: entry.number,
		startTime: "00:00:00,000", // Dummy timestamp for chunking
		endTime: "00:00:00,000", // Dummy timestamp for chunking
		text: entry.text,
	}));

	// Create intelligent chunks with context
	const chunks = createIntelligentChunks(segments, 25, 3);

	logger.debug(
		{
			totalSegments,
			numberOfChunks: chunks.length,
			chunkSizes: chunks.map((c) => c.translateSegments.length),
		},
		"Created intelligent chunks for translation",
	);

	const allTranslatedEntries: TranscriptEntry[] = [];
	const allRawInputs: string[] = [];
	const allRawOutputs: string[] = [];

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i]!;

		logger.debug(
			{
				chunkIndex: i,
				contextSegments: chunk.contextSegments.map((s) => s.sequence),
				translateSegments: chunk.translateSegments.map((s) => s.sequence),
			},
			"Processing chunk",
		);

		const chunkResult = await translateChunk(
			model,
			chunk,
			sourceLanguage,
			targetLanguage,
			logger,
		);

		allTranslatedEntries.push(...chunkResult.entries);
		allRawInputs.push(chunkResult.rawInput);
		allRawOutputs.push(chunkResult.rawOutput);

		// Update progress
		if (onProgress) {
			const completed = allTranslatedEntries.length;
			const percentage = Math.round((completed / totalSegments) * 100);
			onProgress({
				completed,
				total: totalSegments,
				percentage,
			});
		}

		logger.debug(
			{
				chunkIndex: i,
				chunkTranslated: chunkResult.entries.length,
				totalTranslated: allTranslatedEntries.length,
				remaining: totalSegments - allTranslatedEntries.length,
			},
			"Chunk translation completed",
		);
	}

	if (onProgress) {
		onProgress({
			completed: totalSegments,
			total: totalSegments,
			percentage: 100,
		});
	}

	logger.debug(
		{
			originalSegments: totalSegments,
			translatedSegments: allTranslatedEntries.length,
		},
		"All chunks translated, assembling final result",
	);

	// Sort translated entries by segment number to ensure correct order
	allTranslatedEntries.sort((a, b) => a.number - b.number);

	return {
		translatedEntries: allTranslatedEntries,
		rawInput: allRawInputs.join("\n\n=== CHUNK SEPARATOR ===\n\n"),
		rawOutput: allRawOutputs.join("\n\n=== CHUNK SEPARATOR ===\n\n"),
	};
}

export async function translateSRTContent(
	model: GoogleGenAI,
	srtContent: string,
	sourceLanguage: string,
	targetLanguage: string,
	logger: pino.Logger,
	onProgress?: (progress: {
		completed: number;
		total: number;
		percentage: number;
	}) => void,
): Promise<string> {
	logger.debug(
		{
			contentLength: srtContent.length,
			sourceLanguage,
			targetLanguage,
		},
		"Starting SRT translation process",
	);

	const originalSegments = parseSRTContent(srtContent);
	const totalSegments = originalSegments.length;

	logger.debug(
		{
			totalSegments,
		},
		"Parsed SRT into segments",
	);

	const transcriptEntries = createTranscript(originalSegments);

	const translationResult = await translateTranscript(
		model,
		transcriptEntries,
		sourceLanguage,
		targetLanguage,
		logger,
		onProgress,
	);

	const { translatedEntries, rawInput, rawOutput } = translationResult;

	try {
		validateTranslation(originalSegments, translatedEntries);
		logger.debug(
			{
				originalSegments: originalSegments.length,
				translatedSegments: translatedEntries.length,
				validationStatus: "passed",
			},
			"Translation validation passed",
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Save debug data for analysis
		await saveDebugData(
			originalSegments,
			translatedEntries,
			transcriptEntries,
			rawInput,
			rawOutput,
			logger,
		);

		// Get detailed analysis for logging
		const analysis = analyzeTranslationFailure(
			originalSegments,
			translatedEntries,
		);

		logger.error(
			{
				error: errorMessage,
				originalSegments: originalSegments.length,
				translatedSegments: translatedEntries.length,
				missingSegments: analysis.missingNumbers.length,
				extraSegments: analysis.extraNumbers.length,
				missingNumbers: analysis.missingNumbers.slice(0, 10), // Show first 10 missing
				extraNumbers: analysis.extraNumbers.slice(0, 10), // Show first 10 extra
				sequenceGaps: analysis.sequenceGaps,
				insights: analysis.insights,
				sampleOriginal: originalSegments.slice(0, 3).map((s) => ({
					sequence: s.sequence,
					text: s.text.substring(0, 50) + (s.text.length > 50 ? "..." : ""),
				})),
				sampleTranslated: translatedEntries.slice(0, 3).map((e) => ({
					number: e.number,
					text: e.text.substring(0, 50) + (e.text.length > 50 ? "..." : ""),
				})),
				debugDataSaved: true,
				rawLLMDataIncluded: true,
			},
			"Translation validation failed - this usually indicates the LLM didn't follow the expected format",
		);
		throw new Error(
			`Translation validation failed: ${errorMessage}. Please check that the LLM is properly following the transcript format.`,
		);
	}

	const reconstructedSRT = reconstructSRT(originalSegments, translatedEntries);

	logger.debug(
		{
			originalLength: srtContent.length,
			reconstructedLength: reconstructedSRT.length,
			totalSegments,
		},
		"SRT reconstruction completed",
	);

	return reconstructedSRT;
}
