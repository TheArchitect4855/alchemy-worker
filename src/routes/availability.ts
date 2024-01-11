import RequestData from "../lib/RequestData";

type Availability = {
	available: boolean,
};

export async function get(req: RequestData): Promise<Availability> {
	return { available: true };
}
