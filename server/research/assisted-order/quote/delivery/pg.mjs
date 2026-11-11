// Inject the application's PRIVATE pg.Pool, never a browser Supabase client.
// Schema and table installation are always operator-owned; startup executes no DDL.
export function pgTransactions(pool) {
  return async function transact(tenant, xriId, work) {
    const client=await pool.connect();
    let damaged=false;
    try {
      await client.query("BEGIN");
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
