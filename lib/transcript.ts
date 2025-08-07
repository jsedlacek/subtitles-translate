import type { SRTSegment } from "./srt.ts";

export interface TranscriptEntry {
	number: number;
	text: string;
}

export function createTranscript(segments: SRTSegment[]): TranscriptEntry[] {
	return segments.map((segment) => ({
		number: segment.sequence,
		text: segment.text,
	}));
}

export function parseTranslatedTranscript(translatedText: string): TranscriptEntry[] {
	const entries: TranscriptEntry[] = [];
	const lines = translatedText.split("\n").filter((line) => line.trim().length > 0);

	for (const line of lines) {
		const match = line.match(/^(\d+):\s*(.+)$/);
		if (match?.[1] && match[2]) {
			const number = parseInt(match[1], 10);
			const text = match[2].trim();
			if (!Number.isNaN(number) && text) {
				entries.push({ number, text });
			}
		}
	}

	return entries;
}
