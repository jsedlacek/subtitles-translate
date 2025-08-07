import assert from "node:assert";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { test } from "node:test";
import pino from "pino";
import { createLLMLogger, LLMLogger } from "./llm-logger.ts";

// Create a test logger that doesn't output to console
const testLogger = pino({ level: "silent" });

test("LLMLogger - basic request and response logging", async () => {
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
		3
	);

	assert.ok(requestId.startsWith("req_"));
	assert.ok(requestId.length > 10);

	await logger.logResponse(
		requestId,
		"gemini-2.5-flash",
		"Translated response content",
		1500,
		"en",
		"es",
		1,
		5,
		8
	);

	// Verify log files were created
	assert.ok(existsSync(testLogDir));

	const requestFile = `${testLogDir}/${requestId}_request.txt`;
	const responseFile = `${testLogDir}/${requestId}_response.txt`;

	assert.ok(existsSync(requestFile));
	assert.ok(existsSync(responseFile));

	// Read and verify request file content
	const requestContent = await readFile(requestFile, "utf8");
	assert.ok(requestContent.includes(`REQUEST_ID: ${requestId}`));
	assert.ok(requestContent.includes("MODEL: gemini-2.5-flash"));
	assert.ok(requestContent.includes("SOURCE_LANGUAGE: en"));
	assert.ok(requestContent.includes("TARGET_LANGUAGE: es"));
	assert.ok(requestContent.includes("CHUNK_INDEX: 1"));
	assert.ok(requestContent.includes("TOTAL_CHUNKS: 5"));
	assert.ok(requestContent.includes("SEGMENTS_TO_TRANSLATE: 10"));
	assert.ok(requestContent.includes("CONTEXT_SEGMENTS: 3"));
	assert.ok(requestContent.includes("=== PROMPT ==="));
	assert.ok(requestContent.includes("Test prompt for translation"));

	// Read and verify response file content
	const responseContent = await readFile(responseFile, "utf8");
	assert.ok(responseContent.includes(`REQUEST_ID: ${requestId}`));
	assert.ok(responseContent.includes("MODEL: gemini-2.5-flash"));
	assert.ok(responseContent.includes("SOURCE_LANGUAGE: en"));
	assert.ok(responseContent.includes("TARGET_LANGUAGE: es"));
	assert.ok(responseContent.includes("CHUNK_INDEX: 1"));
	assert.ok(responseContent.includes("TOTAL_CHUNKS: 5"));
	assert.ok(responseContent.includes("DURATION_MS: 1500"));
	assert.ok(responseContent.includes("TRANSLATED_SEGMENTS: 8"));
	assert.ok(responseContent.includes("=== RESPONSE ==="));
	assert.ok(responseContent.includes("Translated response content"));

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
		0
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
		1
	);

	// Verify log files were created
	const requestFile = `${testLogDir}/${requestId}_request.txt`;
	const errorFile = `${testLogDir}/${requestId}_error.txt`;

	assert.ok(existsSync(requestFile));
	assert.ok(existsSync(errorFile));

	// Read and verify error file content
	const errorContent = await readFile(errorFile, "utf8");
	assert.ok(errorContent.includes(`REQUEST_ID: ${requestId}`));
	assert.ok(errorContent.includes("MODEL: gemini-2.5-flash"));
	assert.ok(errorContent.includes("SOURCE_LANGUAGE: en"));
	assert.ok(errorContent.includes("TARGET_LANGUAGE: fr"));
	assert.ok(errorContent.includes("DURATION_MS: 2000"));
	assert.ok(errorContent.includes("=== ERROR ==="));
	assert.ok(errorContent.includes("MESSAGE: API rate limit exceeded"));
	assert.ok(errorContent.includes("=== ORIGINAL PROMPT ==="));
	assert.ok(errorContent.includes("Test prompt that will fail"));

	// Clean up
	await rm(testLogDir, { recursive: true });
});

test("LLMLogger - multiple requests create separate files", async () => {
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
			2
		);
		requestIds.push(requestId);

		await logger.logResponse(
			requestId,
			"gemini-2.5-flash",
			`Response ${i}`,
			1000 + i * 100,
			"en",
			"de",
			i,
			3,
			5
		);
	}

	// Verify all files were created
	const files = await readdir(testLogDir);
	assert.strictEqual(files.length, 6); // 3 requests + 3 responses

	// Verify each request/response pair
	for (let i = 0; i < 3; i++) {
		const requestId = requestIds[i]!;
		const requestFile = `${testLogDir}/${requestId}_request.txt`;
		const responseFile = `${testLogDir}/${requestId}_response.txt`;

		assert.ok(existsSync(requestFile));
		assert.ok(existsSync(responseFile));

		const requestContent = await readFile(requestFile, "utf8");
		const responseContent = await readFile(responseFile, "utf8");

		assert.ok(requestContent.includes(`Test prompt ${i}`));
		assert.ok(requestContent.includes(`CHUNK_INDEX: ${i}`));
		assert.ok(responseContent.includes(`Response ${i}`));
		assert.ok(responseContent.includes(`DURATION_MS: ${1000 + i * 100}`));
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
	const requestId = await logger.logRequest("gemini-2.5-flash", "Test prompt", "en", "es");

	await logger.logResponse(requestId, "gemini-2.5-flash", "Test response", 1000, "en", "es");

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
		const requestId = await logger.logRequest("gemini-2.5-flash", "Test prompt", "en", "es");
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

test("LLMLogger - handles optional parameters", async () => {
	const testLogDir = "./test-logs-optional";
	const logger = new LLMLogger(testLogger, testLogDir);

	// Clean up any existing test logs
	if (existsSync(testLogDir)) {
		await rm(testLogDir, { recursive: true });
	}

	// Log request with minimal parameters
	const requestId = await logger.logRequest("gemini-2.5-flash", "Minimal prompt", "en", "es");

	await logger.logResponse(requestId, "gemini-2.5-flash", "Minimal response", 500, "en", "es");

	// Verify files were created and contain N/A for optional fields
	const requestFile = `${testLogDir}/${requestId}_request.txt`;
	const responseFile = `${testLogDir}/${requestId}_response.txt`;

	assert.ok(existsSync(requestFile));
	assert.ok(existsSync(responseFile));

	const requestContent = await readFile(requestFile, "utf8");
	const responseContent = await readFile(responseFile, "utf8");

	assert.ok(requestContent.includes("CHUNK_INDEX: N/A"));
	assert.ok(requestContent.includes("TOTAL_CHUNKS: N/A"));
	assert.ok(requestContent.includes("SEGMENTS_TO_TRANSLATE: N/A"));
	assert.ok(requestContent.includes("CONTEXT_SEGMENTS: N/A"));

	assert.ok(responseContent.includes("CHUNK_INDEX: N/A"));
	assert.ok(responseContent.includes("TOTAL_CHUNKS: N/A"));
	assert.ok(responseContent.includes("TRANSLATED_SEGMENTS: N/A"));

	// Clean up
	await rm(testLogDir, { recursive: true });
});
