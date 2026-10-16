import assert from 'node:assert/strict';

/** Isolated fixture proves aggregate completeness, hotel isolation and day bounds. */
export async function verifyOwnerStatistics(db) {
  const owner = 'a0000000-0000-0000-0000-000000000001';
  const hotel = 'a1000000-0000-0000-0000-000000000001';
  const otherHotel = 'a1000000-0000-0000-0000-000000000002';
  const category = 'a2000000-0000-0000-0000-000000000001';
  const room = 'a3000000-0000-0000-0000-000000000001';
  const stay = 'a4000000-0000-0000-0000-000000000001';
  await db.exec('RESET ROLE; BEGIN');
  try {
    await db.exec(`
      INSERT INTO auth.users(id) VALUES ('${owner}');
      INSERT INTO public.hotels(id,name) VALUES ('${hotel}','Aggregate Test'),('${otherHotel}','Other Aggregate Test');
      INSERT INTO public.staff_profiles(user_id,hotel_id,display_name,role) VALUES ('${owner}','${hotel}','Aggregate Owner','owner');
      INSERT INTO public.room_categories(id,property_id,name,current_rate_naira,daily_rate) VALUES ('${category}','${hotel}','Aggregate',40000,40000);
      INSERT INTO public.rooms(id,property_id,category_id,room_number) VALUES ('${room}','${hotel}','${category}','Aggregate 101');
      INSERT INTO public.stays(id,hotel_id,room_id,category_id,guest_name,original_daily_rate,arrival_at,departure_due_at,paid_days,created_by)
        VALUES ('${stay}','${hotel}','${room}','${category}','Test Guest',40000,'2026-10-15T12:00Z','2026-10-16T16:00Z',1,'${owner}');
      INSERT INTO public.payment_records(stay_id,hotel_id,kind,amount,received_on,created_by,created_by_name)
        SELECT '${stay}','${hotel}','initial',40000,'2026-10-16','${owner}','Aggregate Owner' FROM generate_series(1,1201);
      INSERT INTO public.payment_records(stay_id,hotel_id,kind,amount,received_on,created_by,created_by_name)
        VALUES ('${stay}','${hotel}','extension',50000,'2026-10-15','${owner}','Aggregate Owner');
      INSERT INTO public.activity_events(hotel_id,actor_id,actor_name,action,created_at)
        SELECT '${hotel}','${owner}','Aggregate Owner','stay.arrived','2026-10-16T12:00Z' FROM generate_series(1,1201);
      INSERT INTO public.activity_events(hotel_id,actor_id,actor_name,action,created_at)
        VALUES ('${hotel}','${owner}','Aggregate Owner','stay.departed','2026-10-15T23:00Z'),
          ('${hotel}','${owner}','Aggregate Owner','stay.departed','2026-10-16T23:00Z'),
          ('${otherHotel}','${owner}','Aggregate Owner','stay.arrived','2026-10-16T12:00Z');
      SELECT set_config('request.jwt.claim.sub','${owner}',true);
      SET LOCAL ROLE authenticated;
    `);
    const read = async () => (await db.query("SELECT public.get_owner_statistics('2026-10-16','2026-10-16T12:00Z') AS result")).rows[0].result;
    const expected = {
      paymentTotals: { today: 48040000, yesterday: 50000 },
      movement: { arrivals: 1201, departures: 1, extensions: 0, departuresDueSoon: 1, initialPayments: 48040000, extensionPayments: 0 },
    };
    assert.deepEqual(await read(), expected, 'aggregates exceed API row cap, respect hotel and Lagos inclusive/exclusive boundaries');
    await db.exec(`RESET ROLE; UPDATE public.stays SET status='void' WHERE id='${stay}'; SET LOCAL ROLE authenticated`);
    const voided = await read();
    assert.deepEqual(voided.paymentTotals, { today: 0, yesterday: 0 }, 'voided stays never contribute revenue');
    assert.equal(voided.movement.arrivals, 1201, 'audit movements are preserved after voiding');
    assert.equal(voided.movement.departuresDueSoon, 0);
    await db.exec(`RESET ROLE; UPDATE public.staff_profiles SET active=false WHERE user_id='${owner}'; SET LOCAL ROLE authenticated`);
    await db.exec('SAVEPOINT denied');
    await assert.rejects(read(), /owner access/, 'inactive owner denied');
    await db.exec('ROLLBACK TO SAVEPOINT denied; RESET ROLE');
    await db.exec(`UPDATE public.staff_profiles SET active=true,role='receptionist' WHERE user_id='${owner}'; SET LOCAL ROLE authenticated; SAVEPOINT denied_reception`);
    await assert.rejects(read(), /owner access/, 'receptionist denied');
    await db.exec('ROLLBACK TO SAVEPOINT denied_reception; RESET ROLE; SET LOCAL ROLE anon; SAVEPOINT denied_anon');
    await assert.rejects(read(), /permission denied/, 'anonymous execution denied');
    await db.exec('ROLLBACK TO SAVEPOINT denied_anon');
    console.log('PASS owner aggregates: 1201 payments/events, tenant isolation, void exclusion, Lagos boundaries, inactive/role/anonymous denial');
  } finally {
    await db.exec('ROLLBACK; RESET ROLE');
  }
}
