import type { GoogleGenAI } from "@google/genai";
import type pino from "pino";
import type { ChunkInfo } from "./chunking.ts";
import { createIntelligentChunks } from "./chunking.ts";
import { getLLMLogger } from "./llm-logger.ts";
import type { SRTSegment } from "./srt.ts";
import { parseSRTLikeFormat } from "./srt.ts";
import type { TranscriptEntry } from "./transcript.ts";

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

	const llmLogger = getLLMLogger();
	const startTime = Date.now();

	// Log the request
	const requestId = await llmLogger.logRequest(
		"gemini-2.5-flash",
		prompt,
		sourceLanguage,
		targetLanguage,
		chunk.chunkIndex,
		chunk.totalChunks,
		chunk.translateSegments.length,
		chunk.contextSegments.length,
	);

	let translatedContent = "";
	let error: Error | null = null;

	try {
		const stream = await model.models.generateContentStream({
			model: "gemini-2.5-flash",
			contents: prompt,
		});

		for await (const streamChunk of stream) {
			translatedContent += streamChunk.text || "";
		}
	} catch (err) {
		error = err instanceof Error ? err : new Error(String(err));
		throw error;
	} finally {
		const duration = Date.now() - startTime;

		if (error) {
			await llmLogger.logError(
				requestId,
				"gemini-2.5-flash",
				prompt,
				error,
				duration,
				sourceLanguage,
				targetLanguage,
				chunk.chunkIndex,
				chunk.totalChunks,
			);
		} else {
			const finalContent = translatedContent.trim();
			const translatedEntries = parseSRTLikeFormat(finalContent);

			await llmLogger.logResponse(
				requestId,
				"gemini-2.5-flash",
				finalContent,
				duration,
				sourceLanguage,
				targetLanguage,
				chunk.chunkIndex,
				chunk.totalChunks,
				translatedEntries.length,
			);
		}
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
