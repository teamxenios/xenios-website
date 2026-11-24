export interface Identity {
  offeringId: string; offeringVariantId: string; productId: string; variantId: string;
}
export interface PublicContent { summary: string; overview: string; storage?: string; }
export interface SourceSnapshot {
  identity: Identity; sourceSha256: string; contentSha256: string;
  productVersion: number; variantVersion: number; content: PublicContent;
  media: {id:string;version:number;altText:string;contentType:string;sizeBytes:number;storageIdentitySha256:string};
}
export type Representation = 'proposed_carton'|'proposed_vial'|'catalog_reference';
/** Resolved by a trusted existing server review/rights port, not HTTP input. */
export interface ApprovalEvidence {
  identity:Identity;sourceSha256:string;contentSha256:string;mediaId:string;mediaVersion:number;
  contentApprovalSha256:string;rightsApprovalSha256:string;mediaSha256:string;
  usage:'public_catalog_display';state:'approved';expiresAt:string|null;
  width:number;height:number;representation:Representation;packagingDesign:boolean;
}
export interface Revision { id:string;identity:Identity;snapshot:SourceSnapshot;evidence:ApprovalEvidence; }
export interface Command {
  identity:Identity;key:string;expectedGeneration:number;
}
export interface SealCommand extends Command {mediaId:string;sourceSha256:string;}
export interface PublishCommand extends Command {revisionId:string;}
export interface WithdrawCommand extends Command {reason:string;}
export interface RollbackCommand extends PublishCommand {reason:string;}
export interface Receipt {
  operation:'seal'|'publish'|'withdraw'|'rollback';revisionId:string|null;
  generation:number;identity:Identity;replayed:boolean;
}
export interface AssetSelection extends Identity {revisionId:string;assetId:string;}
export interface AssetDescriptor {
  identity:Identity;revisionId:string;generation:number;assetId:string;mediaId:string;mediaVersion:number;
  contentType:string;sizeBytes:number;sha256:string;width:number;height:number;rightsApprovalSha256:string;
}
export interface InternalAssetDescriptor extends AssetDescriptor {storageIdentitySha256:string;}
export interface AssetRead extends AssetDescriptor {bytes:Uint8Array;}
export interface PublishedRevision {
  revisionId:string;generation:number;identity:Identity;content:PublicContent;
  media:{primary:{href:string;altText:string;width:number;height:number};representation:Representation;packagingDesign:boolean};
  provenance:{contentSha256:string;mediaSha256:string;rightsApprovalSha256:string};
}
export interface PublicationStore {
  sourceSnapshot(identity:Identity,mediaId:string):Promise<SourceSnapshot|null>;
  replay(actor:string,key:string,intent:Record<string,unknown>):Promise<Receipt|null>;
  seal(actor:string,key:string,intent:Record<string,unknown>,evidence:ApprovalEvidence):Promise<Receipt>;
  transition(actor:string,key:string,intent:Record<string,unknown>):Promise<Receipt>;
  current(identity:Identity):Promise<{generation:number;revision:Revision|null}>;
  revision(identity:Identity,revisionId:string):Promise<Revision|null>;
}
export interface PublicationPorts<Context> {
  store:PublicationStore;
  authorize(context:Context,operation:'preview'|'seal'|'publish'|'withdraw'|'rollback',identity:Identity):Promise<string|null>;
  assertBinding(identity:Identity):Promise<boolean>;
  isEligible(identity:Identity):Promise<boolean>;
  resolveApproval(input:{identity:Identity;snapshot:SourceSnapshot}):Promise<ApprovalEvidence|null>;
  readMediaBytes?(descriptor:InternalAssetDescriptor):Promise<Uint8Array|null>;
  now?():number;
}
export class PublicationError extends Error {readonly code:string;constructor(code:string);}
export function validateCommandReceipt(value:unknown,intent:Record<string,unknown>):Receipt;
export function exactIdentity(value:unknown):Identity;
export function canonicalJson(value:unknown):string;
export function fingerprint(value:unknown):string;
export function createPublicationService<Context>(ports:PublicationPorts<Context>):Readonly<{
  previewCandidate(context:Context,selection:{identity:Identity;mediaId:string}):Promise<{identity:Identity;sourceSha256:string;content:PublicContent;media:{mediaId:string;altText:string;width:number;height:number;representation:Representation;packagingDesign:boolean};approvalAvailable:true}>;
  createApprovedRevision(context:Context,command:SealCommand):Promise<Receipt>;
  publish(context:Context,command:PublishCommand):Promise<Receipt>;
  withdraw(context:Context,command:WithdrawCommand):Promise<Receipt>;
  rollback(context:Context,command:RollbackCommand):Promise<Receipt>;
  readPublishedRevision(selection:Identity):Promise<PublishedRevision|null>;
  readPublishedAsset(selection:AssetSelection):Promise<AssetRead|null>;
}>;
