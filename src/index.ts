import RequestError from './error';
import RequestData from './lib/RequestData';
import routes from './routes';
import { HandlerFn } from './lib/request_types';
import { HttpStatus } from './status';

export interface Env {
	DATABASE_URL: string,
	KV_CACHE: KVNamespace,
	R2_LOGS: R2Bucket,
	R2_PHOTOS: R2Bucket,
	JWT_KEY_HEX: string,
	LOG_SECRET_HEX: string,
	TWILIO_ACCT_SID: string,
	TWILIO_AUTH: string,
	TWILIO_VERIFY_SID: string,
}

export class BinaryResponse {
	readonly data: ReadableStream<any>;
	readonly mimeType: string;

	constructor(data: ReadableStream<any>, mimeType: string) {
		this.data = data;
		this.mimeType = mimeType;
	}
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);
		let pathname = url.pathname;
		if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.substring(0, pathname.length - 1);
		try {
			const handler = routes[pathname];
			if (handler == undefined) throw new RequestError(HttpStatus.NotFound);

			let fn: HandlerFn | undefined;
			switch (request.method) {
				case 'POST':
					fn = handler.post;
					break;
				case 'GET':
					fn = handler.get;
					break;
				case 'PUT':
					fn = handler.put;
					break;
				case 'DELETE':
					fn = handler.del;
					break;
				default:
					throw new RequestError(HttpStatus.MethodNotAllowed);
			}

			if (fn == undefined) throw new RequestError(HttpStatus.MethodNotAllowed, `${request.method} is not supported on this endpoint`);

			const res = fn(new RequestData(request, url, env, ctx));
			if (res instanceof Promise) return respondWith(await res);
			else return respondWith(res);
		} catch (e: any) {
			if (e instanceof RequestError) {
				const err = e as RequestError;
				return new Response(err.message, { status: err.status });
			} else {
				const id = (Date.now() % 86_400_000).toString(16);
				console.log(`Internal server error ${id}: ${e}`);
				console.error(e);
				return new Response(id, { status: 500 });
			}
		}
	},
};

function respondWith(body: any): Response {
	if (body === undefined) return new Response();
	if (body instanceof BinaryResponse) return new Response(body.data, {
		headers: {
			'Content-Type': body.mimeType,
		},
	});

	return Response.json(body, {
		headers: {
			'Content-Type': 'application/json;charset=utf-8',
		},
	});
}
