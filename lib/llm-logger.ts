import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type pino from "pino";

export class LLMLogger {
	private logDir: string;
	private logger: pino.Logger;

	constructor(logger: pino.Logger, logDir = "./logs") {
		this.logger = logger;
		this.logDir = logDir;
	}

	private generateRequestId(): string {
		return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	private getTimestamp(): string {
		return new Date().toISOString();
	}

	async ensureLogDirectory(): Promise<void> {
		if (!existsSync(this.logDir)) {
			await mkdir(this.logDir, { recursive: true });
			this.logger.debug({ logDir: this.logDir }, "Created LLM logs directory");
		}
	}

	async logRequest(
		model: string,
		prompt: string,
		sourceLanguage: string,
		targetLanguage: string,
		chunkIndex?: number,
		totalChunks?: number,
		segmentsToTranslate?: number,
		contextSegments?: number,
	): Promise<string> {
		const requestId = this.generateRequestId();
		const timestamp = this.getTimestamp();

		// Log the request start
		this.logger.debug(
			{
				requestId,
				model,
				promptLength: prompt.length,
				chunkIndex,
				totalChunks,
				segmentsToTranslate,
				contextSegments,
			},
			"🤖 LLM request started",
		);

		try {
			await this.ensureLogDirectory();

			// Create request file
			const requestFileName = `${requestId}_request.txt`;
			const requestFilePath = path.join(this.logDir, requestFileName);

			const requestContent = `TIMESTAMP: ${timestamp}
REQUEST_ID: ${requestId}
MODEL: ${model}
SOURCE_LANGUAGE: ${sourceLanguage}
TARGET_LANGUAGE: ${targetLanguage}
CHUNK_INDEX: ${chunkIndex ?? "N/A"}
TOTAL_CHUNKS: ${totalChunks ?? "N/A"}
SEGMENTS_TO_TRANSLATE: ${segmentsToTranslate ?? "N/A"}
CONTEXT_SEGMENTS: ${contextSegments ?? "N/A"}
PROMPT_LENGTH: ${prompt.length}

=== PROMPT ===
${prompt}
`;

			await writeFile(requestFilePath, requestContent, "utf8");

			this.logger.debug(
				{
					requestId,
					requestFile: requestFilePath,
				},
				"📝 LLM request logged to file",
			);
		} catch (error) {
			this.logger.error(
				{
					error: error instanceof Error ? error.message : String(error),
					requestId,
				},
				"❌ Failed to log LLM request to file",
			);
		}

		return requestId;
	}

	async logResponse(
		requestId: string,
		model: string,
		response: string,
		duration: number,
		sourceLanguage: string,
		targetLanguage: string,
		chunkIndex?: number,
		totalChunks?: number,
		translatedSegments?: number,
	): Promise<void> {
		const timestamp = this.getTimestamp();

		// Log completion with summary
		this.logger.debug(
			{
				requestId,
				model,
				duration,
				responseLength: response.length,
				chunkIndex,
				totalChunks,
				translatedSegments,
			},
			"✅ LLM request completed",
		);

		try {
			await this.ensureLogDirectory();

			// Create response file
			const responseFileName = `${requestId}_response.txt`;
			const responseFilePath = path.join(this.logDir, responseFileName);

			const responseContent = `TIMESTAMP: ${timestamp}
REQUEST_ID: ${requestId}
MODEL: ${model}
SOURCE_LANGUAGE: ${sourceLanguage}
TARGET_LANGUAGE: ${targetLanguage}
CHUNK_INDEX: ${chunkIndex ?? "N/A"}
TOTAL_CHUNKS: ${totalChunks ?? "N/A"}
DURATION_MS: ${duration}
RESPONSE_LENGTH: ${response.length}
TRANSLATED_SEGMENTS: ${translatedSegments ?? "N/A"}

=== RESPONSE ===
${response}
`;

			await writeFile(responseFilePath, responseContent, "utf8");

			this.logger.debug(
				{
					requestId,
					responseFile: responseFilePath,
				},
				"📝 LLM response logged to file",
			);
		} catch (error) {
			this.logger.error(
				{
					error: error instanceof Error ? error.message : String(error),
					requestId,
				},
				"❌ Failed to log LLM response to file",
			);
		}
	}

	async logError(
		requestId: string,
		model: string,
		prompt: string,
		error: Error,
		duration: number,
		sourceLanguage: string,
		targetLanguage: string,
		chunkIndex?: number,
		totalChunks?: number,
	): Promise<void> {
		const timestamp = this.getTimestamp();

		this.logger.error(
			{
				requestId,
				model,
				error: error.message,
				duration,
				chunkIndex,
				totalChunks,
			},
			"❌ LLM request failed",
		);

		try {
			await this.ensureLogDirectory();

			// Create error file
			const errorFileName = `${requestId}_error.txt`;
			const errorFilePath = path.join(this.logDir, errorFileName);

			const errorContent = `TIMESTAMP: ${timestamp}
REQUEST_ID: ${requestId}
MODEL: ${model}
SOURCE_LANGUAGE: ${sourceLanguage}
TARGET_LANGUAGE: ${targetLanguage}
CHUNK_INDEX: ${chunkIndex ?? "N/A"}
TOTAL_CHUNKS: ${totalChunks ?? "N/A"}
DURATION_MS: ${duration}
PROMPT_LENGTH: ${prompt.length}

=== ERROR ===
MESSAGE: ${error.message}
STACK: ${error.stack || "No stack trace available"}

=== ORIGINAL PROMPT ===
${prompt}
`;

			await writeFile(errorFilePath, errorContent, "utf8");

			this.logger.debug(
				{
					requestId,
					errorFile: errorFilePath,
				},
				"📝 LLM error logged to file",
			);
		} catch (logError) {
			this.logger.error(
				{
					error:
						logError instanceof Error ? logError.message : String(logError),
					requestId,
				},
				"❌ Failed to log LLM error to file",
			);
		}
	}

	getLogDirectory(): string {
		return this.logDir;
	}
}

// Utility function to create a singleton LLM logger instance
let globalLLMLogger: LLMLogger | null = null;

export function createLLMLogger(
	logger: pino.Logger,
	logDir?: string,
): LLMLogger {
	if (!globalLLMLogger) {
		globalLLMLogger = new LLMLogger(logger, logDir);
	}
	return globalLLMLogger;
}

export function getLLMLogger(): LLMLogger {
	if (!globalLLMLogger) {
		throw new Error(
			"LLM logger not initialized. Call createLLMLogger() first.",
		);
	}
	return globalLLMLogger;
}
