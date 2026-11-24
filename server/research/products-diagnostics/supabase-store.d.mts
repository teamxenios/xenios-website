import type {PublicationStore} from './publication.mjs';
export function createSupabasePublicationStore(client:{rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}):PublicationStore;
