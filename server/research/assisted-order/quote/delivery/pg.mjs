// Inject the application's PRIVATE pg.Pool, never a browser Supabase client.
// Schema and table installation are always operator-owned; startup executes no DDL.
// The only restricted login/runtime pairs a composition may assume. Names are
// fixed here so no configuration value is ever interpolated into SET ROLE.
export const RESTRICTED_RUNTIME_ROLES=Object.freeze({
  staging:Object.freeze({runtime:'ea_quote_stage_runtime',login:'ea_quote_stage_login'}),
  production:Object.freeze({runtime:'ea_quote_runtime',login:'ea_quote_login'}),
});
export function pgTransactions(pool,{assumeStagingRuntimeRole=false,runtimeRole=null}={}) {
  if(runtimeRole!==null && !Object.hasOwn(RESTRICTED_RUNTIME_ROLES,runtimeRole))throw Error('Unknown restricted runtime role.');
  if(assumeStagingRuntimeRole && runtimeRole!==null && runtimeRole!=='staging')throw Error('Conflicting restricted runtime role.');
  const restricted=runtimeRole!==null?RESTRICTED_RUNTIME_ROLES[runtimeRole]:assumeStagingRuntimeRole?RESTRICTED_RUNTIME_ROLES.staging:null;
  return async function transact(tenant, xriId, work) {
    const client=await pool.connect();
    let damaged=false;
    try {
      await client.query("BEGIN");
      if(restricted){
        // The operator grants SET to a dedicated login. Keep the effective
        // role transaction-local so a pooled session cannot retain it.
        await client.query("SET LOCAL ROLE "+restricted.runtime);
        const check=await client.query(
          `SELECT EXISTS(
             SELECT 1 FROM pg_catalog.pg_roles AS runtime, pg_catalog.pg_roles AS login
             WHERE runtime.rolname = current_user AND runtime.rolname = $1
               AND NOT runtime.rolsuper AND NOT runtime.rolbypassrls
               AND NOT runtime.rolcanlogin AND NOT runtime.rolinherit
               AND login.rolname = session_user AND login.rolname = $2 AND login.rolcanlogin
               AND NOT login.rolsuper AND NOT login.rolbypassrls
               -- rolinherit is only the default for new grants (PG16+); a grant made
               -- WITH INHERIT TRUE still passes privileges, so the runtime role must hold none.
               AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS m WHERE m.member = runtime.oid)
           ) AS restricted`,[restricted.runtime,restricted.login]);
        if(check.rows[0]?.restricted!==true)throw Error('Restricted quote connection required.');
        await client.query("SET LOCAL statement_timeout = '5s'");
      }
      await client.query("SET LOCAL search_path = quote_delivery_private, pg_catalog");
      await client.query("SELECT pg_catalog.set_config('xenios.private_quote_tenant',$1,true)",[tenant]);
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))",
        [JSON.stringify(['team-xenios-private-quote-v1',tenant,xriId])]);
      const answer=await work(async(sql,params=[]) => (await client.query(sql,params)).rows);
      await client.query("COMMIT"); return answer;
    } catch(e) {
      try{await client.query("ROLLBACK");}catch{damaged=true;}
      throw e;
    } finally {client.release(damaged); }
  };
}
