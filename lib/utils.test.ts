import assert from "node:assert";
import { describe, test } from "node:test";
import { parseTimestamp } from "./utils.ts";

describe("Utils Module", () => {
	describe("parseTimestamp", () => {
		test("should parse basic SRT timestamp format", () => {
			const timestamp = "00:01:23,456";
			const result = parseTimestamp(timestamp);

			// 0 hours + 1 minute (60000ms) + 23 seconds (23000ms) + 456 milliseconds
			const expected = 0 * 3600000 + 1 * 60000 + 23 * 1000 + 456;
			assert.strictEqual(result, expected);
		});

		test("should parse timestamp with hours", () => {
			const timestamp = "01:30:45,789";
			const result = parseTimestamp(timestamp);

			// 1 hour + 30 minutes + 45 seconds + 789 milliseconds
			const expected = 1 * 3600000 + 30 * 60000 + 45 * 1000 + 789;
			assert.strictEqual(result, expected);
		});

		test("should parse zero timestamp", () => {
			const timestamp = "00:00:00,000";
			const result = parseTimestamp(timestamp);
			assert.strictEqual(result, 0);
		});

		test("should parse maximum values", () => {
			const timestamp = "23:59:59,999";
			const result = parseTimestamp(timestamp);

			// 23 hours + 59 minutes + 59 seconds + 999 milliseconds
			const expected = 23 * 3600000 + 59 * 60000 + 59 * 1000 + 999;
			assert.strictEqual(result, expected);
		});

		test("should return 0 for invalid timestamp format", () => {
			const invalidTimestamps = [
				"invalid",
				"1:2:3,4",
				"01:02:03.456",
				"",
				"01:02:03",
				"01:02:03,",
				"01:02:,456",
				"01::03,456",
			];

			for (const timestamp of invalidTimestamps) {
				const result = parseTimestamp(timestamp);
				assert.strictEqual(result, 0, `Should return 0 for: ${timestamp}`);
			}
		});

		test("should handle edge case milliseconds", () => {
			const timestamp1 = "00:00:01,001";
			const result1 = parseTimestamp(timestamp1);
			assert.strictEqual(result1, 1001);

			const timestamp2 = "00:00:01,100";
			const result2 = parseTimestamp(timestamp2);
			assert.strictEqual(result2, 1100);
		});

		test("should parse timestamp with leading zeros", () => {
			const timestamp = "00:00:01,001";
			const result = parseTimestamp(timestamp);
			assert.strictEqual(result, 1001);
		});

		test("should calculate time differences correctly", () => {
			const start = "00:00:01,000";
			const end = "00:00:04,500";

			const startMs = parseTimestamp(start);
			const endMs = parseTimestamp(end);
			const duration = endMs - startMs;

			assert.strictEqual(duration, 3500); // 3.5 seconds
		});

		test("should handle various hour values", () => {
			const timestamps = [
				{ input: "00:00:00,000", expected: 0 },
				{ input: "01:00:00,000", expected: 3600000 }, // 1 hour
				{ input: "02:00:00,000", expected: 7200000 }, // 2 hours
				{ input: "10:00:00,000", expected: 36000000 }, // 10 hours
			];

			for (const { input, expected } of timestamps) {
				const result = parseTimestamp(input);
				assert.strictEqual(result, expected, `Failed for timestamp: ${input}`);
			}
		});

		test("should handle various minute values", () => {
			const timestamps = [
				{ input: "00:00:00,000", expected: 0 },
				{ input: "00:01:00,000", expected: 60000 }, // 1 minute
				{ input: "00:30:00,000", expected: 1800000 }, // 30 minutes
				{ input: "00:59:00,000", expected: 3540000 }, // 59 minutes
			];

			for (const { input, expected } of timestamps) {
				const result = parseTimestamp(input);
				assert.strictEqual(result, expected, `Failed for timestamp: ${input}`);
			}
		});

		test("should handle various second values", () => {
			const timestamps = [
				{ input: "00:00:00,000", expected: 0 },
				{ input: "00:00:01,000", expected: 1000 }, // 1 second
				{ input: "00:00:30,000", expected: 30000 }, // 30 seconds
				{ input: "00:00:59,000", expected: 59000 }, // 59 seconds
			];

			for (const { input, expected } of timestamps) {
				const result = parseTimestamp(input);
				assert.strictEqual(result, expected, `Failed for timestamp: ${input}`);
			}
		});

		test("should handle various millisecond values", () => {
			const timestamps = [
				{ input: "00:00:00,000", expected: 0 },
				{ input: "00:00:00,001", expected: 1 },
				{ input: "00:00:00,100", expected: 100 },
				{ input: "00:00:00,500", expected: 500 },
				{ input: "00:00:00,999", expected: 999 },
			];

			for (const { input, expected } of timestamps) {
				const result = parseTimestamp(input);
				assert.strictEqual(result, expected, `Failed for timestamp: ${input}`);
			}
		});
	});
});
