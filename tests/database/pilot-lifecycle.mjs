import assert from 'node:assert/strict';

export async function verifySerializationContract(db) {
  for (const name of ['record_arrival', 'move_stay', 'report_maintenance_issue', 'submit_inspection', 'resolve_maintenance_issue', 'enqueue_daily_inspections']) {
    const { rows } = await db.query('SELECT pg_get_functiondef(oid) AS definition FROM pg_proc WHERE pronamespace=\'public\'::regnamespace AND proname=$1', [name]);
    const definition = rows[0].definition;
    assert.match(definition, /FOR NO KEY UPDATE/, `${name} must serialize room state before deciding readiness or changing blocks`);
    if (name === 'record_arrival' || name === 'move_stay') {
      assert.ok(definition.indexOf('FOR NO KEY UPDATE') < definition.indexOf('IF NOT public.room_is_ready'), `${name} checks readiness after acquiring its room lock`);
    }
    if (name === 'move_stay') {
      assert.match(definition, /ORDER BY id FOR NO KEY UPDATE/, 'moves lock rooms in a deterministic order');
      assert.ok(definition.indexOf('FOR UPDATE') < definition.indexOf('FOR NO KEY UPDATE'), 'moves lock the stay before rooms');
    }
  }
}

export async function verifyPilotLifecycle(db) {
  const hotel = '10000000-0000-0000-0000-000000000010';
  const category = '20000000-0000-0000-0000-000000000010';
  const rooms = [10, 11, 12].map(n => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`);
  const users = [10, 11, 12].map(n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`);
  await db.exec('RESET ROLE');
  await db.query('INSERT INTO public.hotels(id,name) VALUES ($1,\'Lifecycle hotel\')', [hotel]);
  await db.query('INSERT INTO public.room_categories(id,property_id,name,current_rate_naira,daily_rate) VALUES ($1,$2,\'Standard\',40000,40000)', [category, hotel]);
  for (const [index, room] of rooms.entries()) {
    await db.query('INSERT INTO public.rooms(id,property_id,category_id,room_number) VALUES ($1,$2,$3,$4)', [room, hotel, category, String(110 + index)]);
  }
  for (const [index, role] of ['receptionist', 'supervisor', 'owner'].entries()) {
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [users[index]]);
    await db.query('INSERT INTO public.staff_profiles(user_id,hotel_id,display_name,role) VALUES ($1,$2,$3,$4)', [users[index], hotel, role, role]);
  }
  async function as(index) {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [users[index]]);
    await db.exec('SET ROLE authenticated');
  }
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const counts = async () => (await db.query('SELECT (SELECT count(*) FROM public.stays) AS stays, (SELECT count(*) FROM public.payment_records) AS payments, (SELECT count(*) FROM public.activity_events) AS events')).rows[0];
  const arrive = room => scalar("SELECT public.record_arrival($1,'Pilot Guest',null,1,40000,'2000-01-01'::timestamptz)", [room]);
  await as(0);
  const before = await counts();
  const stay = await arrive(rooms[0]);
  assert.equal(await scalar('SELECT arrival_at > \'2020-01-01\'::timestamptz FROM public.stays WHERE id=$1', [stay]), true, 'caller cannot backdate arrival');
  assert.equal((await counts()).payments, before.payments + 1, 'one initial payment');
  const afterArrival = await counts();
  await assert.rejects(arrive(rooms[0]), /not ready|occupied/);
  assert.deepEqual(await counts(), afterArrival, 'failed duplicate arrival is atomic');
  await assert.rejects(db.query('SELECT public.extend_stay($1,1,40000,99)', [stay]), /changed/);
  assert.deepEqual(await counts(), afterArrival, 'stale extension leaves payment and audit unchanged');
  await db.query('SELECT public.extend_stay($1,1,40000,1)', [stay]);
  assert.equal(await scalar('SELECT paid_days FROM public.stays WHERE id=$1', [stay]), 2);
  assert.equal(await scalar('SELECT count(*) FROM public.payment_records WHERE stay_id=$1', [stay]), 2);
  await as(1);
  await assert.rejects(arrive(rooms[1]), /role cannot/);
  const issue = await scalar("SELECT public.report_maintenance_issue($1,'plumbing','Leak')", [rooms[1]]);
  await as(0);
  const blocked = await counts();
  await assert.rejects(arrive(rooms[1]), /not ready/);
  await assert.rejects(db.query("SELECT public.move_stay($1,$2,'Quieter room',2)", [stay, rooms[1]]), /not ready/);
  assert.deepEqual(await counts(), blocked, 'blocked arrival and move have no side effects');
  await assert.rejects(db.query("SELECT public.resolve_maintenance_issue($1,'Fixed',1)", [issue]), /role cannot/);
  await as(1);
  await assert.rejects(db.query("SELECT public.resolve_maintenance_issue($1,'Fixed',99)", [issue]), /changed/);
  await db.query("SELECT public.resolve_maintenance_issue($1,'Fixed',1)", [issue]);
  await as(0);
  await db.query("SELECT public.move_stay($1,$2,'Quieter room',2)", [stay, rooms[1]]);
  assert.equal(await scalar('SELECT room_id FROM public.stays WHERE id=$1', [stay]), rooms[1]);
  assert.equal(await scalar('SELECT count(*) FROM public.stay_room_moves WHERE stay_id=$1', [stay]), 1);
  const inspection = await scalar('SELECT id FROM public.inspection_requirements WHERE room_id=$1', [rooms[0]]);
  await assert.rejects(arrive(rooms[0]), /not ready/);
  await assert.rejects(db.query("SELECT public.submit_inspection($1,'approved',null,true,1)", [inspection]), /Supervisors/);
  await as(1);
  await assert.rejects(db.query("SELECT public.submit_inspection($1,'approved',null,false,1)", [inspection]), /personal verification/);
  await db.query("SELECT public.submit_inspection($1,'attention','Needs cleaning',true,1)", [inspection]);
  await assert.rejects(db.query("SELECT public.submit_inspection($1,'approved',null,true,1)", [inspection]), /updated|changed/);
  await db.query("SELECT public.submit_inspection($1,'approved',null,true,2)", [inspection]);
  await assert.rejects(db.query("SELECT public.submit_inspection($1,'approved',null,true,3)", [inspection]), /already completed/);
  await as(0);
  assert.equal(await scalar('SELECT public.room_is_ready($1)', [rooms[0]]), true);
  await db.query("SELECT public.correct_stay($1,'Corrected Guest','123',2,'Typo',3)", [stay]);
  assert.equal(await scalar('SELECT guest_name FROM public.stays WHERE id=$1', [stay]), 'Corrected Guest');
  await assert.rejects(db.query('SELECT public.confirm_departure($1,3)', [stay]), /changed/);
  await db.query('SELECT public.confirm_departure($1,4)', [stay]);
  assert.equal(await scalar('SELECT status FROM public.stays WHERE id=$1', [stay]), 'departed');
  assert.equal(await scalar('SELECT public.room_is_ready($1)', [rooms[1]]), false, 'departure leaves an inspection block');
  await assert.rejects(db.query('SELECT public.extend_stay($1,1,40000,5)', [stay]), /active stay/);
  const voidStay = await arrive(rooms[2]);
  await db.query("SELECT public.void_stay($1,'Recorded wrong guest',1)", [voidStay]);
  assert.equal(await scalar('SELECT status FROM public.stays WHERE id=$1', [voidStay]), 'void');
  assert.equal(await scalar('SELECT count(*) FROM public.payment_records WHERE stay_id=$1', [voidStay]), 1, 'void preserves original payment history');
  assert.equal(await scalar('SELECT public.room_is_ready($1)', [rooms[2]]), false, 'void leaves inspection block');
  // Force a late audit failure to prove earlier stay/payment inserts roll back.
  await db.exec(`RESET ROLE;
    CREATE FUNCTION public.test_reject_arrival_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action = 'stay.arrived' THEN RAISE EXCEPTION 'Simulated audit write failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_reject_arrival_audit BEFORE INSERT ON public.activity_events FOR EACH ROW EXECUTE FUNCTION public.test_reject_arrival_audit();`);
  await as(0);
  const beforeRollback = await counts();
  await assert.rejects(arrive(rooms[0]), /Simulated audit write failure/);
  assert.deepEqual(await counts(), beforeRollback, 'late audit failure rolls back stay and payment inserts');
  await db.exec('RESET ROLE; DROP TRIGGER test_reject_arrival_audit ON public.activity_events; DROP FUNCTION public.test_reject_arrival_audit()');
  await as(0);
  await arrive(rooms[0]);
  await db.exec('RESET ROLE; SET ROLE service_role');
  await db.exec("SELECT public.enqueue_daily_inspections('2000-01-01'::timestamptz)");
  assert.equal(await scalar("SELECT count(*) FROM public.inspection_requirements WHERE room_id=$1 AND trigger='daily' AND inspection_day=(now() AT TIME ZONE 'Africa/Lagos')::date", [rooms[0]]), 1, 'scheduler uses database day');
  assert.equal(await scalar('SELECT public.enqueue_daily_inspections()'), 0, 'scheduler is idempotent');
  await as(0);
  await assert.rejects(db.exec('SELECT public.enqueue_daily_inspections()'), /permission denied/, 'scheduler remains service-only');
  await as(2);
  await assert.rejects(arrive(rooms[0]), /role cannot/);
  await assert.rejects(db.query("SELECT public.submit_inspection($1,'approved',null,true,1)", [inspection]), /Supervisors/);
  await db.exec('RESET ROLE');
  console.log('PASS pilot lifecycle: roles, server time, arrival, stale extension, maintenance blocks, move, inspection, correction, departure, void and atomic failures');
}
