import assert from 'node:assert/strict';

export async function verifyStaffLifecycle(db) {
  await db.exec('RESET ROLE');
  const guardedTables = ['staff_profiles','hotels','rooms','room_categories','stays','payment_records','stay_room_moves','inspection_requirements','maintenance_issues','activity_events'];
  // A permissive reader must not override the independent session/tenant guard.
  for (const table of guardedTables) await db.exec(`CREATE POLICY lifecycle_permissive_probe ON public.${table} FOR SELECT TO authenticated USING (true)`);
  const owner='00000000-0000-0000-0000-000000000002', target='00000000-0000-0000-0000-000000000001';
  const oldSession='a0000000-0000-0000-0000-000000000001', freshSession='a0000000-0000-0000-0000-000000000002';
  const login=async (uid,session=null) => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[uid,JSON.stringify(session?{session_id:session}:{})]); await db.exec('SET ROLE authenticated'); };
  await db.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES ($1,$2,clock_timestamp())',[oldSession,target]);
  await db.query('INSERT INTO auth.refresh_tokens(user_id,session_id,revoked) VALUES ($1,$2,false)',[target,oldSession]);
  await login(owner);
  assert.equal((await db.query('SELECT get_staff_access_status() AS s')).rows[0].s,'ready','legacy accounts need no session claim');
  await assert.rejects(db.query("SELECT prepare_staff_deletion($1,'test','DELETE')",[target]),/inactive/);
  await assert.rejects(db.query("SELECT prepare_staff_deletion($1,'test','DELETE')",[owner]),/cannot be deleted/);
  await assert.rejects(db.query("SELECT prepare_staff_deletion('00000000-0000-0000-0000-000000000004','test','DELETE')"),/cannot be deleted/);
  await db.query("SELECT set_staff_active($1,true,false,'Lifecycle test')",[target]);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.sessions WHERE user_id=$1',[target])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.refresh_tokens WHERE user_id=$1',[target])).rows[0].n,0);
  // A failure deleting Auth tokens must roll the profile and session changes back.
  await db.exec("CREATE FUNCTION auth.reject_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'revoke blocked'; END $$; CREATE TRIGGER reject_revoke BEFORE DELETE ON auth.sessions FOR EACH ROW EXECUTE FUNCTION auth.reject_revoke()");
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES ($1,$2)',[oldSession,target]);
  await db.query('INSERT INTO auth.refresh_tokens(user_id,session_id) VALUES ($1,$2)',[target,oldSession]);
  await login(owner);
  await assert.rejects(db.query("SELECT set_staff_active($1,false,true,'Restore')",[target]),/revoke blocked/);
  await db.exec('RESET ROLE; DROP TRIGGER reject_revoke ON auth.sessions; DROP FUNCTION auth.reject_revoke()');
  assert.equal((await db.query('SELECT active FROM staff_profiles WHERE user_id=$1',[target])).rows[0].active,false);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.refresh_tokens WHERE user_id=$1',[target])).rows[0].n,1,'token delete rolls back with session delete failure');
  await login(owner);
  await db.query("SELECT set_staff_active($1,false,true,'Restore')",[target]);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.sessions WHERE user_id=$1',[target])).rows[0].n,0,'sessions created while inactive are revoked on reactivation');
  await login(target,oldSession);
  assert.equal((await db.query('SELECT get_staff_access_status() AS s')).rows[0].s,'revoked');
  for (const table of guardedTables) {
    assert.equal((await db.query(`SELECT * FROM public.${table}`)).rows.length,0,`revoked JWT cannot read ${table}`);
  }
  await db.exec('RESET ROLE');
  for (const fn of ['assert_reception_role','assert_supervisor_role','assert_maintenance_report_role','assert_maintenance_resolution_role']) {
    await assert.rejects(db.query(`SELECT public.${fn}()`),/inactive|unavailable/,`${fn} rejects revoked session before role check`);
  }
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query("SELECT room_is_ready('30000000-0000-0000-0000-000000000001') AS ready")).rows[0].ready,false);
  await assert.rejects(db.query("SELECT record_arrival('30000000-0000-0000-0000-000000000001','Stale',null,1,40000)"),/inactive|unavailable/);
  await db.exec('RESET ROLE');
  const boundarySession=(await db.query('INSERT INTO auth.sessions(id,user_id,created_at) SELECT gen_random_uuid(),user_id,revoked_before FROM staff_profiles WHERE user_id=$1 RETURNING id',[target])).rows[0].id;
  await login(target,boundarySession);
  assert.equal((await db.query('SELECT get_staff_access_status() AS s')).rows[0].s,'revoked','session at fence timestamp is denied');
  await login(target,'not-a-uuid');
  assert.equal((await db.query('SELECT get_staff_access_status() AS s')).rows[0].s,'revoked','malformed session claims fail closed');
  await login(target);
  assert.equal((await db.query('SELECT get_staff_access_status() AS s')).rows[0].s,'revoked');
  await db.exec('RESET ROLE');
  await db.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES ($1,$2,clock_timestamp())',[freshSession,target]);
  await login(target,freshSession);
  assert.equal((await db.query('SELECT get_staff_access_status() AS s')).rows[0].s,'ready');
  await assert.rejects(db.query("SELECT prepare_staff_deletion($1,'test','DELETE')",[target]),/owner access/);
  await assert.rejects(db.query("SELECT complete_staff_deletion($1,gen_random_uuid())",[target]),/permission denied/);
  await assert.rejects(db.query('SELECT private.session_allowed($1)',[owner]),/permission denied/,'arbitrary identity session lookup is private');
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query('SELECT get_staff_access_status()'),/permission denied/,'anonymous cannot inspect staff status');
  await assert.rejects(db.query("SELECT prepare_staff_deletion($1,'test','DELETE')",[target]),/permission denied/);

  await login(owner);
  await db.query("SELECT set_staff_active($1,true,false,'Delete')",[target]);
  await db.exec('RESET ROLE');
  const pending='00000000-0000-0000-0000-000000000099';
  await db.query("INSERT INTO auth.users(id,email) VALUES ($1,'pending@example.invalid')",[pending]);
  await db.query("INSERT INTO staff_profiles(user_id,hotel_id,display_name,role,active,setup_pending) VALUES ($1,'10000000-0000-0000-0000-000000000001','Pending','receptionist',false,true)",[pending]);
  await login(owner);
  await assert.rejects(db.query("SELECT prepare_staff_deletion($1,'test','DELETE')",[pending]),/setup/);
  await db.exec('RESET ROLE');
  const setupSession=(await db.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES (gen_random_uuid(),$1,clock_timestamp()) RETURNING id',[pending])).rows[0].id;
  await db.exec('SET ROLE service_role');
  await db.query('SELECT finish_staff_setup($1)',[pending]);
  await login(pending,setupSession);
  assert.equal((await db.query('SELECT get_staff_access_status() AS s')).rows[0].s,'ready','first password setup retains its newly established session');
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.sessions WHERE id=$1',[setupSession])).rows[0].n,1,'initial setup preserves its Auth session');
  await login(owner);

  await assert.rejects(db.query("SELECT prepare_staff_deletion($1,'','DELETE')",[target]),/reason/);
  await assert.rejects(db.query("SELECT prepare_staff_deletion($1,'test','delete')",[target]),/DELETE/);
  const nonce=(await db.query("SELECT prepare_staff_deletion($1,'Remove account','DELETE') AS id",[target])).rows[0].id;
  assert.equal((await db.query("SELECT prepare_staff_deletion($1,'Retry','DELETE') AS id",[target])).rows[0].id,nonce);
  await assert.rejects(db.query("SELECT set_staff_active($1,false,true,'Restore')",[target]),/deletion/);
  await assert.rejects(db.query('SELECT get_pending_staff_email($1)',[target]),/pending/);
  await assert.rejects(db.query("SELECT cancel_staff_setup($1,'Cancel')",[target]),/pending/);
  assert.equal((await db.query('SELECT deletion_pending FROM get_managed_staff() WHERE user_id=$1',[target])).rows[0].deletion_pending,true);
  await db.exec('RESET ROLE; SET ROLE service_role');
  await assert.rejects(db.query('SELECT complete_staff_deletion($1,$2)',[target,nonce]),/Auth account/);
  await assert.rejects(db.query('SELECT complete_staff_deletion($1,gen_random_uuid())',[target]),/request/);
  await assert.rejects(db.query('SELECT finish_staff_setup($1)',[target]),/pending|deletion/);
  await db.exec('RESET ROLE');
  const history=(await db.query('SELECT count(*)::int AS n FROM stays WHERE created_by=$1',[target])).rows[0].n;
  assert.ok(history>0,'fixture has historical stays');
  const retainedTables=['stays','payment_records','stay_room_moves','inspection_requirements','maintenance_issues'];
  const beforeCounts=[];
  for (const table of retainedTables) beforeCounts.push((await db.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n);
  await db.query('DELETE FROM auth.users WHERE id=$1',[target]);
  await login(owner);
  assert.equal((await db.query('SELECT email FROM get_managed_staff() WHERE user_id=$1',[target])).rows[0].email,null);
  await db.exec('RESET ROLE; SET ROLE service_role');
  await db.query('SELECT complete_staff_deletion($1,$2)',[target,nonce]);
  await db.query('SELECT complete_staff_deletion($1,$2)',[target,nonce]);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM stays WHERE created_by=$1',[target])).rows[0].n,history);
  for (let n=0;n<retainedTables.length;n++) assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.${retainedTables[n]}`)).rows[0].n,beforeCounts[n],`${retainedTables[n]} history survives Auth deletion`);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM activity_events WHERE action IN ('staff.deletion_requested','staff.deleted') AND after_facts->>'user_id'=$1",[target])).rows[0].n,2);
  await login(owner);
  assert.equal((await db.query('SELECT * FROM get_managed_staff() WHERE user_id=$1',[target])).rows.length,0,'completed deletion leaves active staff directory');
  await login(target,oldSession);
  assert.equal((await db.query('SELECT get_staff_access_status() AS s')).rows[0].s,'deleted');
  assert.equal((await db.query('SELECT * FROM staff_profiles')).rows.length,0,'deleted JWT cannot read retained profile');
  await db.exec('RESET ROLE');
  for (const table of guardedTables) await db.exec(`DROP POLICY lifecycle_permissive_probe ON public.${table}`);
  console.log('PASS staff lifecycle: atomic revoke, rollback, session fence, deletion guards, retries, historical records');
}

