import { z } from "zod";
import RequestData from "../../lib/RequestData";

const putSchema = z.object({
	token: z.string(),
});

type Put = z.infer<typeof putSchema>;

export async function put(req: RequestData): Promise<void> {
	const body = await req.getBody<Put>(putSchema);
	const contact = await req.getContact();

	const db = req.env.cachedDatabase;
	await db.notificationConfigUpdate(contact.id, body.token);
}
