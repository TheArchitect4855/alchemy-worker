import RequestError from './error';
import RequestData from './lib/RequestData';
import routes from './routes';
import { HandlerFn } from './lib/request_types';
import { HttpStatus } from './status';

const origin = 'https://web.usealchemy.app';
type HeaderDict = { [header: string]: string };

export interface Env {
	DATABASE_URL: string,
	DEBUG_PHONE: string,
	FIREBASE_SERVICE_ACCOUNT: string,
	KV_CACHE: KVNamespace,
	R2_LOGS: R2Bucket,
	R2_PHOTOS: R2Bucket,
	JWT_KEY_HEX: string,
	LOG_SECRET_HEX: string,
	TWILIO_ACCT_SID: string,
	TWILIO_AUTH: string,
	TWILIO_VERIFY_SID: string,
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);
		if (request.method == 'OPTIONS') return new Response(null, {
			headers: getCorsHeaders(request.method, request.headers),
		});

		let pathname = url.pathname;
		if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.substring(0, pathname.length - 1);

		const headers = getCorsHeaders(request.method, request.headers);
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
			if (res instanceof Promise) return respondWith(await res, headers);
			else return respondWith(res, headers);
		} catch (e: any) {
			if (e instanceof RequestError) {
				return new Response(e.message, { headers, status: e.status });
			} else {
				const id = (Date.now() % 86_400_000).toString(16);
				console.log(`Internal server error ${id}: ${e}`);
				console.error(e);
				return new Response(id, { headers, status: 500 });
			}
		}
	},
};

function getCorsHeaders(method: string, headers: Headers): HeaderDict {
	let o: string;
	const requestOrigin = headers.get('origin');
	if (requestOrigin?.startsWith('http://localhost:')) o = requestOrigin;
	else o = origin;

	if (method == 'OPTIONS') return {
		'Access-Control-Allow-Credentials': 'true',
		'Access-Control-Allow-Headers': '*',
		'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
		'Access-Control-Allow-Origin': o,
		// 'Access-Control-Max-Age': '86400',
	};

	return { 'Access-Control-Allow-Origin': o };
}

function respondWith(body: any, headers: HeaderDict): Response {
	if (body === undefined) return new Response(null, { headers });
	if (body instanceof Response) {
		for (const k in headers) body.headers.set(k, headers[k]);
		return body;
	}

	return Response.json(body, {
		headers: {
			'Content-Type': 'application/json;charset=utf-8',
			...headers,
		},
	});
}
