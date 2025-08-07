import { writeFile } from "node:fs/promises";
import path from "node:path";
import type pino from "pino";
import type { SRTSegment } from "./srt.ts";
import type { TranscriptEntry } from "./transcript.ts";
import { analyzeTranslationFailure } from "./validation.ts";

export async function saveDebugData(
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
