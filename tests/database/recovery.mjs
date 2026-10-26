import assert from 'node:assert/strict';

const quoteIdentifier = value => `"${value.replaceAll('"', '""')}"`;

async function snapshot(db) {
  const tables = (await db.query(`SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname IN ('public','auth','private','cron') ORDER BY schemaname,tablename`)).rows;
  const result = {};
  for (const { schemaname, tablename } of tables) {
    const table = `${quoteIdentifier(schemaname)}.${quoteIdentifier(tablename)}`;
    // Synthetic fixture rows only. Keep data in memory; output counts/results, never rows.
    result[`${schemaname}.${tablename}`] = (await db.query(`SELECT row_to_json(t)::text AS row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows;
  }
  return result;
}

export async function verifyLocalRecovery(db, PGlite) {
  await db.exec('RESET ROLE');
  const recoveryStaff = (await db.query("SELECT user_id FROM public.staff_profiles WHERE active AND role='receptionist' ORDER BY user_id LIMIT 1")).rows[0];
  const recoverySession = (await db.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES (gen_random_uuid(),$1,clock_timestamp()) RETURNING id',[recoveryStaff.user_id])).rows[0].id;
  const before = await snapshot(db);
  const archive = await db.dumpDataDir();
  const restored = new PGlite({ loadDataDir: archive });
  try {
    await restored.waitReady;
    assert.deepEqual(await snapshot(restored), before, 'restored synthetic operational/auth/cron rows match backup');
    const staff = (await restored.query(`SELECT user_id,hotel_id FROM public.staff_profiles
      WHERE active AND role='receptionist' ORDER BY user_id LIMIT 1`)).rows[0];
    assert.ok(staff, 'recovery rehearsal requires an active receptionist fixture');
    await restored.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [staff.user_id]);
    await restored.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({session_id:recoverySession})]);
    await restored.exec('SET ROLE authenticated');
    const foreignRooms = (await restored.query('SELECT id FROM public.rooms WHERE property_id <> $1', [staff.hotel_id])).rows;
    assert.equal(foreignRooms.length, 0, 'tenant RLS remains effective after restore');
    const room = (await restored.query('SELECT id FROM public.rooms WHERE public.room_is_ready(id) ORDER BY id LIMIT 1')).rows[0];
    assert.ok(room, 'recovery rehearsal requires an eligible room fixture');
    await restored.exec('BEGIN');
    const arrivalSql = "SELECT public.record_arrival($1,'Recovery Fixture',null,1,40000) AS id";
    const arrival = (await restored.query(arrivalSql, [room.id])).rows[0].id;
    assert.ok(arrival, 'restored arrival RPC can write');
    await assert.rejects(restored.query(arrivalSql, [room.id]), /not ready|occupied/, 'restored constraints/RPC reject duplicate occupancy');
    await restored.exec('ROLLBACK; RESET ROLE');
    assert.deepEqual(await snapshot(restored), before, 'rehearsal writes roll back without altering restored history');
    console.log(`PASS local embedded recovery: archive reload, ${Object.keys(before).length} tables, tenant RLS, arrival and duplicate rejection`);
    console.log('LIMIT: PGlite synthetic archive reload is not a Supabase/pg_dump production backup or restore rehearsal.');
  } finally {
    await restored.close();
  }
}
