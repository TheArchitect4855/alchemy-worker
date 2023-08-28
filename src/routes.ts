import { HandlerModule } from './lib/request_types';
import * as exploreTs from './routes/explore';
import * as photosTs from './routes/photos';
import * as logsTs from './routes/logs';
import * as matchesTs from './routes/matches';
import * as waitinglistTs from './routes/waitinglist';
import * as profileReportTs from './routes/profile/report';
import * as profileIndexTs from './routes/profile/index';
import * as messagesIdTs from './routes/messages/id';
import * as messagesIndexTs from './routes/messages/index';
import * as availabilityTs from './routes/availability';
import * as versionsClientTs from './routes/versions/client';
import * as likesTs from './routes/likes';
import * as contactTs from './routes/contact';
import * as preferencesTs from './routes/preferences';
import * as loginUpdateTs from './routes/login/update';
import * as loginIndexTs from './routes/login/index';

const routes: { [pathname: string]: HandlerModule } = {
	'/explore': exploreTs,
	'/photos': photosTs,
	'/logs': logsTs,
	'/matches': matchesTs,
	'/waitinglist': waitinglistTs,
	'/profile/report': profileReportTs,
	'/profile': profileIndexTs,
	'/messages/id': messagesIdTs,
	'/messages': messagesIndexTs,
	'/availability': availabilityTs,
	'/versions/client': versionsClientTs,
	'/likes': likesTs,
	'/contact': contactTs,
	'/preferences': preferencesTs,
	'/login/update': loginUpdateTs,
	'/login': loginIndexTs,
};

export default routes;
