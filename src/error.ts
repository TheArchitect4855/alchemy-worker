import { HttpStatus, statusToString } from "./status";

export default class RequestError {
	readonly status: HttpStatus;
	readonly message: string | null;

	constructor(status: HttpStatus, message: string | null = null) {
		this.status = status;
		this.message = message;
	}

	toString(): string {
		if (this.message == null) return statusToString(this.status);
		else return `${statusToString(this.status)}: ${this.message}`;
	}
}
