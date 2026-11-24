/** AUTHORED/UNRUN. Target: server/research/catalog-publication.pg.test.ts.
 * Existing owned-loopback Docker fixture and exact ProductControl migrations.
 * Reuses the existing pricing verifier's explicitly minimal legacy replicas;
 * does not reconstruct or qualify managed schema, real Auth, rights or actors.
 * No caller-supplied database URL/client, managed connection or credentials.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect} from 'vitest';
import {createDurableJourneyFixture,pg16It} from './assisted-order/request-intent/durable-journey.pg.fixture';

const id={offeringId:'mo_abc',offeringVariantId:'mov_def',productId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',variantId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
const mediaId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SQL='supabase/candidates/catalog_publication.sql';
const bootstrap='supabase/verification/research-pricing-lineage-disposable-bootstrap.sql';
const migration='supabase/migrations/20260726143000_research_product_control_center.sql';
const hardening='supabase/migrations/20260726214500_research_product_control_center_privilege_hardening.sql';
function pinned(path:string,sha:string){const raw=readFileSync(path);expect(createHash('sha256').update(raw).digest('hex')).toBe(sha);return raw.toString('utf8');}
for(const image of ['postgres:17.6','postgres:17.11'] as const){
 pg16It(`qualifies immutable publication/CAS/audit/retry transactions on owned ${image}`,async()=>{
  const db=createDurableJourneyFixture();
  try{
   await db.start({dockerOnly:true,managedCareSchema:true,image});
   const original=pinned(bootstrap,'bab1f2a56f773d22254c48cf75db9a1f794ed1ac92acd54afdeea86045ab6ceb');
   const meta=original.split(/\r?\n/).filter(l=>l.startsWith('\\'));
   expect(meta).toEqual(['\\set ON_ERROR_STOP on','\\ir ../migrations/20260726143000_research_product_control_center.sql','\\ir ../migrations/20260726214500_research_product_control_center_privilege_hardening.sql']);
   // Exactly the existing complete bootstrap DDL; only its three psql control
   // lines become these explicit driver calls. No source SQL statement sliced.
   await db.sql(original.split(/\r?\n/).filter(l=>!l.startsWith('\\')).join('\n'));
   await db.sql(pinned(migration,'b1589eb24405d4700206d25541b647479afee34c2cd05422da70df2179876203'));
   await db.sql(pinned(hardening,'2fb96f105fcfb1d6f77bf6e9bcf191b48decbc9206f2045b32cf7595d31551db'));
   await db.sql(pinned(SQL,'2fc9a355b8b7bcfd67229570ae631f6002c3aa58bb2bb88c80f555e22215fe32'));
   await db.sql(`insert into public.research_products(id,sku,display_name,canonical_name,admin_status,active_state,visibility_state,version)
    values($1,'OWNED-PUBLICATION','Owned publication fixture','Owned publication fixture','published',true,'public',1)`,[id.productId]);
   await db.sql(`insert into public.research_product_variants(id,product_id,sku,label,created_by,updated_by)
    values($1,$2,'OWNED-PUBLICATION-ONE','Owned variant','synthetic-fixture','synthetic-fixture')`,[id.variantId,id.productId]);
   await db.sql("update public.research_product_variants set status='in_review',version=2 where id=$1",[id.variantId]);
   await db.sql("update public.research_product_variants set status='approved',active=true,version=3 where id=$1",[id.variantId]);
   await db.sql(`insert into public.research_product_content(product_id,section,state,body) values
    ($1,'shortDescription','draft','Owned reviewed summary'),($1,'overview','draft','Owned reviewed overview')`,[id.productId]);
   await db.sql(`insert into public.research_product_media(id,product_id,kind,state,storage_key,filename,content_type,size_bytes,alt_text,created_by,updated_by,approved_by,approved_at)
    values($1,$2,'primary_image','approved','owned-test/private.png','private.png','image/png',12,'Owned reference','fixture','fixture','fixture',now())`,[mediaId,id.productId]);
   const call=async(name:string,args:unknown[])=>
    (await db.asRole('service_role',`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as v`,args)).rows[0].v;
   const source=()=>call('research_catalog_publication_source',[id,mediaId]);
   const current=()=>call('research_catalog_publication_current',[id]);
   const counts=async()=>(await db.sql(`select
    (select count(*)::int from public.research_catalog_publication_revisions) as revisions,
    (select count(*)::int from public.research_catalog_publication_operations) as operations,
    (select count(*)::int from public.research_product_admin_audit) as audit,
    (select jsonb_agg(to_jsonb(h) order by identity_key) from public.research_catalog_publication_heads h) as heads`)).rows[0];
   const s=await source();
   const ev=(snapshot:typeof s)=>({identity:id,sourceSha256:snapshot.sourceSha256,contentSha256:snapshot.contentSha256,mediaId,mediaVersion:1,
    contentApprovalSha256:'4'.repeat(64),rightsApprovalSha256:'5'.repeat(64),mediaSha256:'6'.repeat(64),usage:'public_catalog_display',state:'approved',expiresAt:null,width:1,height:1,representation:'catalog_reference',packagingDesign:false});
   const sealIntent={operation:'seal',identity:id,expectedGeneration:0,mediaId,sourceSha256:s.sourceSha256};
   const first=await call('research_catalog_publication_seal',['synthetic-verified-server','seal-one',sealIntent,ev(s)]);
   expect((await current()).revision).toBeNull();expect(first.generation).toBe(0);
   const exact=await call('research_catalog_publication_seal',['synthetic-verified-server','seal-one',sealIntent,ev(s)]);
   expect(exact.revisionId).toBe(first.revisionId);expect(exact.replayed).toBe(true);
   expect((await counts()).revisions).toBe(1);
   await expect(call('research_catalog_publication_transition',['synthetic-verified-server','seal-one',{operation:'publish',identity:id,revisionId:first.revisionId,expectedGeneration:0}])).rejects.toMatchObject({message:'publication_idempotency_conflict'});
   const published=await call('research_catalog_publication_transition',['synthetic-verified-server','publish-one',{operation:'publish',identity:id,revisionId:first.revisionId,expectedGeneration:0}]);
   expect(published.generation).toBe(1);expect((await current()).revision.id).toBe(first.revisionId);
   const before=await counts();
   await expect(call('research_catalog_publication_transition',['synthetic-verified-server','stale-withdraw',{operation:'withdraw',identity:id,reason:'Synthetic test',expectedGeneration:0}])).rejects.toMatchObject({message:'publication_generation_conflict'});
   expect(await counts()).toEqual(before);
   await db.sql("update public.research_product_content set body='Edited draft' where product_id=$1 and section='shortDescription'",[id.productId]);
   await db.sql('update public.research_products set version=version+1 where id=$1',[id.productId]);
   expect((await current()).revision.snapshot.content.summary).toBe('Owned reviewed summary');
   const stale=await counts();
   await expect(call('research_catalog_publication_seal',['synthetic-verified-server','stale-source',{...sealIntent,expectedGeneration:1},ev(s)])).rejects.toMatchObject({message:'publication_source_version_conflict'});
   expect(await counts()).toEqual(stale);
   const s2=await source();
   await db.sql("create function public.owned_publication_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'owned_audit_failure'; end $$; create trigger owned_publication_fail before insert on public.research_product_admin_audit for each row execute function public.owned_publication_audit_failure()");
   await expect(call('research_catalog_publication_seal',['synthetic-verified-server','failed-audit',{...sealIntent,sourceSha256:s2.sourceSha256,expectedGeneration:1},ev(s2)])).rejects.toMatchObject({message:'owned_audit_failure'});
   expect(await counts()).toEqual(stale);
   await db.sql('drop trigger owned_publication_fail on public.research_product_admin_audit');
   const second=await call('research_catalog_publication_seal',['synthetic-verified-server','seal-two',{...sealIntent,sourceSha256:s2.sourceSha256,expectedGeneration:1},ev(s2)]);
   const third=await call('research_catalog_publication_seal',['synthetic-verified-server','seal-three',{...sealIntent,sourceSha256:s2.sourceSha256,expectedGeneration:1},ev(s2)]);
   const race=await Promise.allSettled([
    call('research_catalog_publication_transition',['synthetic-verified-server','publish-two',{operation:'publish',identity:id,revisionId:second.revisionId,expectedGeneration:1}]),
    call('research_catalog_publication_transition',['synthetic-verified-server','publish-three',{operation:'publish',identity:id,revisionId:third.revisionId,expectedGeneration:1}])]);
   expect(race.filter(x=>x.status==='fulfilled')).toHaveLength(1);
   expect(race.filter(x=>x.status==='rejected')).toHaveLength(1);
   expect((await current()).generation).toBe(2);
   const selected=await counts();
   await db.sql('create trigger owned_publication_fail before insert on public.research_product_admin_audit for each row execute function public.owned_publication_audit_failure()');
   await expect(call('research_catalog_publication_transition',['synthetic-verified-server','failed-head-audit',{operation:'withdraw',identity:id,reason:'Synthetic atomic failure',expectedGeneration:2}])).rejects.toMatchObject({message:'owned_audit_failure'});
   expect(await counts()).toEqual(selected);
   await db.sql('drop trigger owned_publication_fail on public.research_product_admin_audit');
   await call('research_catalog_publication_transition',['synthetic-verified-server','rollback-one',{operation:'rollback',identity:id,revisionId:first.revisionId,reason:'Synthetic rollback',expectedGeneration:2}]);
   expect((await current()).revision.id).toBe(first.revisionId);
   await call('research_catalog_publication_transition',['synthetic-verified-server','withdraw-one',{operation:'withdraw',identity:id,reason:'Synthetic withdrawal',expectedGeneration:3}]);
   expect((await current()).revision).toBeNull();
   expect((await call('research_catalog_publication_replay',['synthetic-verified-server','publish-one',{operation:'publish',identity:id,revisionId:first.revisionId,expectedGeneration:0}])).generation).toBe(1);
   expect((await current()).revision).toBeNull();
   await expect(db.sql("update public.research_catalog_publication_revisions set snapshot='{}'::jsonb")).rejects.toMatchObject({message:'publication_history_immutable'});
   for(const role of ['anon','authenticated'] as const)await expect(db.asRole(role,'select public.research_catalog_publication_current($1)',[id])).rejects.toMatchObject({code:'42501'});
   await expect(db.sql('select public.research_catalog_publication_current($1)',[id])).rejects.toMatchObject({code:'42501'});
   await expect(db.asRole('service_role','select public.research_catalog_publication_current($1)',[id],id.productId)).rejects.toMatchObject({code:'42501'});
   await expect(db.asRole('service_role','update public.research_catalog_publication_heads set generation=0')).rejects.toMatchObject({code:'42501'});
  }finally{await db.close();}
 },90_000);
}
