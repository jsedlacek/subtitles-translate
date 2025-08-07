import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type pino from "pino";

export interface LLMLogEntry {
	timestamp: string;
	requestId: string;
	model: string;
	chunkIndex?: number;
	totalChunks?: number;
	sourceLanguage: string;
	targetLanguage: string;
	request: {
		prompt: string;
		promptLength: number;
		segmentsToTranslate: number;
		contextSegments: number;
	};
	response: {
		content: string;
		responseLength: number;
		duration: number;
		translatedSegments: number;
	};
	metadata?: Record<string, unknown>;
}

export class LLMLogger {
	private logDir: string;
	private logFile: string;
	private logger: pino.Logger;

	constructor(logger: pino.Logger, logDir = "./logs") {
		this.logger = logger;
		this.logDir = logDir;
		this.logFile = path.join(
			logDir,
			`llm-requests-${this.getDateString()}.jsonl`,
		);
	}

	private getDateString(): string {
		return new Date().toISOString().split("T")[0]!;
	}

	private generateRequestId(): string {
		return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
		_sourceLanguage: string,
		_targetLanguage: string,
		chunkIndex?: number,
		totalChunks?: number,
		segmentsToTranslate?: number,
		contextSegments?: number,
		_metadata?: Record<string, unknown>,
	): Promise<string> {
		const requestId = this.generateRequestId();

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

		return requestId;
	}

	async logResponse(
		requestId: string,
		model: string,
		prompt: string,
		response: string,
		duration: number,
		sourceLanguage: string,
		targetLanguage: string,
		chunkIndex?: number,
		totalChunks?: number,
		segmentsToTranslate?: number,
		contextSegments?: number,
		translatedSegments?: number,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		const timestamp = new Date().toISOString();

		const logEntry: LLMLogEntry = {
			timestamp,
			requestId,
			model,
			...(chunkIndex !== undefined && { chunkIndex }),
			...(totalChunks !== undefined && { totalChunks }),
			sourceLanguage,
			targetLanguage,
			request: {
				prompt,
				promptLength: prompt.length,
				segmentsToTranslate: segmentsToTranslate || 0,
				contextSegments: contextSegments || 0,
			},
			response: {
				content: response,
				responseLength: response.length,
				duration,
				translatedSegments: translatedSegments || 0,
			},
			...(metadata && { metadata }),
		};

		// Log completion with summary
		this.logger.debug(
			{
				requestId,
				model,
				duration,
				promptLength: prompt.length,
				responseLength: response.length,
				chunkIndex,
				totalChunks,
				segmentsToTranslate,
				translatedSegments,
			},
			"✅ LLM request completed",
		);

		try {
			await this.ensureLogDirectory();

			// Append to JSONL file (one JSON object per line)
			const logLine = `${JSON.stringify(logEntry)}\n`;
			await writeFile(this.logFile, logLine, { flag: "a" });

			this.logger.debug(
				{
					requestId,
					logFile: this.logFile,
				},
				"📝 LLM request logged to file",
			);
		} catch (error) {
			this.logger.error(
				{
					error: error instanceof Error ? error.message : String(error),
					requestId,
					logFile: this.logFile,
				},
				"❌ Failed to log LLM request to file",
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
		metadata?: Record<string, unknown>,
	): Promise<void> {
		const timestamp = new Date().toISOString();

		const logEntry = {
			timestamp,
			requestId,
			model,
			...(chunkIndex !== undefined && { chunkIndex }),
			...(totalChunks !== undefined && { totalChunks }),
			sourceLanguage,
			targetLanguage,
			request: {
				prompt,
				promptLength: prompt.length,
				segmentsToTranslate: 0,
				contextSegments: 0,
			},
			error: {
				message: error.message,
				stack: error.stack,
				duration,
			},
			...(metadata && { metadata }),
		};

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

			const logLine = `${JSON.stringify(logEntry)}\n`;
			await writeFile(this.logFile, logLine, { flag: "a" });
		} catch (logError) {
			this.logger.error(
				{
					error:
						logError instanceof Error ? logError.message : String(logError),
					requestId,
					logFile: this.logFile,
				},
				"❌ Failed to log LLM error to file",
			);
		}
	}

	getLogFile(): string {
		return this.logFile;
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
