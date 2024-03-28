import RequestError from "../error";
import Database from "../lib/Database";
import Location from "../lib/Location";
import RequestData from "../lib/RequestData";
import { PhoneGreenlist } from "../lib/database/types";
import { HttpStatus } from "../status";

type Availability = {
	available: boolean,
};

const availableAt = [
	{
		radiusKm: 15,
		location: new Location(49.914260257149905, -119.44164689962854),
	}
];

export async function get(req: RequestData): Promise<Availability> {
	const lat = req.searchParams.get('lat');
	const lon = req.searchParams.get('lon');
	if (lat == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing lat');
	if (lon == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing lon');

	const latitude = parseFloat(lat);
	const longitude = parseFloat(lon);
	if (isNaN(latitude)) throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid latitude');
	if (isNaN(longitude)) throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid longitude');

	try {
		const phone = await req.getPhone();
		if (phone === req.env.DEBUG_PHONE) return { available: true }; // Always allow debug user

		const isGreenlisted = await isPhoneGreenlisted(phone, req.env.KV_CACHE, req.env.rawDatabase);
		if (isGreenlisted) return { available: true };
	} catch(e: unknown) {
		// No problem
		console.error(e);
	}

	const available = availableAt.some((e) => e.location.distanceToKm(latitude, longitude) <= e.radiusKm);
	return { available };
}

async function isPhoneGreenlisted(phone: string, cache: KVNamespace, db: Database): Promise<boolean> {
	let greenlist: PhoneGreenlist[];
	const cached = await cache.get('phone-greenlist', 'json');
	if (cached == null) {
		greenlist = await db.phoneGreenlistGet();
		cache.put('phone-greenlist', JSON.stringify(greenlist), {
			expirationTtl: 3600,
		});
	} else greenlist = cached as PhoneGreenlist[];

	const index = greenlist.map((e) => e.phone).indexOf(phone);
	return index >= 0;
}
