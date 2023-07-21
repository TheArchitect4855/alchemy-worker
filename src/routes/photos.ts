import { BinaryResponse } from "..";
import RequestError from "../error";
import Database from "../lib/Database";
import RequestData from "../lib/RequestData";
import { HttpStatus } from "../status";

const maxPhotoCount = 10;
const maxPhotoSize = 1_500_000;

export async function get(req: RequestData): Promise<BinaryResponse> {
	const key = req.searchParams.get('key');
	if (key == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing key');

	const obj = await req.env.R2_PHOTOS.get(key);
	if (obj == null) throw new RequestError(HttpStatus.NotFound);

	return new BinaryResponse(obj.body, 'image');
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
