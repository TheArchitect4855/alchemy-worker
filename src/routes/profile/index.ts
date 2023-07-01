import { z } from "zod";
import RequestData from "../../lib/RequestData";
import RequestError from "../../error";
import { HttpStatus } from "../../status";
import Database from "../../lib/Database";
import Location from "../../lib/Location";
import { Profile } from "../../lib/database/types";
import { DatabaseError, DatabaseErrorKind } from "../../lib/database/dbi";

const postSchema = z.object({
	name: z.string().min(1, 'name must not be blank').max(128, 'name must be < 128 characters'),
	bio: z.string().max(1024, 'bio must be < 1024 characters'),
	gender: z.string().min(1, 'gender must not be blank').max(16, 'gender must be < 16 characters'),
	isTransgender: z.boolean(),
	photoUrls: z.array(z.string().url('photo URLs must be URLs')),
	relationshipInterests: z.array(z.enum([ 'flings', 'friends', 'romance' ])).min(1, 'must include a relationship interest'),
	neurodiversities: z.array(z.string().min(1, 'cannot include blank neurodiversities').max(32, 'neurodiviersities must be < 32 characters')),
	interests: z.array(z.string().min(1, 'cannot include blank interests').max(32, 'interests must be < 32 characters')),
	pronouns: z.string().max(32, 'pronouns must be < 32 characters').nullable(),
	locLat: z.number().gte(-360).lte(360),
	locLon: z.number().gte(-360).lte(360),
	locName: z.string().max(32),
});

type Post = z.infer<typeof postSchema>;

const putSchema = z.object({
	name: z.string().min(1, 'name must not be blank').max(128, 'name must be < 128 characters'),
	bio: z.string().max(1024, 'bio must be < 1024 characters'),
	gender: z.string().min(1, 'gender must not be blank').max(16, 'gender must be < 16 characters'),
	relationshipInterests: z.array(z.enum([ 'flings', 'friends', 'romance' ])).min(1, 'must include a relationship interest'),
	neurodiversities: z.array(z.string().min(1, 'cannot include blank neurodiversities').max(32, 'neurodiviersities must be < 32 characters')),
	interests: z.array(z.string().min(1, 'cannot include blank interests').max(32, 'interests must be < 32 characters')),
	pronouns: z.string().max(32, 'pronouns must be < 32 characters').nullable(),
});

type Put = z.infer<typeof putSchema>;

export async function post(req: RequestData): Promise<Profile> {
	const body = await req.getBody<Post>(postSchema);
	const contact = await req.getContact();
	const db = await Database.getCachedInterface(req.env);
	try {
		const profile = await db.profileCreate(
			contact.id,
			body.name,
			contact.dob,
			body.bio,
			body.gender,
			body.isTransgender,
			body.photoUrls,
			body.relationshipInterests,
			body.neurodiversities,
			body.interests,
			body.pronouns,
			new Location(body.locLat, body.locLon),
			body.locName,
		);

		return profile;
	} catch (e: any) {
		if (e instanceof DatabaseError && e.kind == DatabaseErrorKind.DuplicateKey) {
			throw new RequestError(HttpStatus.Forbidden, 'Contact already has profile');
		}

		throw e;
	} finally {
		db.close(req.ctx);
	}

}

export async function get(req: RequestData): Promise<Profile> {
	const contact = await req.getContact();
	const db = await Database.getCachedInterface(req.env);
	const profile = await db.profileGet(contact.id);
	db.close(req.ctx);

	if (profile == null) throw new RequestError(HttpStatus.NotFound, 'No profile for contact');
	return profile;
}

export async function put(req: RequestData): Promise<Profile> {
	const contact = await req.getContact();
	const body = await req.getBody<Put>(putSchema);

	const db = await Database.getCachedInterface(req.env);
	let profile = await db.profileGet(contact.id);
	if (profile == null) throw new RequestError(HttpStatus.Forbidden, 'Contact has no profile');

	profile = await db.profileUpdate(
		contact.id,
		body.name,
		contact.dob,
		body.bio,
		body.gender,
		body.relationshipInterests,
		body.neurodiversities,
		body.interests,
		body.pronouns,
	);

	db.close(req.ctx);
	return profile;
}

export async function del(req: RequestData): Promise<void> {
	const contact = await req.getContact();
	const db = await Database.getCachedInterface(req.env);
	await db.profileDelete(contact.id);
	db.close(req.ctx);
}
