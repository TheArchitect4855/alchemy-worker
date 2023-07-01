import { z } from "zod";
import Database from "../lib/Database";
import RequestData from "../lib/RequestData";
import { DatabaseError, DatabaseErrorKind } from "../lib/database/dbi";

const postSchema = z.object({
	isoCountry: z.string().length(2),
	administrativeArea: z.string().max(128),
	locality: z.string().max(128),
});

type Post = z.infer<typeof postSchema>;

export async function post(req: RequestData): Promise<void> {
	const phone = await req.getPhone();
	const body = await req.getBody<Post>(postSchema);
	const db = await Database.getCachedInterface(req.env);
	try {
		await db.waitingListAdd(phone, body.isoCountry, body.administrativeArea, body.locality);
	} catch (e: any) {
		if (e instanceof DatabaseError && e.kind == DatabaseErrorKind.DuplicateKey) return;
		else throw e;
	} finally {
		db.close(req.ctx);
	}
}
