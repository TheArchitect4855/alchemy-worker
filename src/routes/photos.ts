import RequestError from "../error";
import Database from "../lib/Database";
import RequestData from "../lib/RequestData";
import { HttpStatus } from "../status";

export const maxPhotoCount = 10;
const maxPhotoSize = 1_500_000;

export async function get(req: RequestData): Promise<Response> {
	const cachedPhoto = await caches.default.match(req.url);
	if (cachedPhoto) {
		console.log('CACHE HIT');
		return cachedPhoto;
	}

	const key = req.searchParams.get('key');
	if (key == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing key');

	let cacheResponse: Response;
	let response: Response;
	const obj = await req.env.R2_PHOTOS.get(key);
	if (obj == null) {
		cacheResponse = response = new Response(null, { status: HttpStatus.NotFound });
	} else {
		const init = {
			headers: {
				'Content-Type': 'image',
			}
		};

		const [ left, right ] = obj.body.tee();
		cacheResponse = new Response(left, init);
		response = new Response(right, init);
	}

	cacheResponse.headers.set('Cache-Control', 'public,max-age=86400,must-revalidate,immutable');
	await caches.default.put(req.url, cacheResponse);
	console.dir('CACHE MISS');
	return response;
}

export async function post(req: RequestData): Promise<{ url: string }> {
	if (!req.getHeader('Content-Type')?.startsWith('image/')) throw new RequestError(HttpStatus.UnprocessableEntity, 'Only images can be uploaded as photos');

	const contact = await req.getContact();
	const db = await Database.getCachedInterface(req.env);
	const profile = await db.profileGet(contact.id);
	if (profile == null) throw new RequestError(HttpStatus.Forbidden, 'Contact has no profile');
	if (profile.photoUrls.length >= maxPhotoCount) throw new RequestError(HttpStatus.Forbidden, 'Maximum photos reached');

	const key = await req.uploadBody(req.env.R2_PHOTOS, maxPhotoSize);
	const url = getUrl(req.url, key);
	await db.photoAdd(contact.id, url, contact.dob);
	db.close(req.ctx);

	return { url };
}

export async function del(req: RequestData): Promise<void> {
	const key = req.searchParams.get('key');
	if (key == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing key');

	const contact = await req.getContact();
	const db = await Database.getCachedInterface(req.env);
	const profile = await db.profileGet(contact.id);
	if (profile == null) throw new RequestError(HttpStatus.Forbidden, 'Contact has no profile');

	const url = getUrl(req.url, key);
	await db.photoRemove(contact.id, url, contact.dob);
	db.close(req.ctx);
	await req.env.R2_PHOTOS.delete([ key ]);
}

function getUrl(url: URL, key: string): string {
	return `${url.origin}/photos?key=${key}`;
}
