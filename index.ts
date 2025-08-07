import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import type { DownloadResponse, SubtitleSearchResult } from "opensubtitles.com";
import OpenSubtitles from "opensubtitles.com";
import pino from "pino";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { LLMLogger } from "./lib/llm-logger.ts";
import { FileLogWriter } from "./lib/log-writer.ts";
import { translateSRTContent } from "./lib/main.ts";
import { countSRTSegments } from "./lib/srt.ts";

/**
 * Create and configure pino logger
 */
function createLogger() {
	const isDevelopment = process.env.NODE_ENV !== "production";
	const logLevel = process.env.LOG_LEVEL || "info";

	return pino({
		level: logLevel,
		...(isDevelopment && {
			transport: {
				target: "pino-pretty",
				options: {
					colorize: true,
					translateTime: "yyyy-mm-dd HH:MM:ss",
					ignore: "pid,hostname",
					messageFormat: "{msg}",
				},
			},
		}),
		...(!isDevelopment && {
			// Production logging format
			timestamp: pino.stdTimeFunctions.isoTime,
			formatters: {
				level: (label) => {
					return { level: label };
				},
			},
		}),
	});
}

const logger = createLogger();
// Removed SubtitleEntry interface as we're no longer parsing individual entries

interface Config {
	opensubtitlesApiKey: string;
	opensubtitlesUsername: string;
	opensubtitlesPassword: string;
	geminiApiKey: string;
	targetLanguage: string;
	sourceLanguage: string;
}

interface CLIArgs {
	search?: string;
	input?: string;
	output?: string;
	targetLanguage: string;
	sourceLanguage: string;
}

/**
 * Initialize OpenSubtitles client and login
 */
async function createOpenSubtitlesClient(config: Config): Promise<OpenSubtitles> {
	logger.info({ username: config.opensubtitlesUsername }, "🔐 Logging into OpenSubtitles...");

	const client = new OpenSubtitles({
		apikey: config.opensubtitlesApiKey,
		useragent: "SubtitleTranslator v2.0.0",
	});

	await client.login({
		username: config.opensubtitlesUsername,
		password: config.opensubtitlesPassword,
	});
	logger.info("✅ Successfully logged into OpenSubtitles");

	return client;
}

/**
 * Initialize Gemini AI model
 */
function createGeminiModel(apiKey: string) {
	return new GoogleGenAI({ apiKey });
}

/**
 * Initialize LLM logger
 */
function initializeLLMLogger(logger: pino.Logger): LLMLogger {
	const writer = new FileLogWriter(logger);
	const llmLogger = new LLMLogger(logger, writer);
	logger.info(
		{
			logDir: "./logs",
		},
		"📝 LLM logger initialized - all requests and responses will be logged as separate text files"
	);
	return llmLogger;
}

/**
 * Search for subtitles
 */
async function searchSubtitles(
	client: OpenSubtitles,
	query: string,
	sourceLanguage: string
): Promise<SubtitleSearchResult[]> {
	logger.info({ query, sourceLanguage }, "🔍 Searching for subtitles");

	const searchParams = {
		query,
		languages: sourceLanguage,
		limit: 10,
	};

	const results = await client.subtitles(searchParams);

	if (!results.data || results.data.length === 0) {
		throw new Error("No subtitles found for the given query");
	}

	logger.info({ count: results.data.length }, "✅ Found subtitles");
	return results.data as SubtitleSearchResult[];
}

/**
 * Download subtitles file
 */
async function downloadSubtitles(
	client: OpenSubtitles,
	subtitleInfo: SubtitleSearchResult,
	outputDir: string = "./downloads"
): Promise<string> {
	const release = subtitleInfo.attributes?.release;
	const fileId = subtitleInfo.attributes?.files?.[0]?.file_id;

	logger.info(
		{
			release,
			fileId,
			outputDir,
		},
		"⬇  Downloading subtitles"
	);

	// Ensure output directory exists
	if (!existsSync(outputDir)) {
		await mkdir(outputDir, { recursive: true });
		logger.debug({ outputDir }, "Created output directory");
	}

	if (!fileId) {
		throw new Error("No file ID found for subtitles");
	}

	const downloadInfo: DownloadResponse = await client.download({
		file_id: fileId,
	});

	if (!downloadInfo.link) {
		throw new Error("Failed to get download link");
	}

	// Download the subtitles file using native fetch
	const response = await fetch(downloadInfo.link);

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	const buffer = await response.arrayBuffer();
	const fileName = `${release?.replace(/[/\\?%*:|"<>]/g, "-") || "subtitles"}.srt`;
	const filePath = path.join(outputDir, fileName);

	await writeFile(filePath, Buffer.from(buffer));
	logger.info({ filePath, size: buffer.byteLength }, "✅ Downloaded subtitles");

	return filePath;
}

/**
 * Translate entire subtitles file content with progress tracking
 */
async function translateSubtitlesFile(
	model: GoogleGenAI,
	inputPath: string,
	outputPath: string,
	sourceLanguage: string,
	targetLanguage: string,
	llmLogger: LLMLogger
): Promise<string> {
	logger.info(
		{
			inputPath,
			outputPath,
			sourceLanguage,
			targetLanguage,
		},
		"🌐 Starting subtitles file translation"
	);

	// Read the entire SRT content
	const srtContent = await readFile(inputPath, "utf8");
	const totalSegments = countSRTSegments(srtContent);

	logger.info(
		{
			contentLength: srtContent.length,
			lines: srtContent.split("\n").length,
			totalSegments,
		},
		"📄 Loaded SRT content for translation"
	);

	logger.info("🚀 Translating subtitles content");

	try {
		// Translate the entire SRT content with progress tracking
		const translatedContent = await translateSRTContent(
			model,
			srtContent,
			sourceLanguage,
			targetLanguage,
			logger,
			llmLogger,
			(progress) => {
				logger.info(
					{
						progress: `${progress.percentage}%`,
						completed: progress.completed,
						total: progress.total,
					},
					"🔄 Translation progress"
				);
			}
		);

		// Write translated subtitles file
		await writeFile(outputPath, translatedContent, "utf8");
		logger.info(
			{
				outputPath,
				translatedLength: translatedContent.length,
				finalSegments: countSRTSegments(translatedContent),
			},
			"✅ Translated subtitles saved"
		);

		return outputPath;
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
			},
			"❌ Translation failed"
		);
		throw error;
	}
}

/**
 * Main processing pipeline for search and download
 */
async function processSubtitlesFromSearch(
	config: Config,
	query: string,
	llmLogger: LLMLogger,
	outputPath?: string
): Promise<{ original: string; translated: string }> {
	logger.info(
		{
			query,
			sourceLanguage: config.sourceLanguage,
			targetLanguage: config.targetLanguage,
		},
		"🚀 Starting subtitles search and translation pipeline"
	);

	// Initialize clients
	const opensubtitlesClient = await createOpenSubtitlesClient(config);
	const geminiModel = createGeminiModel(config.geminiApiKey);

	// Search for subtitles
	const results = await searchSubtitles(opensubtitlesClient, query, config.sourceLanguage);

	// Use the first result (best match)
	const bestMatch = results[0];
	if (!bestMatch) {
		throw new Error("No subtitles found");
	}

	const attributes = bestMatch.attributes;

	logger.info(
		{
			release: attributes?.release,
			rating: attributes?.ratings,
			downloads: attributes?.download_count,
			language: attributes?.language,
		},
		"📺 Selected subtitles"
	);

	// Download subtitles
	const downloadedPath = await downloadSubtitles(opensubtitlesClient, bestMatch);

	// Create output path for translated subtitles
	const translatedPath =
		outputPath || generateDefaultOutputPath(downloadedPath, config.targetLanguage);

	// Translate subtitles
	await translateSubtitlesFile(
		geminiModel,
		downloadedPath,
		translatedPath,
		config.sourceLanguage,
		config.targetLanguage,
		llmLogger
	);

	return {
		original: downloadedPath,
		translated: translatedPath,
	};
}

/**
 * Main processing pipeline for local file translation
 */
async function processSubtitlesFromFile(
	config: Config,
	inputPath: string,
	llmLogger: LLMLogger,
	outputPath?: string
): Promise<{ original: string; translated: string }> {
	logger.info(
		{
			inputPath,
			sourceLanguage: config.sourceLanguage,
			targetLanguage: config.targetLanguage,
		},
		"🚀 Starting local file translation pipeline"
	);

	// Check if input file exists
	if (!existsSync(inputPath)) {
		throw new Error(`Input file does not exist: ${inputPath}`);
	}

	// Initialize Gemini model
	const geminiModel = createGeminiModel(config.geminiApiKey);

	// Create output path for translated subtitles
	const translatedPath = outputPath || generateDefaultOutputPath(inputPath, config.targetLanguage);

	// Translate subtitles
	await translateSubtitlesFile(
		geminiModel,
		inputPath,
		translatedPath,
		config.sourceLanguage,
		config.targetLanguage,
		llmLogger
	);

	return {
		original: inputPath,
		translated: translatedPath,
	};
}

/**
 * Generate default output path for translated subtitles
 */
function generateDefaultOutputPath(inputPath: string, targetLanguage: string): string {
	const dir = path.dirname(inputPath);
	const baseName = path.basename(inputPath, path.extname(inputPath));
	return path.join(dir, `${baseName}_${targetLanguage}.srt`);
}

/**
 * Validate required environment variables
 */
function validateEnvironment(requiredVars: string[]): void {
	const missingVars = requiredVars.filter((varName) => !process.env[varName]);

	if (missingVars.length > 0) {
		throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
	}
}

/**
 * Parse command line arguments
 */
function parseArguments(): CLIArgs {
	return yargs(hideBin(process.argv))
		.scriptName("subtitles-translate")
		.usage("🎬 Subtitles Translator\n\nUsage: $0 [options]")
		.option("search", {
			alias: "s",
			type: "string",
			description: "Search for subtitles by movie/TV show name",
		})
		.option("input", {
			alias: "i",
			type: "string",
			description: "Path to local SRT subtitles file to translate",
		})
		.option("output", {
			alias: "o",
			type: "string",
			description:
				"Output path for translated subtitles file (optional, auto-generated if not provided)",
		})
		.option("target-language", {
			alias: "t",
			type: "string",
			default: "cs",
			description: "Target language code for translation",
		})
		.option("source-language", {
			type: "string",
			default: "en",
			description: "Source language code of the subtitles",
		})
		.check((argv) => {
			if (!argv.search && !argv.input) {
				throw new Error("Either --search or --input must be provided");
			}
			if (argv.search && argv.input) {
				throw new Error("Cannot use both --search and --input at the same time");
			}
			return true;
		})
		.example('$0 --search "The Matrix"', "Search and translate The Matrix subtitles")
		.example("$0 --input ./movie.srt --target-language es", "Translate local SRT file to Spanish")
		.example(
			'$0 -s "Breaking Bad S01E01" -t fr -o ./translated.srt',
			"Search Breaking Bad and save to specific file"
		)
		.help()
		.alias("help", "h")
		.parseSync() as CLIArgs;
}

/**
 * Display environment setup information
 */
function showEnvironmentInfo(): void {
	logger.info(`
Environment Variables (create .env file):
  OPENSUBTITLES_API_KEY - Your OpenSubtitles API key (get from opensubtitles.com/consumers)
  OPENSUBTITLES_USERNAME - Your OpenSubtitles username
  OPENSUBTITLES_PASSWORD - Your OpenSubtitles password
  GEMINI_API_KEY - Your Google Gemini API key
  LOG_LEVEL - Logging level (default: info, options: trace, debug, info, warn, error, fatal)

Language Codes:
  en - English    es - Spanish    fr - French     de - German
  it - Italian    pt - Portuguese ru - Russian    ja - Japanese
  ko - Korean     zh - Chinese    ar - Arabic     hi - Hindi
  cs - Czech      pl - Polish     sv - Swedish    da - Danish
    `);
}

/**
 * Create configuration from environment variables and CLI args
 */
function createConfig(args: CLIArgs): Config {
	return {
		opensubtitlesApiKey: process.env.OPENSUBTITLES_API_KEY || "",
		opensubtitlesUsername: process.env.OPENSUBTITLES_USERNAME || "",
		opensubtitlesPassword: process.env.OPENSUBTITLES_PASSWORD || "",
		geminiApiKey: process.env.GEMINI_API_KEY || "",
		targetLanguage: args.targetLanguage,
		sourceLanguage: args.sourceLanguage,
	};
}

/**
 * Main function
 */
async function main(): Promise<void> {
	try {
		// Parse command line arguments
		const args = parseArguments();

		logger.info(
			{
				search: args.search,
				input: args.input,
				output: args.output,
				targetLanguage: args.targetLanguage,
				sourceLanguage: args.sourceLanguage,
			},
			"🚀 Starting subtitles translation"
		);

		logger.debug(
			{
				nodeVersion: process.version,
				platform: process.platform,
				arch: process.arch,
				nodeEnv: process.env.NODE_ENV,
				logLevel: process.env.LOG_LEVEL || "info",
			},
			"Environment information"
		);

		// Validate environment variables
		const requiredEnvVars = ["GEMINI_API_KEY"];

		// Only require OpenSubtitles credentials if searching
		if (args.search) {
			requiredEnvVars.push(
				"OPENSUBTITLES_API_KEY",
				"OPENSUBTITLES_USERNAME",
				"OPENSUBTITLES_PASSWORD"
			);
		}

		validateEnvironment(requiredEnvVars);

		const config = createConfig(args);

		// Initialize LLM logger
		const llmLogger = initializeLLMLogger(logger);

		let result: { original: string; translated: string };

		if (args.search) {
			// Search and download subtitles
			result = await processSubtitlesFromSearch(config, args.search, llmLogger, args.output);
		} else if (args.input) {
			// Translate local file
			result = await processSubtitlesFromFile(config, args.input, llmLogger, args.output);
		} else {
			throw new Error("Either --search or --input must be provided");
		}

		logger.info("\n🎉 Translation completed successfully!");
		logger.info(`📄 Original subtitles: ${result.original}`);
		logger.info(`🌐 Translated subtitles: ${result.translated}`);
	} catch (error) {
		logger.error(
			{
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
			`💥 Error occurred`
		);

		if (
			error instanceof Error &&
			error.message.includes("Missing required environment variables")
		) {
			logger.error("Please create a .env file with the required variables.");
			showEnvironmentInfo();
		}

		process.exit(1);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await main();
}
