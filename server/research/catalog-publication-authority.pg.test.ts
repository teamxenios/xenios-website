/** AUTHORED/UNRUN: disposable owned PG only; no live owner, Auth, storage or managed-schema equivalence. */
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {expect}from'vitest';
import {createDurableJourneyFixture,pg16It}from'./assisted-order/request-intent/durable-journey.pg.fixture';
const identity={offeringId:'mo_abc',offeringVariantId:'mov_def',productId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',variantId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},mediaId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',capability='dddddddd-dddd-4ddd-8ddd-dddddddddddd',actor='owned-approval-owner@fixture.invalid';
function pinned(path:string,sha:string){const b=readFileSync(path);expect(createHash('sha256').update(b).digest('hex')).toBe(sha);return b.toString('utf8');}
for(const image of ['postgres:17.6','postgres:17.11']as const)pg16It(`qualifies head/owner/approval/revocation authority on owned ${image}`,async()=>{
 const db=createDurableJourneyFixture();try{
  await db.start({dockerOnly:true,managedCareSchema:true,image});
  const bootstrap=pinned('supabase/verification/research-pricing-lineage-disposable-bootstrap.sql','bab1f2a56f773d22254c48cf75db9a1f794ed1ac92acd54afdeea86045ab6ceb');expect(bootstrap.split(/\r?\n/).filter(l=>l.startsWith('\\'))).toEqual(['\\set ON_ERROR_STOP on','\\ir ../migrations/20260726143000_research_product_control_center.sql','\\ir ../migrations/20260726214500_research_product_control_center_privilege_hardening.sql']);
  await db.sql(bootstrap.split(/\r?\n/).filter(l=>!l.startsWith('\\')).join('\n'));
  await db.sql(pinned('supabase/migrations/20260726143000_research_product_control_center.sql','b1589eb24405d4700206d25541b647479afee34c2cd05422da70df2179876203'));
  await db.sql(pinned('supabase/migrations/20260726214500_research_product_control_center_privilege_hardening.sql','2fb96f105fcfb1d6f77bf6e9bcf191b48decbc9206f2045b32cf7595d31551db'));
  await db.sql(pinned('supabase/candidates/catalog_publication.sql','2fc9a355b8b7bcfd67229570ae631f6002c3aa58bb2bb88c80f555e22215fe32'));
  await db.sql(pinned('supabase/candidates/catalog_publication_authority.sql','fca4304d98973c98be52ea04ac22c3944a823fc16bde478dc14b83f17b4033d0'));
  await db.sql(`insert into public.research_products(id,sku,display_name,canonical_name,admin_status,active_state,visibility_state,version)values($1,'OWNED-AUTHORITY','Owned authority fixture','Owned authority fixture','published',true,'public',1)`,[identity.productId]);
  await db.sql(`insert into public.research_product_variants(id,product_id,sku,label,created_by,updated_by)values($1,$2,'OWNED-AUTHORITY-ONE','Owned variant','fixture','fixture')`,[identity.variantId,identity.productId]);
  await db.sql("update public.research_product_variants set status='in_review',version=2 where id=$1",[identity.variantId]);await db.sql("update public.research_product_variants set status='approved',active=true,version=3 where id=$1",[identity.variantId]);
  await db.sql("insert into public.research_product_content(product_id,section,state,body)values($1,'shortDescription','draft','Owned reviewed summary'),($1,'overview','draft','Owned reviewed overview')",[identity.productId]);
  await db.sql(`insert into public.research_product_media(id,product_id,kind,state,storage_key,filename,content_type,size_bytes,alt_text,created_by,updated_by,approved_by,approved_at)values($1,$2,'primary_image','approved','owned-test/private.png','private.png','image/png',12,'Owned reference','fixture','fixture','fixture',now())`,[mediaId,identity.productId]);
  const call=async(name:string,args:unknown[])=>(await db.asRole('service_role',`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value;
  const source=await call('research_catalog_publication_source',[identity,mediaId]);const intent={operation:'approve',identity,expectedApprovalVersion:0,mediaId,sourceSha256:source.sourceSha256,expectedMediaSha256:createHash('sha256').update(Buffer.from('89504e470d0a1a0a00000000','hex')).digest('hex'),contentApprovalReference:'record:owned-content',rightsEvidenceReference:'record:owned-rights',expiresAt:null,width:1,height:1,representation:'catalog_reference',packagingDesign:false,usage:'public_catalog_display'};const byteHash=createHash('sha256').update(Buffer.from('89504e470d0a1a0a00000000','hex')).digest('hex');
  expect((await call('research_catalog_approval_state',[actor,identity])).ownerCapability).toBeNull();expect((await call('research_catalog_publication_admin_state',[actor,identity])).generation).toBe(0);
  await expect(call('research_catalog_approval_decide',[actor,'owner-missing',intent,byteHash])).rejects.toMatchObject({message:'publication_approval_owner_required'});
  await expect(call('research_catalog_record_approval_owner',[identity,actor,capability,'grant','2099-01-01T00:00:00Z','record:owned-root-verification'])).rejects.toMatchObject({code:'42501'});
  await db.sql('select public.research_catalog_record_approval_owner($1,$2,$3,$4,$5,$6)',[identity,actor,capability,'grant','2099-01-01T00:00:00Z','record:owned-root-verification']);
  await expect(call('research_catalog_approval_decide',['other-admin@fixture.invalid','other-owner',intent,byteHash])).rejects.toMatchObject({message:'publication_approval_owner_required'});
  const approved=await call('research_catalog_approval_decide',[actor,'approve-one',intent,byteHash]);expect(approved.decision).toBe('approved');expect(approved.approvalVersion).toBe(1);
  expect((await call('research_catalog_approval_decide',[actor,'approve-one',intent,byteHash])).replayed).toBe(true);
  await expect(call('research_catalog_approval_decide',[actor,'approve-one',{...intent,rightsEvidenceReference:'record:changed'},byteHash])).rejects.toMatchObject({message:'publication_idempotency_conflict'});
  expect((await db.sql('select count(*)::int as n from public.research_catalog_approval_events')).rows[0].n).toBe(1);
  const evidence=await call('research_catalog_approval_for_source',[identity,source.sourceSha256,mediaId,1]);expect(evidence.mediaSha256).toBe(byteHash);expect(evidence.rightsApprovalSha256).toMatch(/^[a-f0-9]{64}$/);
  const seal={operation:'seal',identity,expectedGeneration:0,mediaId,sourceSha256:source.sourceSha256};
  await expect(call('research_catalog_publication_seal',[actor,'old-entry',seal,evidence])).rejects.toMatchObject({code:'42501'});
  const sealed=await call('research_catalog_publication_seal_verified',[actor,'seal-one',seal,evidence]);await call('research_catalog_publication_transition_verified',[actor,'publish-one',{operation:'publish',identity,expectedGeneration:0,revisionId:sealed.revisionId}]);
  const revoke={operation:'revoke',identity,expectedApprovalVersion:1,approvalId:approved.approvalId,reason:'Owned actor revocation'};
  await call('research_catalog_approval_decide',[actor,'revoke-one',revoke,null]);expect(await call('research_catalog_approval_for_source',[identity,source.sourceSha256,mediaId,1])).toBeNull();
  const head=await call('research_catalog_publication_admin_state',[actor,identity]);expect(head.generation).toBe(1);expect(head.currentRevisionId).toBe(sealed.revisionId);expect(head.revisions).toEqual([{revisionId:sealed.revisionId,previouslyPublished:true}]);expect(JSON.stringify(head)).not.toContain(actor);expect(JSON.stringify(head)).not.toContain('approve-one');
  await expect(call('research_catalog_publication_transition_verified',[actor,'publish-without-rights',{operation:'publish',identity,expectedGeneration:1,revisionId:sealed.revisionId}])).rejects.toMatchObject({message:'publication_approval_required'});
  await db.sql('select public.research_catalog_record_approval_owner($1,$2,$3,$4,$5,$6)',[identity,actor,capability,'revoke',null,'record:owned-revocation']);
  expect((await call('research_catalog_approval_state',[actor,identity])).ownerCapability).toBeNull();await call('research_catalog_publication_transition_verified',[actor,'withdraw-one',{operation:'withdraw',identity,expectedGeneration:1,reason:'Withdrawal with rights and owner absent'}]);expect((await call('research_catalog_publication_admin_state',[actor,identity])).currentRevisionId).toBeNull();
  expect((await call('research_catalog_approval_replay',[actor,'approve-one',intent])).replayed).toBe(true);
  for(const table of ['research_catalog_approval_events','research_catalog_approval_owner_events']){await expect(db.sql(`update public.${table} set actor='changed'`)).rejects.toMatchObject({message:'publication_history_immutable'});await expect(db.asRole('service_role',`select * from public.${table}`)).rejects.toMatchObject({code:'42501'});}
  for(const role of ['anon','authenticated']as const)await expect(db.asRole(role,'select public.research_catalog_publication_admin_state($1,$2)',[actor,identity])).rejects.toMatchObject({code:'42501'});
 }finally{await db.close();}
},90_000);
