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
): Promise<TranscriptEntry[]> {
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
- Do NOT add any explanations, comments, or extra text before or after

TRANSLATION GUIDELINES:
- Make translations natural and appropriate for subtitles
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

	return translatedEntries;
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

	const transcript = createTranscript(originalSegments);

	const translatedEntries = await translateTranscript(
		model,
		transcript,
		sourceLanguage,
		targetLanguage,
		logger,
		onProgress,
	);

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
		logger.error(
			{
				error: errorMessage,
				originalSegments: originalSegments.length,
				translatedSegments: translatedEntries.length,
				sampleOriginal: originalSegments.slice(0, 3).map((s) => ({
					sequence: s.sequence,
					text: s.text.substring(0, 50) + (s.text.length > 50 ? "..." : ""),
				})),
				sampleTranslated: translatedEntries.slice(0, 3).map((e) => ({
					number: e.number,
					text: e.text.substring(0, 50) + (e.text.length > 50 ? "..." : ""),
				})),
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
