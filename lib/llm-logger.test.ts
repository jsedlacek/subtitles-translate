import assert from "node:assert";
import { test } from "node:test";
import pino from "pino";
import { LLMLogger } from "./llm-logger.ts";
import type { LogWriter } from "./log-writer.ts";

class TestLogWriter implements LogWriter {
	public logs: Map<string, string> = new Map();

	async write(fileName: string, content: string): Promise<void> {
		this.logs.set(fileName, content);
		return Promise.resolve();
	}

	clear() {
		this.logs.clear();
	}

	get(fileName: string): string | undefined {
		return this.logs.get(fileName);
	}
}

const testLogger = pino({ level: "silent" });

test("LLMLogger - basic request and response logging", async () => {
	const writer = new TestLogWriter();
	const logger = new LLMLogger(testLogger, writer);

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

	const requestFile = `${requestId}_request.txt`;
	const responseFile = `${requestId}_response.txt`;

	assert.ok(writer.get(requestFile));
	assert.ok(writer.get(responseFile));

	const requestContent = writer.get(requestFile)!;
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

	const responseContent = writer.get(responseFile)!;
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
});

test("LLMLogger - error logging", async () => {
	const writer = new TestLogWriter();
	const logger = new LLMLogger(testLogger, writer);

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

	const requestFile = `${requestId}_request.txt`;
	const errorFile = `${requestId}_error.txt`;

	assert.ok(writer.get(requestFile));
	assert.ok(writer.get(errorFile));

	const errorContent = writer.get(errorFile)!;
	assert.ok(errorContent.includes(`REQUEST_ID: ${requestId}`));
	assert.ok(errorContent.includes("MODEL: gemini-2.5-flash"));
	assert.ok(errorContent.includes("SOURCE_LANGUAGE: en"));
	assert.ok(errorContent.includes("TARGET_LANGUAGE: fr"));
	assert.ok(errorContent.includes("DURATION_MS: 2000"));
	assert.ok(errorContent.includes("=== ERROR ==="));
	assert.ok(errorContent.includes("MESSAGE: API rate limit exceeded"));
	assert.ok(errorContent.includes("=== ORIGINAL PROMPT ==="));
	assert.ok(errorContent.includes("Test prompt that will fail"));
});

test("LLMLogger - multiple requests create separate logs", async () => {
	const writer = new TestLogWriter();
	const logger = new LLMLogger(testLogger, writer);

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

	assert.strictEqual(writer.logs.size, 6);

	for (let i = 0; i < 3; i++) {
		const requestId = requestIds[i]!;
		const requestFile = `${requestId}_request.txt`;
		const responseFile = `${requestId}_response.txt`;

		const requestContent = writer.get(requestFile)!;
		const responseContent = writer.get(responseFile)!;

		assert.ok(requestContent.includes(`Test prompt ${i}`));
		assert.ok(requestContent.includes(`CHUNK_INDEX: ${i}`));
		assert.ok(responseContent.includes(`Response ${i}`));
		assert.ok(responseContent.includes(`DURATION_MS: ${1000 + i * 100}`));
	}
});

test("LLMLogger - handles optional parameters", async () => {
	const writer = new TestLogWriter();
	const logger = new LLMLogger(testLogger, writer);

	const requestId = await logger.logRequest("gemini-2.5-flash", "Minimal prompt", "en", "es");

	await logger.logResponse(requestId, "gemini-2.5-flash", "Minimal response", 500, "en", "es");

	const requestFile = `${requestId}_request.txt`;
	const responseFile = `${requestId}_response.txt`;

	assert.ok(writer.get(requestFile));
	assert.ok(writer.get(responseFile));

	const requestContent = writer.get(requestFile)!;
	const responseContent = writer.get(responseFile)!;

	assert.ok(requestContent.includes("CHUNK_INDEX: N/A"));
	assert.ok(requestContent.includes("TOTAL_CHUNKS: N/A"));
	assert.ok(requestContent.includes("SEGMENTS_TO_TRANSLATE: N/A"));
	assert.ok(requestContent.includes("CONTEXT_SEGMENTS: N/A"));

	assert.ok(responseContent.includes("CHUNK_INDEX: N/A"));
	assert.ok(responseContent.includes("TOTAL_CHUNKS: N/A"));
	assert.ok(responseContent.includes("TRANSLATED_SEGMENTS: N/A"));
});
