import type {Express,Request,Response,NextFunction} from 'express';
import type {Identity,PublicationStore,PublicationPorts} from './publication.mjs';
import {createPublicationService} from './publication.mjs';
import type {ApprovalStore,ApprovalMediaDescriptor} from './publication-approval.mjs';
import {createPublicationApprovalService} from './publication-approval.mjs';
export interface AdminPublicationState {
  identity:Identity;generation:number;currentRevisionId:string|null;
  revisions:readonly {revisionId:string;previouslyPublished:boolean}[];
  operations:readonly {operation:'seal'|'publish'|'withdraw'|'rollback';revisionId:string|null;generation:number;at:string}[];
  historyTruncated:boolean;
}
export interface PublicationAuthorityStore extends PublicationStore,ApprovalStore {adminState(actor:string,identity:Identity):Promise<AdminPublicationState>;}
export interface PublicationAuthorityPorts extends Omit<PublicationPorts<object>,'authorize'|'resolveApproval'|'store'> {store:PublicationAuthorityStore;readApprovalMediaBytes?(descriptor:ApprovalMediaDescriptor):Promise<Uint8Array|null>;}
export function validateAdminState(value:unknown,identity:Identity):AdminPublicationState;
export function createSupabasePublicationAuthorityStore(client:{rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}):PublicationAuthorityStore;
export function createProductControlPublicationAuthorityAdmin(input:{requireAdmin:(req:Request,res:Response,next:NextFunction)=>unknown;identityFor:(productId:string,variantId:string)=>Promise<Identity|null>;ports:PublicationAuthorityPorts;}):Readonly<{register(app:Express):void;service:ReturnType<typeof createPublicationService<object>>;approvalService:ReturnType<typeof createPublicationApprovalService<object>>}>;
