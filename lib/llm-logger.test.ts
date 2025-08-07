import assert from "node:assert";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import pino from "pino";
import { createLLMLogger, type LLMLogEntry, LLMLogger } from "./llm-logger.ts";

// Create a test logger that doesn't output to console
const testLogger = pino({ level: "silent" });

test("LLMLogger - basic functionality", async () => {
	const testLogDir = "./test-logs";
	const logger = new LLMLogger(testLogger, testLogDir);

	// Clean up any existing test logs
	if (existsSync(testLogDir)) {
		await rm(testLogDir, { recursive: true });
	}

	const requestId = await logger.logRequest(
		"gemini-2.5-flash",
		"Test prompt for translation",
		"en",
		"es",
		1,
		5,
		10,
		3,
	);

	assert.ok(requestId.startsWith("req_"));
	assert.ok(requestId.length > 10);

	await logger.logResponse(
		requestId,
		"gemini-2.5-flash",
		"Test prompt for translation",
		"Translated response content",
		1500,
		"en",
		"es",
		1,
		5,
		10,
		3,
		8,
		{ testMetadata: "value" },
	);

	// Verify log file was created
	const logFile = logger.getLogFile();
	assert.ok(existsSync(logFile));

	// Read and verify log content
	const logContent = await readFile(logFile, "utf8");
	const logLines = logContent.trim().split("\n");
	assert.strictEqual(logLines.length, 1);

	const logEntry: LLMLogEntry = JSON.parse(logLines[0]!);
	assert.strictEqual(logEntry.requestId, requestId);
	assert.strictEqual(logEntry.model, "gemini-2.5-flash");
	assert.strictEqual(logEntry.sourceLanguage, "en");
	assert.strictEqual(logEntry.targetLanguage, "es");
	assert.strictEqual(logEntry.chunkIndex, 1);
	assert.strictEqual(logEntry.totalChunks, 5);
	assert.strictEqual(logEntry.request.prompt, "Test prompt for translation");
	assert.strictEqual(logEntry.request.segmentsToTranslate, 10);
	assert.strictEqual(logEntry.request.contextSegments, 3);
	assert.strictEqual(logEntry.response.content, "Translated response content");
	assert.strictEqual(logEntry.response.duration, 1500);
	assert.strictEqual(logEntry.response.translatedSegments, 8);
	assert.ok(logEntry.timestamp);
	assert.deepStrictEqual(logEntry.metadata, { testMetadata: "value" });

	// Clean up
	await rm(testLogDir, { recursive: true });
});

test("LLMLogger - error logging", async () => {
	const testLogDir = "./test-logs-error";
	const logger = new LLMLogger(testLogger, testLogDir);

	// Clean up any existing test logs
	if (existsSync(testLogDir)) {
		await rm(testLogDir, { recursive: true });
	}

	const requestId = await logger.logRequest(
		"gemini-2.5-flash",
		"Test prompt that will fail",
		"en",
		"fr",
		0,
		1,
		5,
		0,
	);

	const testError = new Error("API rate limit exceeded");
	await logger.logError(
		requestId,
		"gemini-2.5-flash",
		"Test prompt that will fail",
		testError,
		2000,
		"en",
		"fr",
		0,
		1,
		{ errorContext: "test" },
	);

	// Verify log file was created
	const logFile = logger.getLogFile();
	assert.ok(existsSync(logFile));

	// Read and verify log content
	const logContent = await readFile(logFile, "utf8");
	const logLines = logContent.trim().split("\n");
	assert.strictEqual(logLines.length, 1);

	const logEntry = JSON.parse(logLines[0]!);
	assert.strictEqual(logEntry.requestId, requestId);
	assert.strictEqual(logEntry.model, "gemini-2.5-flash");
	assert.strictEqual(logEntry.sourceLanguage, "en");
	assert.strictEqual(logEntry.targetLanguage, "fr");
	assert.strictEqual(logEntry.request.prompt, "Test prompt that will fail");
	assert.strictEqual(logEntry.error.message, "API rate limit exceeded");
	assert.strictEqual(logEntry.error.duration, 2000);
	assert.ok(logEntry.error.stack);
	assert.deepStrictEqual(logEntry.metadata, { errorContext: "test" });

	// Clean up
	await rm(testLogDir, { recursive: true });
});

test("LLMLogger - multiple requests", async () => {
	const testLogDir = "./test-logs-multiple";
	const logger = new LLMLogger(testLogger, testLogDir);

	// Clean up any existing test logs
	if (existsSync(testLogDir)) {
		await rm(testLogDir, { recursive: true });
	}

	// Log multiple requests
	const requestIds: string[] = [];
	for (let i = 0; i < 3; i++) {
		const requestId = await logger.logRequest(
			"gemini-2.5-flash",
			`Test prompt ${i}`,
			"en",
			"de",
			i,
			3,
			5,
			2,
		);
		requestIds.push(requestId);

		await logger.logResponse(
			requestId,
			"gemini-2.5-flash",
			`Test prompt ${i}`,
			`Response ${i}`,
			1000 + i * 100,
			"en",
			"de",
			i,
			3,
			5,
			2,
			5,
		);
	}

	// Verify log file was created
	const logFile = logger.getLogFile();
	assert.ok(existsSync(logFile));

	// Read and verify log content
	const logContent = await readFile(logFile, "utf8");
	const logLines = logContent.trim().split("\n");
	assert.strictEqual(logLines.length, 3);

	// Verify each log entry
	for (let i = 0; i < 3; i++) {
		const logEntry: LLMLogEntry = JSON.parse(logLines[i]!);
		assert.strictEqual(logEntry.requestId, requestIds[i]);
		assert.strictEqual(logEntry.chunkIndex, i);
		assert.strictEqual(logEntry.request.prompt, `Test prompt ${i}`);
		assert.strictEqual(logEntry.response.content, `Response ${i}`);
		assert.strictEqual(logEntry.response.duration, 1000 + i * 100);
	}

	// Clean up
	await rm(testLogDir, { recursive: true });
});

test("LLMLogger - singleton pattern", () => {
	const logger1 = createLLMLogger(testLogger, "./test-singleton-1");
	const logger2 = createLLMLogger(testLogger, "./test-singleton-2");

	// Should return the same instance (singleton)
	assert.strictEqual(logger1, logger2);

	// The log directory should be from the first creation
	assert.strictEqual(logger1.getLogDirectory(), "./test-singleton-1");
	assert.strictEqual(logger2.getLogDirectory(), "./test-singleton-1");
});

test("LLMLogger - date-based log files", () => {
	const testLogDir = "./test-logs-date";
	const logger = new LLMLogger(testLogger, testLogDir);

	const logFile = logger.getLogFile();
	const expectedDate = new Date().toISOString().split("T")[0];
	const expectedFileName = `llm-requests-${expectedDate}.jsonl`;

	assert.ok(logFile.endsWith(expectedFileName));
	assert.strictEqual(path.basename(logFile), expectedFileName);
});

test("LLMLogger - directory creation", async () => {
	const testLogDir = "./test-logs-create";

	// Ensure directory doesn't exist
	if (existsSync(testLogDir)) {
		await rm(testLogDir, { recursive: true });
	}

	const logger = new LLMLogger(testLogger, testLogDir);

	// Directory shouldn't exist yet
	assert.ok(!existsSync(testLogDir));

	// Log something to trigger directory creation
	const requestId = await logger.logRequest(
		"gemini-2.5-flash",
		"Test prompt",
		"en",
		"es",
	);

	await logger.logResponse(
		requestId,
		"gemini-2.5-flash",
		"Test prompt",
		"Test response",
		1000,
		"en",
		"es",
	);

	// Directory should now exist
	assert.ok(existsSync(testLogDir));

	// Clean up
	await rm(testLogDir, { recursive: true });
});

test("LLMLogger - request ID generation", async () => {
	const logger = new LLMLogger(testLogger, "./test-logs-reqid");

	const requestIds = new Set<string>();

	// Generate multiple request IDs
	for (let i = 0; i < 100; i++) {
		const requestId = await logger.logRequest(
			"gemini-2.5-flash",
			"Test prompt",
			"en",
			"es",
		);
		requestIds.add(requestId);
	}

	// All should be unique
	assert.strictEqual(requestIds.size, 100);

	// All should start with "req_"
	for (const requestId of requestIds) {
		assert.ok(requestId.startsWith("req_"));
		assert.ok(requestId.length > 10);
	}
});
