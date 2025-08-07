import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type pino from "pino";

export interface LogWriter {
	write(fileName: string, content: string): Promise<void>;
}

export class FileLogWriter implements LogWriter {
	private logDir: string;
	private logger: pino.Logger;

	constructor(logger: pino.Logger, logDir = "./logs") {
		this.logger = logger;
		this.logDir = logDir;
	}

	private async ensureLogDirectory(): Promise<void> {
		if (!existsSync(this.logDir)) {
			await mkdir(this.logDir, { recursive: true });
			this.logger.debug({ logDir: this.logDir }, "Created LLM logs directory");
		}
	}

	async write(fileName: string, content: string): Promise<void> {
		await this.ensureLogDirectory();
		const filePath = path.join(this.logDir, fileName);
		try {
			await writeFile(filePath, content, "utf8");
			this.logger.debug(
				{
					file: filePath,
				},
				"📝 Logged to file"
			);
		} catch (error) {
			this.logger.error(
				{
					error: error instanceof Error ? error.message : String(error),
					file: filePath,
				},
				"❌ Failed to log to file"
			);
		}
	}
}
