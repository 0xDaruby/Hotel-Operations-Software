// Disposable PostgreSQL-engine database. Never loads .env or contacts Supabase.
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = resolve(import.meta.dirname, '../..');
const id = (kind, n) => `${kind}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const users = { receptionist: id(0, 1), supervisor: id(0, 2), secondSupervisor: id(0, 3), owner: id(0, 4) };

export async function createUiDatabase() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_app_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,created_at timestamptz DEFAULT now());
    CREATE TABLE auth.refresh_tokens(user_id varchar,session_id uuid,revoked boolean DEFAULT false);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated, service_role;
      CREATE SCHEMA cron;
      CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, jobname text UNIQUE, schedule text, command text, active boolean DEFAULT true);
      CREATE TABLE cron.job_run_details(jobid bigint, runid bigint, start_time timestamptz, end_time timestamptz, status text, return_message text);
      CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job(jobname,schedule,command) VALUES ($1,$2,$3) RETURNING jobid $$;
      CREATE FUNCTION cron.alter_job(job_id bigint,schedule text,command text,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET schedule=$2,command=$3,active=$4 WHERE jobid=$1 $$;
    `);
    await db.exec(await readFile(resolve(root, 'supabase/bootstrap/foundation.sql'), 'utf8'));
    for (const name of (await readdir(resolve(root, 'supabase/migrations'))).filter(n => n.endsWith('.sql')).sort()) {
      const path = name.startsWith('0004_') ? 'supabase/bootstrap/repair-scheduler.sql' : `supabase/migrations/${name}`;
      const sql = (await readFile(resolve(root, path), 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pg_cron;', '-- scheduler metadata shim');
      await db.exec(sql);
    }
    const hotel = id(1, 1), category = id(2, 1);
    await db.query('INSERT INTO hotels(id,name) VALUES ($1,$2)', [hotel, 'UI validation hotel']);
    await db.query('INSERT INTO room_categories(id,property_id,name,current_rate_naira,daily_rate) VALUES ($1,$2,$3,40000,40000)', [category, hotel, 'Executive garden annex with a long category name']);
    for (const [role, user] of Object.entries(users)) {
      await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2)', [user, `${role}@example.invalid`]);
      await db.query('INSERT INTO staff_profiles(user_id,hotel_id,display_name,role) VALUES ($1,$2,$3,$4)', [user, hotel, `Test ${role}`, role === 'secondSupervisor' ? 'supervisor' : role]);
    }
    for (let n = 1; n <= 18; n++) {
      await db.query('INSERT INTO rooms(id,property_id,category_id,room_number) VALUES ($1,$2,$3,$4)', [id(3, n), hotel, category, String(100 + n)]);
      if (n <= 10) await db.query("INSERT INTO inspection_requirements(id,hotel_id,room_id,trigger,status,due_at,inspection_day,findings) VALUES ($1,$2,$3,'daily',$4,now()-interval '1 day',(now() AT TIME ZONE 'Africa/Lagos')::date,$5)", [id(4, n), hotel, id(3, n), n === 2 ? 'attention' : n === 3 ? 'access_blocked' : 'pending', n === 2 ? 'Bathroom needs another check; plumbing work is also open.' : n === 3 ? 'Guest requested a later visit.' : null]);
    }
    const as = (role, operation) => {
      if (!users[role]) throw new Error('Unknown fixture role');
      return db.transaction(async tx => {
        await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [users[role]]);
        await tx.exec('SET LOCAL ROLE authenticated');
        return operation(tx);
      });
    };
    const procedures = {
      submit_inspection: ['SELECT public.submit_inspection($1,$2,$3,$4,$5)', ['p_requirement_id','p_outcome','p_findings','p_personally_verified','p_expected_version']],
      report_maintenance_issue: ['SELECT public.report_maintenance_issue($1,$2,$3)', ['p_room_id','p_issue_type','p_detail']],
      resolve_maintenance_issue: ['SELECT public.resolve_maintenance_issue($1,$2,$3)', ['p_issue_id','p_resolution_detail','p_expected_version']],
      record_arrival: ['SELECT public.record_arrival($1,$2,$3,$4,$5)', ['p_room_id','p_guest_name','p_guest_phone','p_paid_days','p_expected_amount']],
    };
    async function rpc(role, name, input) {
      const entry = procedures[name];
      if (!entry) throw new Error('Unsupported fixture procedure');
      try { return { data: (await as(role, tx => tx.query(entry[0], entry[1].map(key => input[key])))).rows, error: null }; }
      catch (error) { return { data: null, error: { message: error.message } }; }
    }
    for (let n = 1; n <= 6; n++) {
      const result = await rpc('supervisor', 'report_maintenance_issue', { p_room_id: id(3, n), p_issue_type: n % 2 ? 'plumbing' : 'electrical', p_detail: `Fixture issue ${n}: detailed finding to test wrapping and independent maintenance blocks.` });
      if (result.error) throw new Error(result.error.message);
    }
    await rpc('supervisor', 'report_maintenance_issue', { p_room_id: id(3, 2), p_issue_type: 'furniture', p_detail: 'Second independent issue in room 102.' });
    await db.exec("UPDATE maintenance_issues SET reported_at=now()-interval '1 day'");
    return {
      rpc,
      snapshot: () => as('owner', async tx => {
        const rows = async sql => (await tx.query(sql)).rows;
        return {
          now: new Date().toISOString(),
          rooms: await rows('SELECT id,room_number,category_id,active FROM rooms ORDER BY room_number'),
          categories: await rows('SELECT id,name,daily_rate FROM room_categories'),
          inspections: await rows("SELECT i.*,r.room_number FROM inspection_requirements i JOIN rooms r ON r.id=i.room_id WHERE i.status <> 'approved' ORDER BY r.room_number"),
          issues: await rows("SELECT i.*,r.room_number FROM maintenance_issues i JOIN rooms r ON r.id=i.room_id WHERE i.status='open' ORDER BY r.room_number,i.issue_type"),
          stays: await rows("SELECT * FROM stays WHERE status='active'"),
          payments: await rows('SELECT * FROM payment_records'),
          events: await rows('SELECT id,action,room_id,actor_name,created_at FROM activity_events ORDER BY created_at DESC'),
          counts: (await rows('SELECT (SELECT count(*)::int FROM payment_records) AS payments,(SELECT count(*)::int FROM activity_events) AS events'))[0],
        };
      }),
      query: (role, table, value) => as(role, async tx => {
        if (table === 'maintenance_issues') return { data: (await tx.query('SELECT status,resolved_by,resolved_at FROM maintenance_issues WHERE id=$1', [value])).rows[0] ?? null };
        if (table === 'staff_profiles') return { data: (await tx.query('SELECT display_name FROM staff_profiles WHERE user_id=$1', [value])).rows[0] ?? null };
        throw new Error('Unsupported fixture lookup');
      }),
      close: () => db.close(),
    };
  } catch (error) { await db.close(); throw error; }
}
