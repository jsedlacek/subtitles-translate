import type { GoogleGenAI } from "@google/genai";
import type pino from "pino";
import type { ChunkInfo } from "./chunking.ts";
import { createIntelligentChunks } from "./chunking.ts";
import { getLLMLogger } from "./llm-logger.ts";
import type { SRTSegment } from "./srt.ts";
import { parseSRTLikeFormat } from "./srt.ts";
import type { TranscriptEntry } from "./transcript.ts";
import { validateChunk } from "./validation.ts";

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

	// Validate chunk immediately after translation
	try {
		validateChunk(chunk, translatedEntries);
		logger.debug(
			{
				chunkIndex: chunk.chunkIndex,
				contextSegments: chunk.contextSegments.length,
				translateSegments: chunk.translateSegments.length,
				translatedEntries: translatedEntries.length,
				expectedSegments: translateSegmentNumbers,
				actualSegments: translatedEntries.map((e) => e.number),
				validationStatus: "passed",
			},
			"Translated chunk successfully validated",
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		logger.error(
			{
				chunkIndex: chunk.chunkIndex,
				contextSegments: chunk.contextSegments.length,
				translateSegments: chunk.translateSegments.length,
				translatedEntries: translatedEntries.length,
				expectedSegments: translateSegmentNumbers,
				actualSegments: translatedEntries.map((e) => e.number),
				validationError: errorMessage,
				rawPrompt: `${prompt.substring(0, 500)}...`,
				rawResponse: `${finalContent.substring(0, 500)}...`,
			},
			"Chunk validation failed immediately after translation",
		);

		throw new Error(`Immediate chunk validation failed: ${errorMessage}`);
	}

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
		"Translating transcript with Gemini using concurrent intelligent chunking",
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
		"Created intelligent chunks for concurrent translation",
	);

	// Track progress state
	let completedSegments = 0;
	const progressLock = { value: false }; // Simple mutex-like object

	const updateProgress = (segmentCount: number) => {
		if (!onProgress || progressLock.value) return;

		progressLock.value = true;
		completedSegments += segmentCount;
		const percentage = Math.round((completedSegments / totalSegments) * 100);
		onProgress({
			completed: completedSegments,
			total: totalSegments,
			percentage,
		});
		progressLock.value = false;
	};

	// Create promises for all chunks to process concurrently
	const chunkPromises = chunks.map(async (chunk, index) => {
		logger.debug(
			{
				chunkIndex: index,
				contextSegments: chunk.contextSegments.map((s) => s.sequence),
				translateSegments: chunk.translateSegments.map((s) => s.sequence),
			},
			"Starting concurrent chunk processing",
		);

		const chunkResult = await translateChunk(
			model,
			chunk,
			sourceLanguage,
			targetLanguage,
			logger,
		);

		// Update progress after this chunk completes
		updateProgress(chunkResult.entries.length);

		logger.debug(
			{
				chunkIndex: index,
				chunkTranslated: chunkResult.entries.length,
				totalCompleted: completedSegments,
			},
			"Concurrent chunk translation completed",
		);

		return {
			index,
			...chunkResult,
		};
	});

	// Wait for all chunks to complete
	logger.debug("Waiting for all concurrent chunk translations to complete");
	const chunkResults = await Promise.all(chunkPromises);

	// Sort results by original chunk index to maintain order
	chunkResults.sort((a, b) => a.index - b.index);

	// Combine all results in order
	const allTranslatedEntries: TranscriptEntry[] = [];
	const allRawInputs: string[] = [];
	const allRawOutputs: string[] = [];

	for (const result of chunkResults) {
		allTranslatedEntries.push(...result.entries);
		allRawInputs.push(result.rawInput);
		allRawOutputs.push(result.rawOutput);
	}

	// Ensure final progress update
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
			concurrentChunks: chunks.length,
		},
		"All concurrent chunks translated, assembling final result",
	);

	// Sort translated entries by segment number to ensure correct order
	allTranslatedEntries.sort((a, b) => a.number - b.number);

	return {
		translatedEntries: allTranslatedEntries,
		rawInput: allRawInputs.join("\n\n=== CHUNK SEPARATOR ===\n\n"),
		rawOutput: allRawOutputs.join("\n\n=== CHUNK SEPARATOR ===\n\n"),
	};
}
