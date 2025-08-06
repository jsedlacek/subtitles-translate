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
		"Translating transcript with Gemini",
	);

	const transcriptText = transcript
		.map((entry) => `${entry.number}: ${entry.text}`)
		.join("\n");

	const prompt = `You are a professional subtitles translator. Translate the following transcript from ${sourceLanguage} to ${targetLanguage}.

CRITICAL FORMAT REQUIREMENTS:
- Each line must follow EXACTLY this format: "number: translated text"
- Translate ONLY the text after the colon (:), NEVER change the numbers
- You MUST include ALL ${transcript.length} entries in your response
- Maintain the exact same line structure and numbering sequence
- Translate descriptions in square brackets (e.g., [music playing]) to their equivalent in the target language.
- Do NOT add any explanations, comments, or extra text before or after

TRANSLATION GUIDELINES:
- Make translations natural and appropriate for subtitles
- For text in square brackets (like [music playing] or [gunshot]), translate the description of the sound.
- Preserve HTML tags like <i>, <b>, {\\an8} if present
- Keep line breaks within subtitle text exactly as they appear
- Ensure cultural context is appropriate for the target language

EXAMPLE FORMAT:
If given:
1: Hello there
2: How are you?

You should respond:
1: [translation of "Hello there"]
2: [translation of "How are you?"]

Original transcript to translate:

${transcriptText}

REMEMBER: Respond with EXACTLY ${transcript.length} lines in the format "number: translated text" with no additional content.`;

	const stream = await model.models.generateContentStream({
		model: "gemini-2.5-flash",
		contents: prompt,
	});

	let translatedContent = "";
	let lastReportedPercentage = 0;

	if (onProgress) {
		onProgress({ completed: 0, total: totalSegments, percentage: 0 });
	}

	for await (const chunk of stream) {
		const chunkText = chunk.text || "";
		translatedContent += chunkText;

		if (onProgress) {
			const completedLines = translatedContent
				.split("\n")
				.filter((line) => line.trim().length > 0 && line.includes(":")).length;

			const percentage = Math.min(
				100,
				Math.round((completedLines / totalSegments) * 100),
			);

			if (percentage > lastReportedPercentage) {
				onProgress({
					completed: completedLines,
					total: totalSegments,
					percentage,
				});
				lastReportedPercentage = percentage;

				logger.debug(
					{
						completed: completedLines,
						total: totalSegments,
						percentage,
						contentLength: translatedContent.length,
					},
					"Translation progress update",
				);
			}
		}
	}

	if (onProgress && lastReportedPercentage < 100) {
		onProgress({
			completed: totalSegments,
			total: totalSegments,
			percentage: 100,
		});
	}

	const finalContent = translatedContent.trim();

	logger.debug(
		{
			originalSegments: totalSegments,
			translatedLength: finalContent.length,
		},
		"Transcript translation completed",
	);

	const translatedEntries = parseTranslatedTranscript(finalContent);

	logger.debug(
		{
			parsedSegments: translatedEntries.length,
			expectedSegments: totalSegments,
			sampleEntries: translatedEntries.slice(0, 3).map((e) => ({
				number: e.number,
				text: e.text.substring(0, 50) + (e.text.length > 50 ? "..." : ""),
			})),
		},
		"Parsed translated transcript",
	);

	if (translatedEntries.length === 0) {
		logger.error(
			{
				finalContentPreview: finalContent.substring(0, 500),
				contentLength: finalContent.length,
			},
			"No translated entries were parsed from LLM response",
		);
		throw new Error(
			"Failed to parse any translated entries from LLM response. Check the LLM output format.",
		);
	}

	return {
		translatedEntries,
		rawInput: prompt,
		rawOutput: finalContent,
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
