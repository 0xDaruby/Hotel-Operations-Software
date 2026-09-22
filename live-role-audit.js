const fs = require('fs');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
);

const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  return { ok: res.ok, status: res.status, json, text };
}

function formBody(obj) {
  return new URLSearchParams(obj).toString();
}

async function createAccount(role, hotelId) {
  const email = `rolecheck-${role}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = `TestPass!${Math.floor(100000 + Math.random() * 900000)}`;

  const createUser = await fetchJson(`${baseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: `${role} test account`,
        role,
      },
    }),
  });

  if (!createUser.ok || createUser.status >= 300) {
    throw new Error(`User creation failed for ${role}: ${createUser.text}`);
  }

  const user = createUser.json;
  const profileRes = await fetchJson(`${baseUrl}/rest/v1/staff_profiles`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([
      {
        user_id: user.id,
        hotel_id: hotelId,
        display_name: `${role} test account`,
        role,
        active: true,
      },
    ]),
  });

  if (!profileRes.ok || profileRes.status >= 300) {
    throw new Error(`Profile creation failed for ${role}: ${profileRes.text}`);
  }

  const signIn = await fetchJson(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!signIn.ok || signIn.status >= 300) {
    throw new Error(`Sign in failed for ${role}: ${signIn.text}`);
  }

  return {
    role,
    email,
    password,
    userId: user.id,
    token: signIn.json.access_token,
  };
}

async function invokeRpc(token, funcName, params) {
  return fetchJson(`${baseUrl}/rest/v1/rpc/${funcName}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(params),
  });
}

function assertRoleGuard(check, response) {
  const body = response.json || {};
  const message = typeof body === 'object' && body !== null ? body.message : '';
  if (response.status !== 400 || body.code !== 'P0001' || !/role|Supervisor|reception/i.test(message)) {
    throw new Error(`LIVE SECURITY DEFECT: ${check} returned ${JSON.stringify({ status: response.status, body })}`);
  }
}

async function deleteById(path, id) {
  if (!id) return;
  const response = await fetchJson(`${baseUrl}${path}${id}`, {
    method: 'DELETE',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Cleanup failed for ${path}${id}: ${response.text}`);
}

async function cleanup(accounts, testData) {
  if (testData.requirementId) {
    await deleteById('/rest/v1/inspection_requirements?id=eq.', testData.requirementId);
  }
  if (testData.stayId) {
    await deleteById('/rest/v1/activity_events?stay_id=eq.', testData.stayId);
    await deleteById('/rest/v1/payment_records?stay_id=eq.', testData.stayId);
    await deleteById('/rest/v1/stays?id=eq.', testData.stayId);
  }

  for (const role of ['owner', 'receptionist', 'supervisor']) {
    const account = accounts[role];
    if (!account) continue;
    await deleteById('/rest/v1/activity_events?actor_id=eq.', account.userId);
    const profileDelete = await fetchJson(`${baseUrl}/rest/v1/staff_profiles?user_id=eq.${account.userId}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    });
    if (!profileDelete.ok) throw new Error(`Profile cleanup failed for ${role}: ${profileDelete.text}`);
    console.log(JSON.stringify({ action: 'delete_profile', role, status: profileDelete.status, ok: profileDelete.ok }, null, 2));

    const userDelete = await fetchJson(`${baseUrl}/auth/v1/admin/users/${account.userId}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    });
    if (!userDelete.ok) throw new Error(`Auth cleanup failed for ${role}: ${userDelete.text}`);
    console.log(JSON.stringify({ action: 'delete_user', role, status: userDelete.status, ok: userDelete.ok }, null, 2));
  }
}

async function audit(accounts, testData) {
  const hotelRes = await fetchJson(`${baseUrl}/rest/v1/hotels?select=id&limit=1`, {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    },
  });

  if (!hotelRes.ok || !Array.isArray(hotelRes.json) || hotelRes.json.length === 0) {
    throw new Error(`Unable to read hotel row: ${hotelRes.text}`);
  }

  const hotelId = hotelRes.json[0].id;
  for (const role of ['owner', 'receptionist', 'supervisor']) {
    accounts[role] = await createAccount(role, hotelId);
    console.log(JSON.stringify({ event: 'created_account', role }, null, 2));
  }

  const roomRes = await fetchJson(`${baseUrl}/rest/v1/rooms?select=id,room_number,category_id&active=eq.true`, {
    method: 'GET',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
  });

  if (!roomRes.ok || !Array.isArray(roomRes.json) || roomRes.json.length === 0) {
    throw new Error(`No rooms found: ${roomRes.text}`);
  }

  let readyRoom = null;
  for (const room of roomRes.json) {
    const activeStayRes = await fetchJson(`${baseUrl}/rest/v1/stays?select=id&room_id=eq.${room.id}&status=eq.active`, {
      method: 'GET',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    });
    const activeStayRows = activeStayRes.ok && Array.isArray(activeStayRes.json) ? activeStayRes.json : [];
    if (activeStayRows.length > 0) continue;

    const irRes = await fetchJson(`${baseUrl}/rest/v1/inspection_requirements?select=id&room_id=eq.${room.id}&status=not.eq.approved`, {
      method: 'GET',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    });
    const irRows = irRes.ok && Array.isArray(irRes.json) ? irRes.json : [];
    if (irRows.length > 0) continue;

    const maintRes = await fetchJson(`${baseUrl}/rest/v1/maintenance_issues?select=id&room_id=eq.${room.id}&status=eq.open`, {
      method: 'GET',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    });
    const maintRows = maintRes.ok && Array.isArray(maintRes.json) ? maintRes.json : [];
    if (maintRows.length > 0) continue;

    readyRoom = room;
    break;
  }

  if (!readyRoom) {
    throw new Error('No ready room available for the valid arrival test.');
  }

  const catRes = await fetchJson(`${baseUrl}/rest/v1/room_categories?select=id,daily_rate&id=eq.${readyRoom.category_id}`, {
    method: 'GET',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
  });

  if (!catRes.ok || !Array.isArray(catRes.json) || catRes.json.length === 0) {
    throw new Error(`Failed to load category rate: ${catRes.text}`);
  }

  const dailyRate = Number(catRes.json[0].daily_rate);

  console.log('\n=== blocked calls ===');
  const blockedCalls = [
    {
      name: 'receptionist->submit_inspection',
      token: accounts.receptionist.token,
      func: 'submit_inspection',
      params: { p_requirement_id: crypto.randomUUID(), p_outcome: 'approved', p_findings: 'should reject', p_personally_verified: true, p_expected_version: 1 },
    },
    {
      name: 'receptionist->report_maintenance_issue',
      token: accounts.receptionist.token,
      func: 'report_maintenance_issue',
      params: { p_room_id: readyRoom.id, p_issue_type: 'air_conditioning', p_detail: 'role check' },
    },
    {
      name: 'receptionist->resolve_maintenance_issue',
      token: accounts.receptionist.token,
      func: 'resolve_maintenance_issue',
      params: { p_issue_id: crypto.randomUUID(), p_resolution_detail: 'should reject', p_expected_version: 1 },
    },
    {
      name: 'supervisor->record_arrival',
      token: accounts.supervisor.token,
      func: 'record_arrival',
      params: { p_room_id: readyRoom.id, p_guest_name: 'Supervisor role check', p_guest_phone: '08000000000', p_paid_days: 1, p_expected_amount: dailyRate },
    },
    {
      name: 'supervisor->extend_stay',
      token: accounts.supervisor.token,
      func: 'extend_stay',
      params: { p_stay_id: crypto.randomUUID(), p_added_days: 1, p_expected_amount: dailyRate, p_expected_version: 1 },
    },
    {
      name: 'supervisor->confirm_departure',
      token: accounts.supervisor.token,
      func: 'confirm_departure',
      params: { p_stay_id: crypto.randomUUID(), p_expected_version: 1 },
    },
    {
      name: 'supervisor->void_stay',
      token: accounts.supervisor.token,
      func: 'void_stay',
      params: { p_stay_id: crypto.randomUUID(), p_reason: 'role check', p_expected_version: 1 },
    },
  ];

  for (const call of blockedCalls) {
    const res = await invokeRpc(call.token, call.func, call.params);
    assertRoleGuard(call.name, res);
    console.log(JSON.stringify({ check: call.name, status: res.status, ok: res.ok, body: res.json || res.text }, null, 2));
  }

  console.log(JSON.stringify({
    check: 'category-price-change-rpc',
    status: 'not-defined',
    evidence: 'No category-price-change RPC exists in the repository migrations or application RPC call sites; no such RPC was available to invoke.',
  }, null, 2));

  console.log('\n=== valid role actions ===');
  const validArrival = await invokeRpc(accounts.receptionist.token, 'record_arrival', {
    p_room_id: readyRoom.id,
    p_guest_name: 'Receptionist valid test',
    p_guest_phone: '08011111111',
    p_paid_days: 1,
    p_expected_amount: dailyRate,
    p_now: new Date().toISOString(),
  });
  if (!validArrival.ok || typeof validArrival.json !== 'string') {
    throw new Error(`Legitimate receptionist action failed: ${validArrival.text}`);
  }
  testData.stayId = validArrival.json;
  console.log(JSON.stringify({ check: 'receptionist->record_arrival', status: validArrival.status, ok: validArrival.ok, body: validArrival.json || validArrival.text }, null, 2));

  const reqInsert = await fetchJson(`${baseUrl}/rest/v1/inspection_requirements`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([
      {
        hotel_id: hotelId,
        room_id: readyRoom.id,
        trigger: 'daily',
        status: 'pending',
        due_at: new Date().toISOString(),
        inspection_day: new Date().toISOString().slice(0, 10),
      },
    ]),
  });

  if (!reqInsert.ok || !Array.isArray(reqInsert.json) || reqInsert.json.length === 0) {
    throw new Error(`Unable to create inspection requirement: ${reqInsert.text}`);
  }

  const requirementId = reqInsert.json[0].id;
  testData.requirementId = requirementId;
  const validSubmit = await invokeRpc(accounts.supervisor.token, 'submit_inspection', {
    p_requirement_id: requirementId,
    p_outcome: 'approved',
    p_findings: 'valid supervisor check',
    p_personally_verified: true,
    p_expected_version: 1,
  });
  if (!validSubmit.ok) {
    throw new Error(`Legitimate supervisor action failed: ${validSubmit.text}`);
  }
  console.log(JSON.stringify({ check: 'supervisor->submit_inspection', status: validSubmit.status, ok: validSubmit.ok, body: validSubmit.json || validSubmit.text }, null, 2));
}

async function main() {
  const accounts = {};
  const testData = {};
  let auditError;
  try {
    await audit(accounts, testData);
  } catch (error) {
    auditError = error;
  } finally {
    console.log('\n=== cleanup ===');
    try {
      await cleanup(accounts, testData);
    } catch (cleanupError) {
      console.error(cleanupError);
      process.exitCode = 1;
    }
  }
  if (auditError) {
    console.error(auditError);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
