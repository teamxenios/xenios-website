import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublishedCatalogAsset } from "./catalog-publication-asset";
import { verifyCatalogAssetBytes } from "./catalog-publication-asset";

/** Internal only; storage-key fingerprint is never part of public asset response. */
export type PrivateCatalogAssetDescriptor = Omit<PublishedCatalogAsset,"bytes"> & { readonly storageIdentitySha256: string };
/** Before approval: no revision, current-publication, byte/rights approval pin. */
export type ApprovalMediaDescriptor = Pick<PrivateCatalogAssetDescriptor,"identity"|"mediaId"|"mediaVersion"|"storageIdentitySha256"|"contentType"|"sizeBytes">;
type Db = Pick<SupabaseClient,"from"|"storage">;
const MEDIA_TABLE = "research_product_media";
const COLUMNS = "id,product_id,state,storage_key,version,content_type,size_bytes,approved_by,approved_at,updated_at";
const sha = (value: string) => createHash("sha256").update(value,"utf8").digest("hex");

/** Same existing Product Control service client and fixed server bucket; no URL creation. */
function createCanonicalMediaBytesReader<T extends ApprovalMediaDescriptor>(db: Db, mediaBucket: string, timeoutMs: number,
  verifyBytes: (input: T, bytes: Uint8Array) => boolean) {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(mediaBucket)) throw Error("PRIVATE_MEDIA_BUCKET_REQUIRED");
  if(!Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>5000)throw Error("PRIVATE_MEDIA_DEADLINE_REQUIRED");
  return async (input: T): Promise<Uint8Array|null> => {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(),timeoutMs);
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_,reject) => { onAbort=()=>reject(Error("PRIVATE_MEDIA_READ_DEADLINE"));controller.signal.addEventListener("abort",onAbort,{once:true}); });
    const bounded = <T>(promise: PromiseLike<T>): Promise<T> => Promise.race([Promise.resolve(promise),aborted]);
    let reader: ReadableStreamDefaultReader<Uint8Array>|undefined;
    try {
      if (!input || !/^[0-9a-f]{64}$/.test(input.storageIdentitySha256)
        || !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes<=0 || input.sizeBytes>10*1024*1024
        || !Number.isSafeInteger(input.mediaVersion) || input.mediaVersion<=0) return null;
      const readRow = async () => {
        const {data,error} = await bounded(db.from(MEDIA_TABLE).select(COLUMNS)
          .eq("id",input.mediaId).eq("product_id",input.identity.productId).abortSignal(controller.signal).maybeSingle());
        if (error || !data || data.id!==input.mediaId || data.product_id!==input.identity.productId
          || data.state!=="approved" || data.version!==input.mediaVersion
          || data.content_type!==input.contentType || data.size_bytes!==input.sizeBytes
          || typeof data.storage_key!=="string" || sha(data.storage_key)!==input.storageIdentitySha256
          || typeof data.approved_by!=="string" || !data.approved_by.trim()
          || typeof data.approved_at!=="string" || !Number.isFinite(Date.parse(data.approved_at))
          || typeof data.updated_at!=="string" || !Number.isFinite(Date.parse(data.updated_at))) return null;
        // Canonical Product Control upload key; resolve from the row, never from URL.
        const prefix=input.identity.productId+"/"+input.mediaId+"/", key=data.storage_key;
        const filename=key.slice(prefix.length);
        if (!key.startsWith(prefix) || !/^[A-Za-z0-9._-]{1,240}$/.test(filename) || filename==="." || filename==="..") return null;
        return {id:data.id,productId:data.product_id,version:data.version,key,
          contentType:data.content_type,sizeBytes:data.size_bytes,approvedBy:data.approved_by,
          approvedAt:data.approved_at,updatedAt:data.updated_at};
      };
      const privateBucket = async () => {
        const {data,error} = await bounded(db.storage.getBucket(mediaBucket));
        return !error && data?.id===mediaBucket && data.public===false;
      };
      const before=await readRow();if(!before || !await privateBucket())return null;
      const bucket=db.storage.from(mediaBucket);
      const {data:info,error:infoError}=await bounded(bucket.info(before.key));
      if(infoError || !info || info.size!==input.sizeBytes || info.contentType!==input.contentType)return null;
      // Pinned storage-js supports a stream on this same private download API.
      // Read at most declared<=10MiB and abort instead of buffering extra data.
      const {data:stream,error:downloadError}=await bounded(bucket.download(before.key,{},
        {cache:"no-store",signal:controller.signal}).asStream());
      if(downloadError || !stream)return null;
      reader=stream.getReader();const chunks:Buffer[]=[];let size=0;
      for(;;){const next=await bounded(reader.read());if(next.done)break;
        size+=next.value.byteLength;if(size>input.sizeBytes)throw Error("PRIVATE_MEDIA_BODY_BOUND");chunks.push(Buffer.from(next.value));}
      const bytes=Buffer.concat(chunks,size);
      if(!verifyBytes(input,bytes))return null;
      const after=await readRow();
      if(!after || JSON.stringify(before)!==JSON.stringify(after) || !await privateBucket())return null;
      // The publication owner rechecks exact pointer/generation/rights AFTER
      // this await; this adapter alone is not public publication authority.
      return bytes;
    } catch { return null; }
    finally {
      clearTimeout(deadline);
      controller.signal.removeEventListener("abort",onAbort);
      controller.abort();
      // Abort is the bounded transport cleanup; never await an untrusted cancel.
      if(reader)void reader.cancel().catch(()=>{});
    }
  };
}

/** Existing published reader retains its exact expected byte-digest verifier.
 * Publication owner still rechecks pointer/generation/rights after this await.
 */
export function createProductControlMediaBytesReader(db: Db, mediaBucket: string, timeoutMs = 5000) {
  return createCanonicalMediaBytesReader<PrivateCatalogAssetDescriptor>(db,mediaBucket,timeoutMs,
    (input,bytes)=>!!verifyCatalogAssetBytes({...input,bytes}));
}

const UUID = /^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
function exact(v: unknown, keys: string[]) {
  return !!v && typeof v==="object" && !Array.isArray(v) && Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
}
function validApprovalDescriptor(v: ApprovalMediaDescriptor): boolean {
  return exact(v,["identity","mediaId","mediaVersion","storageIdentitySha256","contentType","sizeBytes"])
    && exact(v.identity,["offeringId","offeringVariantId","productId","variantId"])
    && typeof v.identity.offeringId==="string" && v.identity.offeringId.length<=100 && /^mo_[0-9a-f]+$/.test(v.identity.offeringId)
    && typeof v.identity.offeringVariantId==="string" && v.identity.offeringVariantId.length<=100 && /^mov_[0-9a-f]+$/.test(v.identity.offeringVariantId)
    && typeof v.identity.productId==="string" && UUID.test(v.identity.productId)
    && typeof v.identity.variantId==="string" && UUID.test(v.identity.variantId)
    && typeof v.mediaId==="string" && UUID.test(v.mediaId) && Number.isSafeInteger(v.mediaVersion) && v.mediaVersion>0
    && typeof v.storageIdentitySha256==="string" && /^[0-9a-f]{64}$/.test(v.storageIdentitySha256)
    && ["image/png","image/jpeg","image/webp"].includes(v.contentType)
    && Number.isSafeInteger(v.sizeBytes) && v.sizeBytes>0 && v.sizeBytes<=10*1024*1024;
}
function approvalBytesFit(input: ApprovalMediaDescriptor, bytes: Uint8Array): boolean {
  if(bytes.byteLength!==input.sizeBytes)return false;
  if(input.contentType==="image/png")return [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
  if(input.contentType==="image/jpeg")return bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  if(input.contentType==="image/webp")return bytes.length>=12 && Buffer.from(bytes.subarray(0,4)).toString("ascii")==="RIFF" && Buffer.from(bytes.subarray(8,12)).toString("ascii")==="WEBP";
  return false;
}

/** Server-only approval input. These bytes are NOT public rights authority.
 * Existing approval owner must derive actual byte SHA/dimensions and bind real
 * content/license evidence. No fake revision, asset or rights grant is made.
 */
export function createProductControlApprovalMediaBytesReader(db: Db, mediaBucket: string, timeoutMs = 5000) {
  const read=createCanonicalMediaBytesReader<ApprovalMediaDescriptor>(db,mediaBucket,timeoutMs,approvalBytesFit);
  return async (input: ApprovalMediaDescriptor): Promise<Uint8Array|null> => {
    try {
      if(!validApprovalDescriptor(input))return null;
      // Caller mutation across the metadata/download await must not retarget it.
      return await read(structuredClone(input));
    } catch { return null; }
  };
}
