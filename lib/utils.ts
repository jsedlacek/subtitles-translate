export function parseTimestamp(timestamp: string): number {
	const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
	if (!match || match.length < 5) return 0;

	const hours = parseInt(match[1] ?? "0", 10);
	const minutes = parseInt(match[2] ?? "0", 10);
	const seconds = parseInt(match[3] ?? "0", 10);
	const milliseconds = parseInt(match[4] ?? "0", 10);

	return hours * 3600000 + minutes * 60000 + seconds * 1000 + milliseconds;
}
