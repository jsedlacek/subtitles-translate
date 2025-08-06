import assert from "node:assert";
import { describe, test } from "node:test";
import {
	countSRTSegments,
	createTranscript,
	parseSRTContent,
	parseTranslatedTranscript,
	reconstructSRT,
	type SRTSegment,
	type TranscriptEntry,
	validateTranslation,
} from "./lib.ts";

describe("Subtitle Translation Library", () => {
	const sampleSRT = `1
00:00:01,000 --> 00:00:03,500
Hello, how are you today?

2
00:00:04,000 --> 00:00:06,800
I'm doing well, thank you.
How about you?

3
00:00:07,500 --> 00:00:09,200
That's great to hear!

4
00:00:10,000 --> 00:00:12,300
Let's go to the park together.

5
00:00:13,000 --> 00:00:15,500
What a wonderful idea!
I love spending time outdoors.`;

	const expectedSegments: SRTSegment[] = [
		{
			sequence: 1,
			startTime: "00:00:01,000",
			endTime: "00:00:03,500",
			text: "Hello, how are you today?",
		},
		{
			sequence: 2,
			startTime: "00:00:04,000",
			endTime: "00:00:06,800",
			text: "I'm doing well, thank you.\nHow about you?",
		},
		{
			sequence: 3,
			startTime: "00:00:07,500",
			endTime: "00:00:09,200",
			text: "That's great to hear!",
		},
		{
			sequence: 4,
			startTime: "00:00:10,000",
			endTime: "00:00:12,300",
			text: "Let's go to the park together.",
		},
		{
			sequence: 5,
			startTime: "00:00:13,000",
			endTime: "00:00:15,500",
			text: "What a wonderful idea!\nI love spending time outdoors.",
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
			assert.strictEqual(
				segments[2]?.text,
				"<b>Bold text</b> with normal text",
			);
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
			assert.strictEqual(
				segments[2]?.text,
				"<i>Formatted line one</i>\n<b>Formatted line two</b>",
			);
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

	describe("createTranscript", () => {
		test("should convert segments to transcript entries", () => {
			const segments = parseSRTContent(sampleSRT);
			const transcript = createTranscript(segments);

			assert.strictEqual(transcript.length, 5);
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

	describe("reconstructSRT", () => {
		test("should reconstruct SRT from segments and translations", () => {
			const originalSegments = parseSRTContent(sampleSRT);
			const translatedEntries: TranscriptEntry[] = [
				{ number: 1, text: "Hola, ¿cómo estás hoy?" },
				{ number: 2, text: "Estoy bien, gracias.\n¿Y tú?" },
				{ number: 3, text: "¡Qué bueno escuchar eso!" },
				{ number: 4, text: "Vamos al parque juntos." },
				{
					number: 5,
					text: "¡Qué idea tan maravillosa!\nMe encanta pasar tiempo al aire libre.",
				},
			];

			const reconstructed = reconstructSRT(originalSegments, translatedEntries);
			const newSegments = parseSRTContent(reconstructed);

			assert.strictEqual(newSegments.length, 5);
			assert.strictEqual(newSegments[0]?.startTime, "00:00:01,000");
			assert.strictEqual(newSegments[0]?.endTime, "00:00:03,500");
			assert.strictEqual(newSegments[0]?.text, "Hola, ¿cómo estás hoy?");
			assert.strictEqual(newSegments[1]?.text, "Estoy bien, gracias.\n¿Y tú?");
		});

		test("should preserve exact timing from original", () => {
			const originalSegments: SRTSegment[] = [
				{
					sequence: 1,
					startTime: "00:01:23,456",
					endTime: "00:01:25,789",
					text: "Original text",
				},
			];
			const translatedEntries: TranscriptEntry[] = [
				{ number: 1, text: "Translated text" },
			];

			const reconstructed = reconstructSRT(originalSegments, translatedEntries);
			assert(reconstructed.includes("00:01:23,456 --> 00:01:25,789"));
			assert(reconstructed.includes("Translated text"));
		});

		test("should throw error for missing translation", () => {
			const originalSegments = parseSRTContent(sampleSRT);
			const incompleteTranslations: TranscriptEntry[] = [
				{ number: 1, text: "Only first translation" },
			];

			assert.throws(
				() => reconstructSRT(originalSegments, incompleteTranslations),
				/Missing translation for segment 2/,
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
					text: "<i>Original</i>",
				},
			];
			const translatedEntries: TranscriptEntry[] = [
				{ number: 1, text: "<i>Traducido</i>" },
			];

			const reconstructed = reconstructSRT(originalSegments, translatedEntries);
			assert(reconstructed.includes("<i>Traducido</i>"));
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
			const translatedEntries: TranscriptEntry[] = [
				{ number: 5, text: "Primero" },
				{ number: 10, text: "Segundo" },
			];

			const reconstructed = reconstructSRT(originalSegments, translatedEntries);
			const newSegments = parseSRTContent(reconstructed);

			assert.strictEqual(newSegments.length, 2);
			assert.strictEqual(newSegments[0]?.sequence, 5);
			assert.strictEqual(newSegments[0]?.text, "Primero");
			assert.strictEqual(newSegments[1]?.sequence, 10);
			assert.strictEqual(newSegments[1]?.text, "Segundo");
		});
	});

	describe("validateTranslation", () => {
		const originalSegments = parseSRTContent(sampleSRT);

		test("should pass for valid translation", () => {
			const validTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
				{ number: 3, text: "Translation 3" },
				{ number: 4, text: "Translation 4" },
				{ number: 5, text: "Translation 5" },
			];

			assert.doesNotThrow(() =>
				validateTranslation(originalSegments, validTranslation),
			);
		});

		test("should throw for missing segments", () => {
			const incompleteTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
			];

			assert.throws(
				() => validateTranslation(originalSegments, incompleteTranslation),
				/Segment count mismatch/,
			);
		});

		test("should throw for extra segments", () => {
			const extraTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 2, text: "Translation 2" },
				{ number: 3, text: "Translation 3" },
				{ number: 4, text: "Translation 4" },
				{ number: 5, text: "Translation 5" },
				{ number: 6, text: "Extra translation" },
			];

			assert.throws(
				() => validateTranslation(originalSegments, extraTranslation),
				/Segment count mismatch/,
			);
		});

		test("should throw for wrong segment numbers", () => {
			const wrongNumbersTranslation: TranscriptEntry[] = [
				{ number: 10, text: "Translation 1" },
				{ number: 20, text: "Translation 2" },
				{ number: 30, text: "Translation 3" },
				{ number: 40, text: "Translation 4" },
				{ number: 50, text: "Translation 5" },
			];

			assert.throws(
				() => validateTranslation(originalSegments, wrongNumbersTranslation),
				/Missing translations for segments: 1, 2, 3, 4, 5/,
			);
		});

		test("should throw for mixed missing and extra segments", () => {
			const mixedTranslation: TranscriptEntry[] = [
				{ number: 1, text: "Translation 1" },
				{ number: 3, text: "Translation 3" },
				{ number: 5, text: "Translation 5" },
				{ number: 99, text: "Extra translation" },
			];

			assert.throws(
				() => validateTranslation(originalSegments, mixedTranslation),
				/Segment count mismatch/,
			);
		});

		test("should handle empty arrays", () => {
			assert.doesNotThrow(() => validateTranslation([], []));
		});

		test("should validate non-sequential segment numbers", () => {
			const nonSequentialSegments: SRTSegment[] = [
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

			const validTranslation: TranscriptEntry[] = [
				{ number: 5, text: "Translation 1" },
				{ number: 10, text: "Translation 2" },
			];

			assert.doesNotThrow(() =>
				validateTranslation(nonSequentialSegments, validTranslation),
			);
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

	describe("Integration tests", () => {
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
			const translatedEntries: TranscriptEntry[] = [
				{ number: 1, text: "Segmento único" },
			];

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
	});
});
