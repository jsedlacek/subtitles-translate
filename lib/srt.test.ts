import assert from "node:assert";
import { describe, test } from "node:test";
import {
	countSRTSegments,
	createSRTLikeFormat,
	parseSRTContent,
	parseSRTLikeFormat,
	reconstructSRT,
	type SRTSegment,
} from "./srt.ts";

describe("SRT Module", () => {
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

	const expectedSegments: SRTSegment[] = [
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
		{
			sequence: 3,
			startTime: "00:00:09,000",
			endTime: "00:00:12,000",
			text: "Pretty good, thanks for asking.",
		},
		{
			sequence: 4,
			startTime: "00:00:13,000",
			endTime: "00:00:16,000",
			text: "That's great to hear!",
		},
		{
			sequence: 5,
			startTime: "00:00:17,000",
			endTime: "00:00:20,000",
			text: "See you later!",
		},
	];

	describe("parseSRTContent", () => {
		test("should parse basic SRT content correctly", () => {
			const segments = parseSRTContent(sampleSRT);
			assert.strictEqual(segments.length, 5);
			assert.deepStrictEqual(segments, expectedSegments);
		});

		test("should handle SRT with special formatting", () => {
			const srtWithFormatting = `1
00:00:01,000 --> 00:00:03,000
<i>Italic text</i>

2
00:00:04,000 --> 00:00:06,000
{\\an8}Positioned text

3
00:00:07,000 --> 00:00:09,000
<b>Bold text</b> with normal text`;

			const segments = parseSRTContent(srtWithFormatting);
			assert.strictEqual(segments.length, 3);
			assert.strictEqual(segments[0]?.text, "<i>Italic text</i>");
			assert.strictEqual(segments[1]?.text, "{\\an8}Positioned text");
			assert.strictEqual(segments[2]?.text, "<b>Bold text</b> with normal text");
		});

		test("should handle empty lines and extra whitespace", () => {
			const messySRT = `1
00:00:01,000 --> 00:00:03,000
Text with extra spaces

2
00:00:04,000 --> 00:00:06,000
Another text`;

			const segments = parseSRTContent(messySRT);
			assert.strictEqual(segments.length, 2);
			assert.strictEqual(segments[0]?.sequence, 1);
			assert.strictEqual(segments[0]?.text, "Text with extra spaces");
			assert.strictEqual(segments[1]?.sequence, 2);
			assert.strictEqual(segments[1]?.text, "Another text");
		});

		test("should skip malformed segments", () => {
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
			assert.strictEqual(segments.length, 2);
			assert.strictEqual(segments[0]?.sequence, 1);
			assert.strictEqual(segments[1]?.sequence, 3);
		});

		test("should handle segments with no text", () => {
			const srtWithEmptySegment = `1
00:00:01,000 --> 00:00:03,000

2
00:00:04,000 --> 00:00:06,000
Valid text`;

			const segments = parseSRTContent(srtWithEmptySegment);
			assert.strictEqual(segments.length, 1);
			assert.strictEqual(segments[0]?.sequence, 2);
		});

		test("should return empty array for empty input", () => {
			const segments = parseSRTContent("");
			assert.strictEqual(segments.length, 0);
		});

		test("should handle complex multiline subtitles", () => {
			const complexSRT = `1
00:00:01,000 --> 00:00:05,000
Line one
Line two
Line three

2
00:00:06,000 --> 00:00:10,000
Single line

3
00:00:11,000 --> 00:00:15,000
<i>Formatted line one</i>
<b>Formatted line two</b>`;

			const segments = parseSRTContent(complexSRT);
			assert.strictEqual(segments.length, 3);
			assert.strictEqual(segments[0]?.text, "Line one\nLine two\nLine three");
			assert.strictEqual(segments[1]?.text, "Single line");
			assert.strictEqual(segments[2]?.text, "<i>Formatted line one</i>\n<b>Formatted line two</b>");
		});

		test("should handle non-sequential sequence numbers", () => {
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
			assert.strictEqual(segments.length, 3);
			assert.strictEqual(segments[0]?.sequence, 5);
			assert.strictEqual(segments[1]?.sequence, 10);
			assert.strictEqual(segments[2]?.sequence, 15);
		});
	});

	describe("reconstructSRT", () => {
		test("should reconstruct SRT from segments and translations", () => {
			const originalSegments = expectedSegments.slice(0, 2);
			const translatedEntries = [
				{ number: 1, text: "Bonjour, comment allez-vous aujourd'hui?" },
				{ number: 2, text: "Je vais bien, merci.\nEt vous?" },
			];

			const reconstructed = reconstructSRT(originalSegments, translatedEntries);
			const expectedSRT = `1
00:00:01,000 --> 00:00:04,000
Bonjour, comment allez-vous aujourd'hui?

2
00:00:05,000 --> 00:00:08,000
Je vais bien, merci.
Et vous?`;

			assert.strictEqual(reconstructed.trim(), expectedSRT.trim());
		});

		test("should preserve exact timing from original", () => {
			const originalSegments: SRTSegment[] = [
				{
					sequence: 1,
					startTime: "00:01:23,456",
					endTime: "00:01:27,789",
					text: "Original text",
				},
			];
			const translatedEntries = [{ number: 1, text: "Translated text" }];

			const reconstructed = reconstructSRT(originalSegments, translatedEntries);
			assert(reconstructed.includes("00:01:23,456 --> 00:01:27,789"));
		});

		test("should throw error for missing translation", () => {
			const originalSegments = expectedSegments.slice(0, 2);
			const translatedEntries = [{ number: 1, text: "Only first translation" }];

			assert.throws(
				() => reconstructSRT(originalSegments, translatedEntries),
				/Missing translation for segment 2/
			);
		});

		test("should handle empty arrays", () => {
			const reconstructed = reconstructSRT([], []);
			assert.strictEqual(reconstructed, "");
		});

		test("should preserve special formatting in reconstructed SRT", () => {
			const originalSegments: SRTSegment[] = [
				{
					sequence: 1,
					startTime: "00:00:01,000",
					endTime: "00:00:03,000",
					text: "Original",
				},
			];
			const translatedEntries = [{ number: 1, text: "<i>Italic</i> and {\\an8}positioned" }];

			const reconstructed = reconstructSRT(originalSegments, translatedEntries);
			assert(reconstructed.includes("<i>Italic</i> and {\\an8}positioned"));
		});

		test("should handle non-sequential segment numbers", () => {
			const originalSegments: SRTSegment[] = [
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
			const translatedEntries = [
				{ number: 5, text: "Premier" },
				{ number: 10, text: "Deuxième" },
			];

			const reconstructed = reconstructSRT(originalSegments, translatedEntries);
			assert(reconstructed.includes("5\n00:00:01,000 --> 00:00:03,000\nPremier"));
			assert(reconstructed.includes("10\n00:00:04,000 --> 00:00:06,000\nDeuxième"));
		});
	});

	describe("createSRTLikeFormat", () => {
		test("should create SRT-like format without timestamps", () => {
			const segments = expectedSegments.slice(0, 3);
			const srtLike = createSRTLikeFormat(segments);

			const expected = `1
Hello, how are you today?

2
I'm doing well, thank you.
How about you?

3
Pretty good, thanks for asking.`;

			assert.strictEqual(srtLike, expected);
		});

		test("should handle multi-line subtitle text", () => {
			const segments: SRTSegment[] = [
				{
					sequence: 1,
					startTime: "00:00:01,000",
					endTime: "00:00:03,000",
					text: "Line one\nLine two",
				},
			];

			const srtLike = createSRTLikeFormat(segments);
			assert.strictEqual(srtLike, "1\nLine one\nLine two");
		});

		test("should handle HTML formatting", () => {
			const segments: SRTSegment[] = [
				{
					sequence: 1,
					startTime: "00:00:01,000",
					endTime: "00:00:03,000",
					text: "<i>Italic</i> and <b>bold</b>",
				},
			];

			const srtLike = createSRTLikeFormat(segments);
			assert.strictEqual(srtLike, "1\n<i>Italic</i> and <b>bold</b>");
		});
	});

	describe("parseSRTLikeFormat", () => {
		test("should parse SRT-like format correctly", () => {
			const srtLikeText = `1
Hello, world

2
Multi-line
text here`;

			const entries = parseSRTLikeFormat(srtLikeText);
			assert.strictEqual(entries.length, 2);
			assert.strictEqual(entries[0]?.number, 1);
			assert.strictEqual(entries[0]?.text, "Hello, world");
			assert.strictEqual(entries[1]?.number, 2);
			assert.strictEqual(entries[1]?.text, "Multi-line\ntext here");
		});

		test("should handle multi-line subtitle text", () => {
			const srtLikeText = `1
Line one
Line two
Line three`;

			const entries = parseSRTLikeFormat(srtLikeText);
			assert.strictEqual(entries.length, 1);
			assert.strictEqual(entries[0]?.text, "Line one\nLine two\nLine three");
		});

		test("should handle HTML formatting", () => {
			const srtLikeText = `1
<i>Italic text</i>

2
<b>Bold</b> and normal`;

			const entries = parseSRTLikeFormat(srtLikeText);
			assert.strictEqual(entries[0]?.text, "<i>Italic text</i>");
			assert.strictEqual(entries[1]?.text, "<b>Bold</b> and normal");
		});

		test("should skip malformed blocks", () => {
			const srtLikeText = `1
Valid entry

not_a_number
Invalid entry

3
Another valid entry`;

			const entries = parseSRTLikeFormat(srtLikeText);
			assert.strictEqual(entries.length, 2);
			assert.strictEqual(entries[0]?.number, 1);
			assert.strictEqual(entries[1]?.number, 3);
		});

		test("should handle extra whitespace", () => {
			const srtLikeText = `  1
  Text with spaces

  2
  Another text  `;

			const entries = parseSRTLikeFormat(srtLikeText);
			assert.strictEqual(entries.length, 2);
			assert.strictEqual(entries[0]?.text, "Text with spaces");
			assert.strictEqual(entries[1]?.text, "Another text");
		});

		test("should return empty array for empty input", () => {
			const entries = parseSRTLikeFormat("");
			assert.strictEqual(entries.length, 0);
		});
	});

	describe("SRT-like format integration", () => {
		test("should round-trip through SRT-like format correctly", () => {
			const originalSegments = expectedSegments.slice(0, 3);

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
	});

	describe("countSRTSegments", () => {
		test("should count segments correctly", () => {
			assert.strictEqual(countSRTSegments(sampleSRT), 5);
		});

		test("should return 0 for empty content", () => {
			assert.strictEqual(countSRTSegments(""), 0);
		});

		test("should skip malformed segments in count", () => {
			const malformedSRT = `1
00:00:01,000 --> 00:00:03,000
Valid segment

invalid
Not a timestamp
Invalid segment

3
00:00:07,000 --> 00:00:09,000
Another valid segment`;

			assert.strictEqual(countSRTSegments(malformedSRT), 2);
		});
	});
});
