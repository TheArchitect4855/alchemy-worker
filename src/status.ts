export const enum HttpStatus {
	// OK
	OK = 200,
	// Client Errors
	BadRequest = 400,
	Unauthorized = 401,
	Forbidden = 403,
	NotFound = 404,
	MethodNotAllowed = 405,
	PayloadTooLarge = 413,
	UnprocessableEntity = 422,
	// Server Errors
	InternalServerError = 500,
	NotImplemented = 501,
	ServiceUnavailable = 503,
}

export function statusToString(status: HttpStatus): string {
	switch (status) {
		case HttpStatus.OK:
			return '200 OK';
		case HttpStatus.BadRequest:
			return '400 Bad Request';
		case HttpStatus.Unauthorized:
			return '401 Unauthorized';
		case HttpStatus.Forbidden:
			return '403 Forbidden';
		case HttpStatus.NotFound:
			return '404 Not Found';
		case HttpStatus.MethodNotAllowed:
			return '405 Method Not Allowed';
		case HttpStatus.PayloadTooLarge:
			return '413 Payload Too Large';
		case HttpStatus.UnprocessableEntity:
			return '422 Unprocessable Entity';
		case HttpStatus.InternalServerError:
			return '500 Internal Server Error';
		case HttpStatus.NotImplemented:
			return '501 Not Implemented';
		case HttpStatus.ServiceUnavailable:
			return '503 Service Unavailable';
	}
}
