import Database from "../../lib/Database";
import RequestData from "../../lib/RequestData";

type GetResponse = {
	version: string,
	isUpdateRequired: boolean,
	releaseDate: string,
	downloads: {
		android: string,
		ios: string,
	},
};

export async function get(req: RequestData): Promise<GetResponse> {
	const db = await Database.getCachedInterface(req.env);
	const version = await db.clientVersionGetLatest();
	db.close(req.ctx);

	return {
		version: version.semver,
		isUpdateRequired: version.isUpdateRequired,
		releaseDate: version.createdAt.toISOString(),
		downloads: {
			android: 'https://play.google.com/store/apps/details?id=app.usealchemy.alchemy',
			ios: 'https://usealchemy.app',
		},
	};
}
