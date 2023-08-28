import RequestError from "../error";
import Database from "../lib/Database";
import Location from "../lib/Location";
import RequestData from "../lib/RequestData";
import { Profile } from "../lib/database/types";
import { HttpStatus } from "../status";

export async function get(req: RequestData): Promise<{ profiles: Profile[] }> {
	const lat = req.searchParams.get('lat');
	const lon = req.searchParams.get('lon');
	const locName = req.searchParams.get('locName');
	if (lat == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing lat');
	if (lon == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing lon');
	if (locName == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing locName');

	const latitude = parseInt(lat);
	const longitude = parseInt(lon);
	if (isNaN(latitude)) throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid lat');
	if (isNaN(longitude)) throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid lon');

	const contact = await req.getContact();
	const location = new Location(latitude, longitude);
	const conn = req.env.cachedDatabase;
	const profiles = await conn.exploreGetProfiles(contact.id, location, locName, 30_000); // TODO: Make distance a setting
	return { profiles };
}
