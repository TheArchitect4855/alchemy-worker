import { z } from "zod";
import RequestData from "../../lib/RequestData";
import Database from "../../lib/Database";

const putSchema = z.object({
	fcmToken: z.string(),
});

type Put = z.infer<typeof putSchema>;

export async function put(req: RequestData): Promise<void> {
	const body = await req.getBody<Put>(putSchema);
	const contact = await req.getContact();

	const db = await Database.getCachedInterface(req.env);
	await db.notificationConfigUpdate(contact.id, body.fcmToken, []);
	db.close(req.ctx);
}
