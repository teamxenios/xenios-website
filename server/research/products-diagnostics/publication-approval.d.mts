import type {Identity,SourceSnapshot,PublicContent,ApprovalEvidence} from './publication.mjs';
export interface ApprovalOwnerCapability {capabilityId:string;grantEventId:string;identity:Identity;actor:string;usage:'public_catalog_display';expiresAt:string;}
export interface RecordedApprovalSummary {approvalId:string;recordedDecision:'approved'|'revoked';approvalVersion:number;sourceSha256:string;mediaId:string;mediaVersion:number;mediaSha256:string;expiresAt:string|null;}
export interface ApprovalState {identity:Identity;approvalVersion:number;ownerCapability:ApprovalOwnerCapability|null;approvals:RecordedApprovalSummary[];historyTruncated:boolean;}
export interface ApprovalReceipt {operation:'approve'|'revoke';identity:Identity;approvalId:string;approvalVersion:number;decision:'approved'|'revoked';replayed:boolean;}
export interface ApprovalMediaDescriptor {identity:Identity;mediaId:string;mediaVersion:number;storageIdentitySha256:string;contentType:string;sizeBytes:number;}
export interface ApprovalCommand {identity:Identity;key:string;expectedApprovalVersion:number;}
export interface ApproveCommand extends ApprovalCommand {mediaId:string;sourceSha256:string;expectedMediaSha256:string;contentApprovalReference:string;rightsEvidenceReference:string;expiresAt:string|null;width:number;height:number;representation:'proposed_carton'|'proposed_vial'|'catalog_reference';packagingDesign:boolean;}
export interface RevokeCommand extends ApprovalCommand {approvalId:string;reason:string;}
export interface ApprovalStore {
  sourceSnapshot(identity:Identity,mediaId:string):Promise<SourceSnapshot|null>;
  approvalState(actor:string,identity:Identity):Promise<ApprovalState>;
  approvalReplay(actor:string,key:string,intent:Record<string,unknown>):Promise<ApprovalReceipt|null>;
  approvalDecide(actor:string,key:string,intent:Record<string,unknown>,mediaSha256:string|null):Promise<ApprovalReceipt>;
  approvalForSource(identity:Identity,sourceSha256:string,mediaId:string,mediaVersion:number):Promise<ApprovalEvidence|null>;
}
export interface ApprovalPorts<Context> {
  store:ApprovalStore;
  authorize(context:Context,operation:'approve'|'revoke'|'readApproval'|'previewApproval',identity:Identity):Promise<string|null>;
  assertBinding(identity:Identity):Promise<boolean>;isEligible(identity:Identity):Promise<boolean>;
  readApprovalMediaBytes?(descriptor:ApprovalMediaDescriptor):Promise<Uint8Array|null>;
  now?():number;
}
export function validateApprovalState(value:unknown,identity:Identity,actor:string):ApprovalState;
export function validateApprovalReceipt(value:unknown,intent:Record<string,unknown>):ApprovalReceipt;
export function createStoredApprovalResolver(store:Pick<ApprovalStore,'approvalForSource'>,options?:{now?:()=>number}):(input:{identity:Identity;snapshot:SourceSnapshot})=>Promise<ApprovalEvidence|null>;
export function createPublicationApprovalService<Context>(ports:ApprovalPorts<Context>):Readonly<{
  approve(context:Context,input:ApproveCommand):Promise<ApprovalReceipt>;
  revoke(context:Context,input:RevokeCommand):Promise<ApprovalReceipt>;
  readState(context:Context,input:{identity:Identity}):Promise<{identity:Identity;approvalVersion:number;ownerAuthorized:boolean;approvals:RecordedApprovalSummary[];historyTruncated:boolean}>;
  previewCandidate(context:Context,input:{identity:Identity;mediaId:string}):Promise<{identity:Identity;approvalVersion:number;sourceSha256:string;content:PublicContent;media:{mediaId:string;mediaVersion:number;altText:string;contentType:string;sizeBytes:number;sha256:string};ownerAuthorized:true}>;
}>;
