import assert from "node:assert";
import { describe, test } from "node:test";
import type { SRTSegment } from "./srt.ts";
import { createTranscript, parseTranslatedTranscript } from "./transcript.ts";

describe("Transcript Module", () => {
	describe("createTranscript", () => {
		test("should convert segments to transcript entries", () => {
			const segments: SRTSegment[] = [
				{
					sequence: 1,
					startTime: "00:00:01,000",
					endTime: "00:00:04,000",
					text: "Hello, how are you today?",
				},
				{
					sequence: 2,
					startTime: "00:00:05,000",
					endTime: "00:00:08,000",
					text: "I'm doing well, thank you.\nHow about you?",
				},
			];

			const transcript = createTranscript(segments);

			assert.strictEqual(transcript.length, 2);
			assert.strictEqual(transcript[0]?.number, 1);
			assert.strictEqual(transcript[0]?.text, "Hello, how are you today?");
			assert.strictEqual(transcript[1]?.number, 2);
			assert.strictEqual(
				transcript[1]?.text,
				"I'm doing well, thank you.\nHow about you?",
			);
		});

		test("should handle empty segments array", () => {
			const transcript = createTranscript([]);
			assert.strictEqual(transcript.length, 0);
		});

		test("should preserve special formatting in text", () => {
			const segments: SRTSegment[] = [
				{
					sequence: 1,
					startTime: "00:00:01,000",
					endTime: "00:00:03,000",
					text: "<i>Italic</i> and {\\an8}positioned",
				},
			];

			const transcript = createTranscript(segments);
			assert.strictEqual(
				transcript[0]?.text,
				"<i>Italic</i> and {\\an8}positioned",
			);
		});

		test("should preserve non-sequential sequence numbers", () => {
			const segments: SRTSegment[] = [
				{
					sequence: 5,
					startTime: "00:00:01,000",
					endTime: "00:00:03,000",
					text: "First",
				},
				{
					sequence: 10,
					startTime: "00:00:04,000",
					endTime: "00:00:06,000",
					text: "Second",
				},
			];

			const transcript = createTranscript(segments);
			assert.strictEqual(transcript[0]?.number, 5);
			assert.strictEqual(transcript[1]?.number, 10);
		});
	});

	describe("parseTranslatedTranscript", () => {
		test("should parse valid translated transcript", () => {
			const translatedText = `1: Translated first line
2: Translated second line
3: Translated third line`;

			const entries = parseTranslatedTranscript(translatedText);
			assert.strictEqual(entries.length, 3);
			assert.strictEqual(entries[0]?.number, 1);
			assert.strictEqual(entries[0]?.text, "Translated first line");
			assert.strictEqual(entries[1]?.number, 2);
			assert.strictEqual(entries[1]?.text, "Translated second line");
		});

		test("should handle multiline text entries", () => {
			const translatedText = `1: First line
Second line of same entry
2: Another entry`;

			const entries = parseTranslatedTranscript(translatedText);
			assert.strictEqual(entries.length, 2);
			assert.strictEqual(entries[0]?.number, 1);
			assert.strictEqual(entries[0]?.text, "First line");
			assert.strictEqual(entries[1]?.number, 2);
			assert.strictEqual(entries[1]?.text, "Another entry");
		});

		test("should skip malformed lines", () => {
			const translatedText = `1: Valid entry
This line has no number
Invalid: format
2: Another valid entry
: No number
3: Final valid entry`;

			const entries = parseTranslatedTranscript(translatedText);
			assert.strictEqual(entries.length, 3);
			assert.strictEqual(entries[0]?.number, 1);
			assert.strictEqual(entries[1]?.number, 2);
			assert.strictEqual(entries[2]?.number, 3);
		});

		test("should handle empty input", () => {
			const entries = parseTranslatedTranscript("");
			assert.strictEqual(entries.length, 0);
		});

		test("should preserve special formatting in translated text", () => {
			const translatedText = `1: <i>Traducido</i> con formato
2: {\\an8}Texto posicionado`;

			const entries = parseTranslatedTranscript(translatedText);
			assert.strictEqual(entries[0]?.text, "<i>Traducido</i> con formato");
			assert.strictEqual(entries[1]?.text, "{\\an8}Texto posicionado");
		});

		test("should handle lines with multiple colons", () => {
			const translatedText = `1: Text with: colons in: the content
2: Another: entry`;

			const entries = parseTranslatedTranscript(translatedText);
			assert.strictEqual(entries.length, 2);
			assert.strictEqual(entries[0]?.text, "Text with: colons in: the content");
			assert.strictEqual(entries[1]?.text, "Another: entry");
		});

		test("should handle non-sequential numbers", () => {
			const translatedText = `5: First translation
10: Second translation
15: Third translation`;

			const entries = parseTranslatedTranscript(translatedText);
			assert.strictEqual(entries.length, 3);
			assert.strictEqual(entries[0]?.number, 5);
			assert.strictEqual(entries[1]?.number, 10);
			assert.strictEqual(entries[2]?.number, 15);
		});

		test("should handle whitespace around text", () => {
			const translatedText = `1:   Text with leading spaces
2: Text with trailing spaces
3:	Tab characters around text	`;

			const entries = parseTranslatedTranscript(translatedText);
			assert.strictEqual(entries.length, 3);
			assert.strictEqual(entries[0]?.text, "Text with leading spaces");
			assert.strictEqual(entries[1]?.text, "Text with trailing spaces");
			assert.strictEqual(entries[2]?.text, "Tab characters around text");
		});
	});
});
