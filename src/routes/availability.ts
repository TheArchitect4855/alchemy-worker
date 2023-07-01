import RequestError from "../error";
import Location from "../lib/Location";
import RequestData from "../lib/RequestData";
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

	const available = availableAt.some((e) => e.location.distanceToKm(latitude, longitude) <= e.radiusKm);
	return { available };
}
