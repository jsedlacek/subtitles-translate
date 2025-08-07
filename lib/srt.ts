export interface SRTSegment {
	sequence: number;
	startTime: string;
	endTime: string;
	text: string;
}

export function parseSRTContent(srtContent: string): SRTSegment[] {
	const segments: SRTSegment[] = [];
	const blocks = srtContent
		.split(/\n\s*\n/)
		.filter((block) => block.trim().length > 0);

	for (const block of blocks) {
		const lines = block.trim().split("\n");
		if (lines.length < 3) continue;

		const firstLine = lines[0];
		const secondLine = lines[1];
		if (!firstLine || !secondLine) continue;

		const sequence = parseInt(firstLine.trim(), 10);
		if (Number.isNaN(sequence)) continue;

		const timeMatch = secondLine.match(
			/^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})$/,
		);
		if (!timeMatch || !timeMatch[1] || !timeMatch[2]) continue;

		const text = lines.slice(2).join("\n").trim();

		segments.push({
			sequence,
			startTime: timeMatch[1],
			endTime: timeMatch[2],
			text,
		});
	}

	return segments;
}

export function reconstructSRT(
	originalSegments: SRTSegment[],
	translatedEntries: { number: number; text: string }[],
): string {
	const translatedMap = new Map<number, string>();

	for (const entry of translatedEntries) {
		translatedMap.set(entry.number, entry.text);
	}

	const reconstructedSegments: string[] = [];

	for (const segment of originalSegments) {
		const translatedText = translatedMap.get(segment.sequence);
		if (!translatedText) {
			throw new Error(
				`Missing translation for segment ${segment.sequence}. Original text was: "${segment.text}"`,
			);
		}

		const srtBlock = [
			segment.sequence.toString(),
			`${segment.startTime} --> ${segment.endTime}`,
			translatedText,
			"",
		].join("\n");

		reconstructedSegments.push(srtBlock);
	}

	return reconstructedSegments.join("\n").trim();
}

export function createSRTLikeFormat(segments: SRTSegment[]): string {
	return segments
		.map((segment) => `${segment.sequence}\n${segment.text}`)
		.join("\n\n");
}

export function parseSRTLikeFormat(
	srtLikeText: string,
): { number: number; text: string }[] {
	const entries: { number: number; text: string }[] = [];
	const blocks = srtLikeText
		.split(/\n\s*\n/)
		.filter((block) => block.trim().length > 0);

	for (const block of blocks) {
		const lines = block.trim().split("\n");
		if (lines.length < 2) continue;

		const firstLine = lines[0];
		if (!firstLine) continue;

		const sequence = parseInt(firstLine.trim(), 10);
		if (Number.isNaN(sequence)) continue;

		const text = lines.slice(1).join("\n").trim();
		if (text) {
			entries.push({
				number: sequence,
				text,
			});
		}
	}

	return entries;
}

export function countSRTSegments(srtContent: string): number {
	return parseSRTContent(srtContent).length;
}
