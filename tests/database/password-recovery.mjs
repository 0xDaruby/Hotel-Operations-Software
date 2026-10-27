import assert from 'node:assert/strict';

export async function verifyPasswordRecovery(db) {
  await db.exec('RESET ROLE');
  let sequence = 0;
  const uuid = group => `${group}0000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  const hotel = uuid('9'), otherHotel = uuid('9');
  await db.query('INSERT INTO public.hotels(id,name) VALUES ($1,$2),($3,$4)', [hotel, 'Password recovery test', otherHotel, 'Recovery isolation test']);
  const login = async (userId, sessionId, extras = {}) => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [userId ?? '', JSON.stringify({ ...extras, ...(sessionId === undefined ? {} : { session_id: sessionId }) })]);
    await db.exec('SET ROLE authenticated');
  };
  const admin = async () => db.exec('RESET ROLE');
  const status = async () => (await db.query('SELECT public.get_password_recovery_status() AS allowed')).rows[0].allowed;
  const fixture = async (role = 'receptionist', flags = {}, property = hotel) => {
    await admin();
    const user = uuid('8'), session = uuid('7'), oldSession = uuid('7');
    await db.query("INSERT INTO auth.users(id,email,recovery_sent_at) VALUES ($1,$2,clock_timestamp()-interval '1 minute')", [user, `${user}@example.invalid`]);
    await db.query(`INSERT INTO public.staff_profiles(user_id,hotel_id,display_name,role,active,setup_pending,setup_cancelled,must_change_password,account_deleted_at,deletion_request_id)
      VALUES ($1,$2,'Recovery test',$3,$4,$5,$6,false,$7,$8)`, [user, property, role, flags.active ?? true, flags.pending ?? false, flags.cancelled ?? false, flags.deleted ? new Date() : null, flags.deleting ? uuid('6') : null]);
    await db.query("INSERT INTO auth.sessions(id,user_id,created_at) VALUES ($1,$2,clock_timestamp()-interval '30 seconds'),($3,$2,clock_timestamp()-interval '10 minutes')", [session, user, oldSession]);
    await db.query("INSERT INTO auth.mfa_amr_claims(session_id,authentication_method,created_at) VALUES ($1,'otp',clock_timestamp()-interval '30 seconds')", [session]);
    await db.query('INSERT INTO auth.refresh_tokens(user_id,session_id) VALUES ($1,$2),($1,$3)', [user, session, oldSession]);
    return { user, session, oldSession };
  };
  const foreign = await fixture('supervisor', {}, otherHotel);
  const historyTables = ['rooms', 'stays', 'payment_records', 'stay_room_moves', 'inspection_requirements', 'maintenance_issues'];
  const historyCounts = [];
  for (const table of historyTables) historyCounts.push((await db.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n);

  for (const role of ['owner', 'receptionist', 'supervisor']) {
    const value = await fixture(role);
    await login(value.user, value.session);
    assert.equal(await status(), true, `${role} can recover its own active identity`);
    assert.equal((await db.query('SELECT public.claim_password_recovery() AS session')).rows[0].session, value.session);
    assert.equal(await status(), false, 'claimed recovery cannot be reused');
    await assert.rejects(db.query('SELECT public.claim_password_recovery()'), /unavailable or expired/);
    assert.equal((await db.query('SELECT public.get_staff_access_status() AS status')).rows[0].status, 'revoked', 'retained recovery JWT loses operational access before password update');
    assert.equal((await db.query('SELECT id FROM public.rooms')).rows.length, 0);
    await assert.rejects(db.query('SELECT public.finish_password_recovery($1,$2,true)', [value.user, value.session]), /permission denied/, 'client cannot complete privileged cleanup');
    await assert.rejects(db.query('SELECT * FROM private.password_recovery_uses'), /permission denied/);
    await assert.rejects(db.query('SELECT private.password_recovery_session()'), /permission denied/);
    await admin();
    assert.deepEqual((await db.query('SELECT id FROM auth.sessions WHERE user_id=$1', [value.user])).rows, [{ id: value.session }], 'only the recovery Auth session remains for the real-user password update');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.refresh_tokens WHERE user_id=$1', [value.user])).rows[0].n, 1);
    await login(value.user, value.oldSession);
    assert.equal((await db.query('SELECT public.get_staff_access_status() AS status')).rows[0].status, 'revoked', 'old JWT loses access immediately');
    await admin();
    const concurrentSession = uuid('7');
    await db.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES ($1,$2,clock_timestamp())', [concurrentSession, value.user]);
    await db.query('INSERT INTO auth.refresh_tokens(user_id,session_id) VALUES ($1,$2)', [value.user, concurrentSession]);
    await db.exec('SET ROLE service_role');
    await assert.rejects(db.query('SELECT public.finish_password_recovery($1,$2,true)', [foreign.user, value.session]), /No password reset/);
    await assert.rejects(db.query('SELECT public.finish_password_recovery($1,$2,null)', [value.user, value.session]), /outcome/);
    await db.query('SELECT public.finish_password_recovery($1,$2,true)', [value.user, value.session]);
    await db.query('SELECT public.finish_password_recovery($1,$2,true)', [value.user, value.session]);
    await assert.rejects(db.query('SELECT public.finish_password_recovery($1,$2,false)', [value.user, value.session]), /already recorded/);
    await admin();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.sessions WHERE user_id=$1', [value.user])).rows[0].n, 0, 'completion revokes recovery and concurrent sessions');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.refresh_tokens WHERE user_id=$1', [value.user])).rows[0].n, 0);
    assert.deepEqual((await db.query('SELECT active,role,hotel_id,setup_pending,setup_cancelled,must_change_password FROM public.staff_profiles WHERE user_id=$1', [value.user])).rows[0], {
      active: true, role, hotel_id: hotel, setup_pending: false, setup_cancelled: false, must_change_password: false,
    });
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.activity_events WHERE action='staff.password_reset_completed' AND after_facts->>'user_id'=$1", [value.user])).rows[0].n, 1, 'completion audit is idempotent');
    await login(value.user, value.session);
    assert.equal(await status(), false);
    const newSession = uuid('7');
    await admin();
    await db.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES ($1,$2,clock_timestamp())', [newSession, value.user]);
    await login(value.user, newSession);
    assert.equal((await db.query('SELECT public.get_staff_access_status() AS status')).rows[0].status, 'ready', 'a fresh ordinary login can enter the unchanged role workspace');
    assert.equal(await status(), false, 'ordinary fresh login is not reset proof');
  }

  for (const flags of [{ active: false }, { pending: true, active: false }, { cancelled: true, active: false }, { deleted: true, active: false }, { deleting: true, active: false }]) {
    const value = await fixture('receptionist', flags);
    await login(value.user, value.session);
    assert.equal(await status(), false, `blocked identity cannot recover: ${JSON.stringify(flags)}`);
    await assert.rejects(db.query('SELECT public.claim_password_recovery()'), /unavailable or expired/);
    await admin();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM private.password_recovery_uses WHERE user_id=$1', [value.user])).rows[0].n, 0);
  }

  const invalid = await fixture();
  for (const session of [undefined, 'not-a-uuid', "x' OR true --", foreign.session]) {
    await login(invalid.user, session, { amr: [{ method: 'recovery', timestamp: Math.floor(Date.now() / 1000) }] });
    assert.equal(await status(), false, 'missing, malformed or foreign session claims fail closed');
  }
  await login('', undefined);
  assert.equal(await status(), false, 'missing authenticated subject fails closed');
  await login(invalid.user, invalid.session);
  await admin();
  await db.query("UPDATE auth.mfa_amr_claims SET authentication_method='password' WHERE session_id=$1", [invalid.session]);
  await login(invalid.user, invalid.session, { type: 'recovery', amr: [{ method: 'otp' }] });
  assert.equal(await status(), false, 'forged client recovery/AMR metadata cannot replace server proof');
  await admin();
  await db.query("UPDATE auth.mfa_amr_claims SET authentication_method='otp' WHERE session_id=$1", [invalid.session]);
  for (const mutation of [
    "UPDATE auth.sessions SET created_at=clock_timestamp()-interval '16 minutes' WHERE id=$1",
    "UPDATE auth.sessions SET created_at=clock_timestamp()+interval '1 minute' WHERE id=$1",
  ]) {
    await db.query(mutation, [invalid.session]);
    await login(invalid.user, invalid.session); assert.equal(await status(), false, 'expired/future session is denied'); await admin();
  }
  await db.query("UPDATE auth.sessions SET created_at=clock_timestamp()-interval '30 seconds' WHERE id=$1", [invalid.session]);
  for (const age of ["-interval '16 minutes'", "+interval '1 minute'"]) {
    await db.query(`UPDATE auth.mfa_amr_claims SET created_at=clock_timestamp()${age} WHERE session_id=$1`, [invalid.session]);
    await login(invalid.user, invalid.session); assert.equal(await status(), false, 'expired/future email proof is denied'); await admin();
  }
  await db.query("UPDATE auth.mfa_amr_claims SET created_at=clock_timestamp()-interval '30 seconds' WHERE session_id=$1", [invalid.session]);
  for (const value of [null, new Date(Date.now() - 2 * 60 * 60 * 1000), new Date()]) {
    await db.query('UPDATE auth.users SET recovery_sent_at=$1 WHERE id=$2', [value, invalid.user]);
    await login(invalid.user, invalid.session); assert.equal(await status(), false, 'missing, too-old or newer request invalidates old recovery proof'); await admin();
  }
  const missingUser = uuid('8'), missingSession = uuid('7');
  await db.query("INSERT INTO auth.users(id,recovery_sent_at) VALUES ($1,clock_timestamp()-interval '1 minute')", [missingUser]);
  await db.query("INSERT INTO auth.sessions(id,user_id,created_at) VALUES ($1,$2,clock_timestamp()-interval '30 seconds')", [missingSession, missingUser]);
  await login(missingUser, missingSession); assert.equal(await status(), false, 'an Auth identity without staff membership cannot recover staff access');
  await admin();

  const unfinished = await fixture();
  await login(unfinished.user, unfinished.session);
  await db.query('SELECT public.claim_password_recovery()');
  await admin();
  const laterSession = uuid('7');
  await db.query("UPDATE auth.users SET recovery_sent_at=clock_timestamp()-interval '1 second' WHERE id=$1", [unfinished.user]);
  await db.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES ($1,$2,clock_timestamp())', [laterSession, unfinished.user]);
  await db.query("INSERT INTO auth.mfa_amr_claims(session_id,authentication_method,created_at) VALUES ($1,'otp',clock_timestamp())", [laterSession]);
  await login(unfinished.user, laterSession);
  assert.equal(await status(), false, 'another fresh email session cannot overlap an unfinished password write');
  await admin();
  await db.query("UPDATE private.password_recovery_uses SET claimed_at=clock_timestamp()-interval '16 minutes' WHERE session_id=$1", [unfinished.session]);
  await login(unfinished.user, laterSession);
  assert.equal(await status(), true, 'an abandoned claim stops blocking a new fresh email session after fifteen minutes');
  await admin();
  await db.exec('SET ROLE service_role');
  await db.query('SELECT public.finish_password_recovery($1,$2,false)', [unfinished.user, unfinished.session]);
  await admin();
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.sessions WHERE user_id=$1', [unfinished.user])).rows[0].n, 0, 'failed password update still revokes all sessions');
  assert.equal((await db.query('SELECT password_saved FROM private.password_recovery_uses WHERE session_id=$1', [unfinished.session])).rows[0].password_saved, false);

  const rollback = await fixture();
  await db.exec(`CREATE FUNCTION private.fail_password_recovery_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'recovery delete probe'; END $$;
    CREATE TRIGGER password_recovery_delete_probe BEFORE DELETE ON auth.sessions FOR EACH ROW EXECUTE FUNCTION private.fail_password_recovery_delete();`);
  await login(rollback.user, rollback.session);
  await assert.rejects(db.query('SELECT public.claim_password_recovery()'), /recovery delete probe/);
  await admin();
  assert.equal((await db.query('SELECT revoked_before FROM public.staff_profiles WHERE user_id=$1', [rollback.user])).rows[0].revoked_before, null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM private.password_recovery_uses WHERE user_id=$1', [rollback.user])).rows[0].n, 0, 'failed revocation rolls claim back');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.refresh_tokens WHERE user_id=$1', [rollback.user])).rows[0].n, 2, 'failed revocation rolls token deletion back');
  await db.exec('DROP TRIGGER password_recovery_delete_probe ON auth.sessions; DROP FUNCTION private.fail_password_recovery_delete()');
  await login(rollback.user, rollback.session);
  await db.query('SELECT public.claim_password_recovery()');
  await admin();
  const claimFence = (await db.query('SELECT revoked_before FROM public.staff_profiles WHERE user_id=$1', [rollback.user])).rows[0].revoked_before;
  await db.exec(`CREATE FUNCTION private.fail_password_recovery_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'recovery delete probe'; END $$;
    CREATE TRIGGER password_recovery_delete_probe BEFORE DELETE ON auth.sessions FOR EACH ROW EXECUTE FUNCTION private.fail_password_recovery_delete(); SET ROLE service_role;`);
  await assert.rejects(db.query('SELECT public.finish_password_recovery($1,$2,true)', [rollback.user, rollback.session]), /recovery delete probe/);
  await admin();
  assert.equal((await db.query('SELECT completed_at FROM private.password_recovery_uses WHERE session_id=$1', [rollback.session])).rows[0].completed_at, null, 'failed final revocation rolls completion back');
  assert.deepEqual((await db.query('SELECT revoked_before FROM public.staff_profiles WHERE user_id=$1', [rollback.user])).rows[0].revoked_before, claimFence);
  await db.exec('DROP TRIGGER password_recovery_delete_probe ON auth.sessions; DROP FUNCTION private.fail_password_recovery_delete(); SET ROLE service_role');
  await db.query('SELECT public.finish_password_recovery($1,$2,true)', [rollback.user, rollback.session]);
  await admin();

  await db.exec('SET ROLE anon');
  await assert.rejects(db.query('SELECT public.get_password_recovery_status()'), /permission denied/);
  await assert.rejects(db.query('SELECT public.claim_password_recovery()'), /permission denied/);
  await assert.rejects(db.query('SELECT public.finish_password_recovery($1,$2,true)', [rollback.user, rollback.session]), /permission denied/);
  await admin();
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.sessions WHERE id=$1', [foreign.session])).rows[0].n, 1, 'other staff and hotel sessions remain intact');
  for (let index = 0; index < historyTables.length; index++) assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.${historyTables[index]}`)).rows[0].n, historyCounts[index], `${historyTables[index]} history is untouched`);
  console.log('PASS password recovery: fresh email proof, all-role self scope, single use, operational session fences, failure cleanup, permissions and retained history');
}
