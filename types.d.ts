declare module "opensubtitles.com" {
	export interface OpenSubtitlesConfig {
		apikey: string;
		useragent: string;
	}

	export interface LoginParams {
		username: string;
		password: string;
	}

	export interface LoginResponse {
		token: string;
		user: unknown;
		status: number;
	}

	export interface SubtitleFile {
		file_id: number;
		cd_number: number;
		file_name: string;
	}

	export interface SubtitleAttributes {
		subtitle_id: string;
		language: string;
		download_count: number;
		new_download_count: number;
		hearing_impaired: boolean;
		hd: boolean;
		fps: number;
		votes: number;
		points: number;
		ratings: number;
		from_trusted: boolean;
		foreign_parts_only: boolean;
		ai_translated: boolean;
		machine_translated: boolean;
		upload_date: string;
		release: string;
		comments: string;
		legacy_subtitle_id: number;
		legacy_uploader_id: number;
		uploader: {
			uploader_id: number;
			name: string;
			rank: string;
		};
		feature_details: {
			feature_id: number;
			feature_type: string;
			year: number;
			title: string;
			movie_name: string;
			imdb_id: number;
			tmdb_id: number;
		};
		url: string;
		related_links: {
			label: string;
			url: string;
			img_url: string;
		}[];
		files: SubtitleFile[];
	}

	export interface SubtitleSearchResult {
		id: string;
		type: string;
		attributes: SubtitleAttributes;
	}

	export interface SearchResponse {
		total_pages: number;
		total_count: number;
		per_page: number;
		page: number;
		data: SubtitleSearchResult[];
	}

	export interface DownloadResponse {
		link: string;
		file_name: string;
		requests: number;
		remaining: number;
		message: string;
		reset_time: string;
		reset_time_utc: string;
	}

	export interface SearchParams {
		query?: string;
		languages?: string;
		limit?: number;
		episode_number?: number;
		season_number?: number;
		year?: number;
		imdb_id?: number;
		tmdb_id?: number;
		type?: "movie" | "episode";
		hearing_impaired?: "include" | "exclude" | "only";
		foreign_parts_only?: "include" | "exclude" | "only";
		machine_translated?: "include" | "exclude" | "only";
		ai_translated?: "include" | "exclude" | "only";
		trusted_sources?: "include" | "exclude" | "only";
		order_by?:
			| "language"
			| "download_count"
			| "new_download_count"
			| "hearing_impaired"
			| "hd"
			| "fps"
			| "votes"
			| "points"
			| "ratings"
			| "from_trusted"
			| "foreign_parts_only"
			| "ai_translated"
			| "machine_translated"
			| "upload_date";
		order_direction?: "asc" | "desc";
	}

	export interface DownloadParams {
		file_id: number;
	}

	export default class OpenSubtitles {
		constructor(config: OpenSubtitlesConfig);

		login(params: LoginParams): Promise<LoginResponse>;

		logout(): Promise<void>;

		subtitles(params: SearchParams): Promise<SearchResponse>;

		download(params: DownloadParams): Promise<DownloadResponse>;
	}
}
