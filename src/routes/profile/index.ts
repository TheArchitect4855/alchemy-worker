import { z } from "zod";
import RequestData from "../../lib/RequestData";
import RequestError from "../../error";
import { HttpStatus } from "../../status";
import Database from "../../lib/Database";
import Location from "../../lib/Location";
import { Profile } from "../../lib/database/types";
import { DatabaseError, DatabaseErrorKind } from "../../lib/database/dbi";
import { maxPhotoCount } from "../photos";

const maxCount = 25;

const postSchema = z.object({
	name: z.string().min(1, 'name must not be blank').max(128, 'name must be < 128 characters'),
	bio: z.string().max(1024, 'bio must be < 1024 characters'),
	gender: z.string().min(1, 'gender must not be blank').max(16, 'gender must be < 16 characters'),
	isTransgender: z.boolean(),
	photoUrls: z.array(z.string().url('photo URLs must be URLs')).max(maxPhotoCount),
	relationshipInterests: z.array(z.enum(['flings', 'friends', 'romance'])).min(1, 'must include a relationship interest').max(3),
	neurodiversities: z.array(z.string().min(1, 'cannot include blank neurodiversities').max(32, 'neurodiviersities must be < 32 characters')).max(maxCount),
	interests: z.array(z.string().min(1, 'cannot include blank interests').max(32, 'interests must be < 32 characters')).max(maxCount),
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
	relationshipInterests: z.array(z.enum(['flings', 'friends', 'romance'])).min(1, 'must include a relationship interest').max(3),
	neurodiversities: z.array(z.string().min(1, 'cannot include blank neurodiversities').max(32, 'neurodiviersities must be < 32 characters')).max(maxCount),
	interests: z.array(z.string().min(1, 'cannot include blank interests').max(32, 'interests must be < 32 characters')).max(maxCount),
	pronouns: z.string().max(32, 'pronouns must be < 32 characters').nullable(),
});

type Put = z.infer<typeof putSchema>;

export async function post(req: RequestData): Promise<Profile> {
	const body = await req.getBody<Post>(postSchema);
	const contact = await req.getContact();
	const db = req.env.cachedDatabase;
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
	}
}

export async function get(req: RequestData): Promise<Profile> {
	const contact = await req.getContact();
	const db = req.env.cachedDatabase;
	const profile = await db.profileGet(contact.id);

	if (profile == null) throw new RequestError(HttpStatus.NotFound, 'No profile for contact');
	return profile;
}

export async function put(req: RequestData): Promise<Profile> {
	const contact = await req.getContact();
	const body = await req.getBody<Put>(putSchema);

	const db = req.env.cachedDatabase;
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

	return profile;
}

export async function del(req: RequestData): Promise<void> {
	const contact = await req.getContact();
	const db = req.env.cachedDatabase;
	await db.profileDelete(contact.id);
}
