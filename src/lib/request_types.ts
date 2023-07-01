import RequestData from "./RequestData";

export type HandlerFn = (req: RequestData) => any;
export type HandlerModule = {
	post?: HandlerFn,
	get?: HandlerFn,
	put?: HandlerFn,
	del?: HandlerFn,
};