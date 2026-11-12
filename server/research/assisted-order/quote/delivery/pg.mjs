// Inject the application's PRIVATE pg.Pool, never a browser Supabase client.
// Schema and table installation are always operator-owned; startup executes no DDL.
export function pgTransactions(pool,{assumeStagingRuntimeRole=false}={}) {
  return async function transact(tenant, xriId, work) {
    const client=await pool.connect();
    let damaged=false;
    try {
      await client.query("BEGIN");
      if(assumeStagingRuntimeRole){
        // The operator grants SET to a dedicated staging login. Keep the
        // effective role transaction-local so a pooled session cannot retain it.
        await client.query("SET LOCAL ROLE ea_quote_stage_runtime");
        const check=await client.query(
          `SELECT EXISTS(
             SELECT 1 FROM pg_catalog.pg_roles AS runtime, pg_catalog.pg_roles AS login
             WHERE runtime.rolname = current_user AND runtime.rolname = 'ea_quote_stage_runtime'
               AND NOT runtime.rolsuper AND NOT runtime.rolbypassrls
               AND NOT runtime.rolcanlogin AND NOT runtime.rolinherit
               AND login.rolname = session_user AND login.rolcanlogin
               AND NOT login.rolsuper AND NOT login.rolbypassrls
           ) AS restricted`);
        if(check.rows[0]?.restricted!==true)throw Error('Restricted staging quote connection required.');
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
