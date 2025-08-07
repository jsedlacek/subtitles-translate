import type pino from "pino";
import type { LogWriter } from "./log-writer.ts";

export class LLMLogger {
	private logger: pino.Logger;
	private writer: LogWriter;

	constructor(logger: pino.Logger, writer: LogWriter) {
		this.logger = logger;
		this.writer = writer;
	}

	private generateRequestId(): string {
		return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	private getTimestamp(): string {
		return new Date().toISOString();
	}

	async logRequest(
		model: string,
		prompt: string,
		sourceLanguage: string,
		targetLanguage: string,
		chunkIndex?: number,
		totalChunks?: number,
		segmentsToTranslate?: number,
		contextSegments?: number
	): Promise<string> {
		const requestId = this.generateRequestId();
		const timestamp = this.getTimestamp();

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
			"🤖 LLM request started"
		);

		const requestFileName = `${requestId}_request.txt`;
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

		await this.writer.write(requestFileName, requestContent);

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
		translatedSegments?: number
	): Promise<void> {
		const timestamp = this.getTimestamp();

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
			"✅ LLM request completed"
		);

		const responseFileName = `${requestId}_response.txt`;
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

		await this.writer.write(responseFileName, responseContent);
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
		totalChunks?: number
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
			"❌ LLM request failed"
		);

		const errorFileName = `${requestId}_error.txt`;
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

		await this.writer.write(errorFileName, errorContent);
	}
}
