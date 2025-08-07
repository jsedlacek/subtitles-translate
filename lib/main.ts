import type { GoogleGenAI } from "@google/genai";
import type pino from "pino";
import { saveDebugData } from "./debug.ts";
import { parseSRTContent, reconstructSRT } from "./srt.ts";
import { createTranscript } from "./transcript.ts";
import { translateTranscript } from "./translation.ts";
import { analyzeTranslationFailure, validateTranslation } from "./validation.ts";

export async function translateSRTContent(
	model: GoogleGenAI,
	srtContent: string,
	sourceLanguage: string,
	targetLanguage: string,
	logger: pino.Logger,
	onProgress?: (progress: { completed: number; total: number; percentage: number }) => void
): Promise<string> {
	logger.debug(
		{
			contentLength: srtContent.length,
			sourceLanguage,
			targetLanguage,
		},
		"Starting SRT translation process"
	);

	const originalSegments = parseSRTContent(srtContent);
	const totalSegments = originalSegments.length;

	logger.debug(
		{
			totalSegments,
		},
		"Parsed SRT into segments"
	);

	const transcriptEntries = createTranscript(originalSegments);

	const translationResult = await translateTranscript(
		model,
		transcriptEntries,
		sourceLanguage,
		targetLanguage,
		logger,
		onProgress
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
			"Translation validation passed"
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
			logger
		);

		// Get detailed analysis for logging
		const analysis = analyzeTranslationFailure(originalSegments, translatedEntries);

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
			"Translation validation failed - this usually indicates the LLM didn't follow the expected format"
		);
		throw new Error(
			`Translation validation failed: ${errorMessage}. Please check that the LLM is properly following the transcript format.`
		);
	}

	const reconstructedSRT = reconstructSRT(originalSegments, translatedEntries);

	logger.debug(
		{
			originalLength: srtContent.length,
			reconstructedLength: reconstructedSRT.length,
			totalSegments,
		},
		"SRT reconstruction completed"
	);

	return reconstructedSRT;
}
