import { z } from "zod";
import RequestData from "../../lib/RequestData";
import Database from "../../lib/Database";

const postSchema = z.object({
	contact: z.string().uuid(),
	reason: z.string().max(1024, 'report reason must be < 1024 characters'),
});

type Post = z.infer<typeof postSchema>;

export async function post(req: RequestData): Promise<void> {
	const contact = await req.getContact();
	const body = await req.getBody<Post>(postSchema);

	const db = await Database.getCachedInterface(req.env);
	await db.reportCreate(body.contact, body.reason, contact.id);
	db.close(req.ctx);
}
