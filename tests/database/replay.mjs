// PostgreSQL-engine replay with Supabase auth and pg_cron metadata shims.
// pg_cron execution itself requires the live Supabase scheduler check.
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const { PGlite } = process.env.PGLITE_MODULE_PATH
  ? await import(pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href)
  : await import('@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_app_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated, service_role;
    CREATE SCHEMA cron;
    CREATE TABLE cron.job (jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, jobname text UNIQUE, schedule text, command text, active boolean DEFAULT true);
    CREATE TABLE cron.job_run_details (jobid bigint, runid bigint, start_time timestamptz, end_time timestamptz, status text, return_message text);
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS
      $$ INSERT INTO cron.job(jobname,schedule,command) VALUES ($1,$2,$3) RETURNING jobid $$;
    CREATE FUNCTION cron.alter_job(job_id bigint, schedule text, command text, active boolean) RETURNS void LANGUAGE sql AS
      $$ UPDATE cron.job SET schedule=$2, command=$3, active=$4 WHERE jobid=$1 $$;
  `);
  await db.exec(await readFile(resolve(root, 'supabase/bootstrap/foundation.sql'), 'utf8'));
  const migrations = (await readdir(resolve(root, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).sort();
  for (const name of migrations) {
    const file = name.startsWith('0004_') ? 'supabase/bootstrap/repair-scheduler.sql' : `supabase/migrations/${name}`;
    let sql = await readFile(resolve(root, file), 'utf8');
    if (name.startsWith('0004_')) sql = sql.replace('CREATE EXTENSION IF NOT EXISTS pg_cron;', '-- pg_cron metadata shim already created');
    await db.exec(sql);
    console.log(`PASS replay ${name}`);
  }
  await db.exec(`
    INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-000000000001');
    INSERT INTO public.hotels(id,name) VALUES ('10000000-0000-0000-0000-000000000001','Test A'),('10000000-0000-0000-0000-000000000002','Test B');
    INSERT INTO public.staff_profiles(user_id,hotel_id,display_name,role) VALUES ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Reception Test','receptionist');
    INSERT INTO public.room_categories(id,property_id,name,current_rate_naira,daily_rate) VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Standard',40000,40000);
    INSERT INTO public.rooms(id,property_id,category_id,room_number) VALUES ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','101');
    INSERT INTO public.room_categories(id,property_id,name,current_rate_naira,daily_rate) VALUES ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Standard',40000,40000);
    INSERT INTO public.rooms(id,property_id,category_id,room_number) VALUES ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','201');
    SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
    SET ROLE authenticated;
  `);
  assert.equal((await db.query('SELECT id FROM public.hotels')).rows.length, 1, 'tenant isolation');
  assert.equal((await db.query('SELECT id FROM public.rooms')).rows.length, 1, 'staff can read own inventory');
  await assert.rejects(db.exec("UPDATE public.rooms SET room_number='changed'"), /permission denied/, 'staff cannot directly alter inventory');
  if (migrations.some(name => name.startsWith('0011_'))) {
    assert.equal((await db.query("SELECT public.room_is_ready('30000000-0000-0000-0000-000000000002') AS ready")).rows[0].ready, false, 'other hotel readiness concealed');
    await assert.rejects(db.exec("SELECT public.record_arrival('30000000-0000-0000-0000-000000000002','Cross Tenant',null,1,40000)"), /not ready|belong/, 'cross hotel arrival rejected');
    await db.exec("RESET ROLE; UPDATE public.staff_profiles SET role='supervisor' WHERE user_id='00000000-0000-0000-0000-000000000001'; SET ROLE authenticated;");
    await assert.rejects(db.exec("SELECT public.report_maintenance_issue('30000000-0000-0000-0000-000000000002','other','Test')"), /belong|not found|unavailable|Select a room/, 'cross hotel maintenance rejected');
    await db.exec("RESET ROLE; UPDATE public.staff_profiles SET role='receptionist' WHERE user_id='00000000-0000-0000-0000-000000000001'; SET ROLE authenticated;");
  }
  const arrivalSql = "SELECT public.record_arrival('30000000-0000-0000-0000-000000000001','Test Guest',null,1,40000) AS id";
  const arrival = (await db.query(arrivalSql)).rows[0].id;
  assert.ok(arrival, 'arrival creates a stay');
  if (migrations.some(name => name.startsWith('0011_'))) {
    await assert.rejects(db.query("SELECT public.move_stay($1,'30000000-0000-0000-0000-000000000002','Cross Tenant',1)", [arrival]), /not ready|belong/, 'cross hotel move rejected');
  }
  assert.equal((await db.query('SELECT id FROM public.stays')).rows.length, 1, 'exactly one stay');
  assert.equal((await db.query('SELECT amount FROM public.payment_records')).rows.length, 1, 'arrival creates one payment');
  await assert.rejects(db.exec(arrivalSql), /not ready|occupied/, 'duplicate occupancy rejected');
  assert.equal((await db.query('SELECT id FROM public.payment_records')).rows.length, 1, 'rejected arrival leaves no extra payment');
  await db.exec('RESET ROLE');
  await db.exec("UPDATE public.staff_profiles SET active=false WHERE user_id='00000000-0000-0000-0000-000000000001'; SET ROLE authenticated;");
  assert.equal((await db.query('SELECT id FROM public.hotels')).rows.length, 0, 'inactive staff lose hotel access');
  assert.equal((await db.query('SELECT id FROM public.rooms')).rows.length, 0, 'inactive staff lose inventory access');
  await assert.rejects(db.exec(arrivalSql), /inactive|unavailable/, 'inactive staff cannot perform arrival RPC');
  await db.exec('RESET ROLE');
  if (migrations.some(name => name.startsWith('0010_'))) {
    await db.exec(`
      INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-000000000002','owner@example.invalid');
      INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-000000000004','foreign@example.invalid');
      INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES ('00000000-0000-0000-0000-000000000003','new@example.invalid','{"provisioned_by":"00000000-0000-0000-0000-000000000002"}');
      INSERT INTO public.staff_profiles(user_id,hotel_id,display_name,role) VALUES ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Owner Test','owner');
      INSERT INTO public.staff_profiles(user_id,hotel_id,display_name,role) VALUES ('00000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','Foreign Staff','supervisor');
      SET ROLE authenticated;
    `);
    await assert.rejects(db.exec('SELECT public.get_managed_staff()'), /owner access/, 'inactive receptionist cannot administer staff');
    await db.exec("RESET ROLE; UPDATE public.staff_profiles SET active=true WHERE user_id='00000000-0000-0000-0000-000000000001'; SET ROLE authenticated;");
    await assert.rejects(db.exec('SELECT public.get_managed_staff()'), /owner access/, 'active receptionist cannot administer staff');
    await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)");
    await db.exec("SELECT public.provision_staff_profile('00000000-0000-0000-0000-000000000003','New Staff','supervisor')");
    assert.equal((await db.query('SELECT * FROM public.get_managed_staff()')).rows.length, 3, 'owner staff directory');
    await assert.rejects(db.exec("SELECT public.set_staff_active('00000000-0000-0000-0000-000000000004',true,false,'Foreign hotel')"), /cannot be changed/, 'owner cannot change staff in another hotel');
    await assert.rejects(db.exec("SELECT public.set_staff_active('00000000-0000-0000-0000-000000000003',false,true,'Ready')"), /password setup/, 'pending account cannot be activated early');
    await assert.rejects(db.exec("SELECT public.finish_staff_setup('00000000-0000-0000-0000-000000000003')"), /permission denied/, 'client cannot bypass setup');
    await db.exec("RESET ROLE; SELECT public.finish_staff_setup('00000000-0000-0000-0000-000000000003'); SET ROLE authenticated;");
    await db.exec("SELECT public.set_staff_active('00000000-0000-0000-0000-000000000003',true,false,'Test offboarding')");
    await db.exec("SELECT public.set_staff_active('00000000-0000-0000-0000-000000000001',true,false,'Legacy account offboarding')");
    await db.exec("SELECT public.set_staff_active('00000000-0000-0000-0000-000000000001',false,true,'Legacy account restored')");
    await assert.rejects(db.exec("SELECT public.set_staff_active('00000000-0000-0000-0000-000000000003',true,false,'Stale state')"), /changed/, 'stale activation state rejected');
    await assert.rejects(db.exec("SELECT public.set_staff_active('00000000-0000-0000-0000-000000000002',true,false,'Self')"), /cannot be changed/, 'owner cannot disable self');
    await db.exec('RESET ROLE');
    await db.exec(`
      INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES ('00000000-0000-0000-0000-000000000005','cancel@example.invalid','{"provisioned_by":"00000000-0000-0000-0000-000000000002"}');
      SET ROLE authenticated;
      SELECT public.provision_staff_profile('00000000-0000-0000-0000-000000000005','Cancelled Setup','receptionist');
    `);
    await assert.rejects(db.exec("SELECT public.cancel_staff_setup('00000000-0000-0000-0000-000000000005','')"), /reason/, 'cancellation requires reason');
    await db.exec("SELECT public.cancel_staff_setup('00000000-0000-0000-0000-000000000005','Invitation withdrawn')");
    await assert.rejects(db.exec("SELECT public.set_staff_active('00000000-0000-0000-0000-000000000005',false,true,'Bypass cancellation')"), /password setup/, 'cancelled setup cannot activate');
    await db.exec('RESET ROLE; SET ROLE service_role');
    await assert.rejects(db.exec("SELECT public.finish_staff_setup('00000000-0000-0000-0000-000000000005')"), /No pending/, 'old setup link cannot complete cancelled setup');
    await db.exec('RESET ROLE');
    const cancelled = (await db.query("SELECT active,setup_pending FROM public.staff_profiles WHERE user_id='00000000-0000-0000-0000-000000000005'")).rows[0];
    assert.deepEqual(cancelled, { active: false, setup_pending: false });
    assert.equal((await db.query("SELECT count(*) AS total FROM public.activity_events WHERE action='staff.setup_cancelled'")).rows[0].total, 1, 'cancellation is attributed once');
    console.log('PASS cancelled setup remains inactive and cannot complete through stale links');
    console.log('PASS staff provisioning, setup gate, client bypass denial, activation, stale state and owner self-protection');
  }
  const job = (await db.query("SELECT schedule,command FROM cron.job WHERE jobname='daily-inspections'")).rows;
  assert.equal(job.length, 1);
  assert.equal(job[0].schedule, '0 7 * * *');
  console.log('PASS tenant isolation, inventory write denial, atomic arrival, duplicate occupancy, inactive read/RPC access denial, scheduler metadata');
  console.log('LIMIT: cron functions are shims; actual scheduled execution requires Supabase verification.');
} finally {
  await db.close();
}
