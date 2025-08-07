import assert from "node:assert";
import { describe, test } from "node:test";
import {
	countSRTSegments,
	createSRTLikeFormat,
	parseSRTContent,
	parseSRTLikeFormat,
	reconstructSRT,
} from "./srt.ts";
import { createTranscript, parseTranslatedTranscript, type TranscriptEntry } from "./transcript.ts";
import { validateTranslation } from "./validation.ts";

describe("Integration Tests", () => {
	const sampleSRT = `1
00:00:01,000 --> 00:00:04,000
Hello, how are you today?

2
00:00:05,000 --> 00:00:08,000
I'm doing well, thank you.
How about you?

3
00:00:09,000 --> 00:00:12,000
Pretty good, thanks for asking.

4
00:00:13,000 --> 00:00:16,000
That's great to hear!

5
00:00:17,000 --> 00:00:20,000
See you later!`;

	test("should handle complete workflow", () => {
		const originalSRT = sampleSRT;
		const segments = parseSRTContent(originalSRT);
		const transcript = createTranscript(segments);

		const simulatedTranslation = transcript
			.map((entry) => `${entry.number}: TRANSLATED: ${entry.text}`)
			.join("\n");

		const translatedEntries = parseTranslatedTranscript(simulatedTranslation);
		validateTranslation(segments, translatedEntries);
		const reconstructed = reconstructSRT(segments, translatedEntries);
		const finalSegments = parseSRTContent(reconstructed);

		assert.strictEqual(finalSegments.length, segments.length);
		assert.strictEqual(finalSegments[0]?.startTime, segments[0]?.startTime);
		assert.strictEqual(finalSegments[0]?.endTime, segments[0]?.endTime);
		assert(finalSegments[0]?.text.includes("TRANSLATED:"));
	});

	test("should preserve complex formatting through full workflow", () => {
		const complexSRT = `1
00:00:01,000 --> 00:00:03,000
<i>Complex</i> {\\an8}formatting
with <b>multiple</b> lines

2
00:00:04,000 --> 00:00:06,000
Another segment`;

		const segments = parseSRTContent(complexSRT);
		const translatedEntries: TranscriptEntry[] = [
			{
				number: 1,
				text: "<i>Complejo</i> {\\an8}formato\ncon <b>múltiples</b> líneas",
			},
			{ number: 2, text: "Otro segmento" },
		];

		validateTranslation(segments, translatedEntries);
		const reconstructed = reconstructSRT(segments, translatedEntries);

		assert(reconstructed.includes("<i>Complejo</i>"));
		assert(reconstructed.includes("{\\an8}formato"));
		assert(reconstructed.includes("<b>múltiples</b>"));
	});

	test("should handle edge case with single segment", () => {
		const singleSRT = `1
00:00:01,000 --> 00:00:03,000
Single segment`;

		const segments = parseSRTContent(singleSRT);
		const translatedEntries: TranscriptEntry[] = [{ number: 1, text: "Segmento único" }];

		validateTranslation(segments, translatedEntries);
		const reconstructed = reconstructSRT(segments, translatedEntries);
		const finalSegments = parseSRTContent(reconstructed);

		assert.strictEqual(finalSegments.length, 1);
		assert.strictEqual(finalSegments[0]?.text, "Segmento único");
	});

	test("should handle large SRT files efficiently", () => {
		const largeSRT = Array.from({ length: 100 }, (_, i) => {
			const seq = i + 1;
			const start = `00:${String(Math.floor(seq / 60)).padStart(2, "0")}:${String(seq % 60).padStart(2, "0")},000`;
			const end = `00:${String(Math.floor((seq + 1) / 60)).padStart(2, "0")}:${String((seq + 1) % 60).padStart(2, "0")},000`;
			return `${seq}\n${start} --> ${end}\nText ${seq}`;
		}).join("\n\n");

		const segments = parseSRTContent(largeSRT);
		assert.strictEqual(segments.length, 100);

		const transcript = createTranscript(segments);
		const translatedEntries = transcript.map((entry) => ({
			number: entry.number,
			text: `Translated ${entry.text}`,
		}));

		validateTranslation(segments, translatedEntries);
		const reconstructed = reconstructSRT(segments, translatedEntries);
		const finalSegments = parseSRTContent(reconstructed);

		assert.strictEqual(finalSegments.length, 100);
		assert.strictEqual(finalSegments[0]?.text, "Translated Text 1");
		assert.strictEqual(finalSegments[99]?.text, "Translated Text 100");
	});

	test("should round-trip through SRT-like format correctly", () => {
		const originalSegments = parseSRTContent(sampleSRT).slice(0, 3);

		// Convert to SRT-like format
		const srtLikeText = createSRTLikeFormat(originalSegments);

		// Parse back from SRT-like format
		const parsedEntries = parseSRTLikeFormat(srtLikeText);

		// Should have same number of entries
		assert.strictEqual(parsedEntries.length, originalSegments.length);

		// Content should match
		for (let i = 0; i < originalSegments.length; i++) {
			const original = originalSegments[i];
			const parsed = parsedEntries[i];
			assert.strictEqual(parsed?.number, original?.sequence);
			assert.strictEqual(parsed?.text, original?.text);
		}
	});

	test("should maintain consistency across count and parsing", () => {
		const segments = parseSRTContent(sampleSRT);
		const count = countSRTSegments(sampleSRT);

		assert.strictEqual(segments.length, count);
		assert.strictEqual(count, 5);
	});

	test("should handle workflow with non-sequential segment numbers", () => {
		const nonSequentialSRT = `5
00:00:01,000 --> 00:00:03,000
First subtitle

10
00:00:04,000 --> 00:00:06,000
Second subtitle

15
00:00:07,000 --> 00:00:09,000
Third subtitle`;

		const segments = parseSRTContent(nonSequentialSRT);
		createTranscript(segments);

		const translatedEntries: TranscriptEntry[] = [
			{ number: 5, text: "Primer subtítulo" },
			{ number: 10, text: "Segundo subtítulo" },
			{ number: 15, text: "Tercer subtítulo" },
		];

		validateTranslation(segments, translatedEntries);
		const reconstructed = reconstructSRT(segments, translatedEntries);
		const finalSegments = parseSRTContent(reconstructed);

		assert.strictEqual(finalSegments.length, 3);
		assert.strictEqual(finalSegments[0]?.sequence, 5);
		assert.strictEqual(finalSegments[1]?.sequence, 10);
		assert.strictEqual(finalSegments[2]?.sequence, 15);
		assert.strictEqual(finalSegments[0]?.text, "Primer subtítulo");
	});

	test("should handle workflow with complex multiline subtitles", () => {
		const multilineSRT = `1
00:00:01,000 --> 00:00:05,000
Line one
Line two
Line three

2
00:00:06,000 --> 00:00:10,000
<i>Formatted line one</i>
<b>Formatted line two</b>`;

		const segments = parseSRTContent(multilineSRT);
		createTranscript(segments);

		const translatedEntries: TranscriptEntry[] = [
			{ number: 1, text: "Línea uno\nLínea dos\nLínea tres" },
			{
				number: 2,
				text: "<i>Línea formateada uno</i>\n<b>Línea formateada dos</b>",
			},
		];

		validateTranslation(segments, translatedEntries);
		const reconstructed = reconstructSRT(segments, translatedEntries);
		const finalSegments = parseSRTContent(reconstructed);

		assert.strictEqual(finalSegments.length, 2);
		assert.strictEqual(finalSegments[0]?.text, "Línea uno\nLínea dos\nLínea tres");
		assert.strictEqual(
			finalSegments[1]?.text,
			"<i>Línea formateada uno</i>\n<b>Línea formateada dos</b>"
		);
	});

	test("should preserve exact timing information through workflow", () => {
		const segments = parseSRTContent(sampleSRT);
		const originalTimings = segments.map((s) => ({
			sequence: s.sequence,
			startTime: s.startTime,
			endTime: s.endTime,
		}));

		const translatedEntries: TranscriptEntry[] = segments.map((s) => ({
			number: s.sequence,
			text: `Translated: ${s.text}`,
		}));

		const reconstructed = reconstructSRT(segments, translatedEntries);
		const finalSegments = parseSRTContent(reconstructed);

		// Timing should be preserved exactly
		for (let i = 0; i < segments.length; i++) {
			const original = originalTimings[i];
			const final = finalSegments[i];
			assert.strictEqual(final?.sequence, original?.sequence);
			assert.strictEqual(final?.startTime, original?.startTime);
			assert.strictEqual(final?.endTime, original?.endTime);
		}
	});

	test("should handle empty SRT gracefully", () => {
		const segments = parseSRTContent("");
		const transcript = createTranscript(segments);
		const translatedEntries: TranscriptEntry[] = [];

		validateTranslation(segments, translatedEntries);
		const reconstructed = reconstructSRT(segments, translatedEntries);
		const finalSegments = parseSRTContent(reconstructed);

		assert.strictEqual(segments.length, 0);
		assert.strictEqual(transcript.length, 0);
		assert.strictEqual(translatedEntries.length, 0);
		assert.strictEqual(finalSegments.length, 0);
		assert.strictEqual(reconstructed, "");
	});

	test("should detect and handle malformed segments consistently", () => {
		const malformedSRT = `1
00:00:01,000 --> 00:00:03,000
Valid segment

invalid
Not a timestamp
Invalid segment

3
00:00:07,000 --> 00:00:09,000
Another valid segment`;

		const segments = parseSRTContent(malformedSRT);
		const count = countSRTSegments(malformedSRT);

		// Both should identify the same number of valid segments
		assert.strictEqual(segments.length, count);
		assert.strictEqual(count, 2);
		assert.strictEqual(segments[0]?.sequence, 1);
		assert.strictEqual(segments[1]?.sequence, 3);
	});
});
