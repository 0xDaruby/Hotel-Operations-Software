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

function lagosDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function assertRecentDatabaseTime(check, timestamp, startedAt) {
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value) || value < startedAt - 60_000 || value > Date.now() + 60_000) {
    throw new Error(`LIVE TIME SECURITY DEFECT: ${check} stored ${timestamp} after a forged p_now.`);
  }
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

async function auditInventoryAccess(accounts, category, room, failures) {
  const targets = [
    { role: 'anon', token: null },
    ...['owner', 'receptionist', 'supervisor'].map((role) => ({ role, token: accounts[role].token })),
  ];

  for (const target of targets) {
    const headers = { apikey: anonKey, Accept: 'application/json' };
    if (target.token) headers.Authorization = `Bearer ${target.token}`;
    const [categories, rooms] = await Promise.all([
      fetchJson(`${baseUrl}/rest/v1/room_categories?select=id&limit=1`, { headers }),
      fetchJson(`${baseUrl}/rest/v1/rooms?select=id&limit=1`, { headers }),
    ]);
    const assertReadable = target.role !== 'anon';
    const assertRead = assertReadable ? assertReadAvailable : assertReadDeniedOrEmpty;
    assertRead(`${target.role}->room_categories SELECT`, categories, failures);
    assertRead(`${target.role}->rooms SELECT`, rooms, failures);
    console.log(JSON.stringify({
      check: `${target.role}->inventory SELECT`,
      roomCategories: { status: categories.status, rows: Array.isArray(categories.json) ? categories.json.length : null },
      rooms: { status: rooms.status, rows: Array.isArray(rooms.json) ? rooms.json.length : null },
    }, null, 2));

    const checks = [
      {
        table: 'room_categories',
        id: category.id,
        label: `${target.role}->room_categories`,
        updateBody: { daily_rate: Number(category.daily_rate) },
        insertBody: category,
      },
      {
        table: 'rooms',
        id: room.id,
        label: `${target.role}->rooms`,
        updateBody: { room_number: room.room_number },
        insertBody: room,
      },
    ];

    for (const check of checks) {
      const update = await fetchJson(`${baseUrl}/rest/v1/${check.table}?id=eq.${check.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(check.updateBody),
      });
      assertDenied(`${check.label} UPDATE`, update, failures);

      const insert = await fetchJson(`${baseUrl}/rest/v1/${check.table}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(check.insertBody),
      });
      if (insert.status !== 401 && insert.status !== 403) {
        failures.push(`${check.label} INSERT was not denied (HTTP ${insert.status}; duplicate key is not authorization denial).`);
      }

      const deletion = await fetchJson(`${baseUrl}/rest/v1/${check.table}?id=eq.00000000-0000-0000-0000-000000000000`, {
        method: 'DELETE',
        headers: { ...headers, Prefer: 'return=representation' },
      });
      assertDenied(`${check.label} DELETE`, deletion, failures);

      console.log(JSON.stringify({
        check: check.label,
        updateStatus: update.status,
        insertStatus: insert.status,
        deleteStatus: deletion.status,
      }, null, 2));
    }
  }
}

function assertReadDeniedOrEmpty(check, response, failures) {
  const denied = response.status === 401 || response.status === 403;
  const empty = response.ok && Array.isArray(response.json) && response.json.length === 0;
  if (!denied && !empty) {
    failures.push(`${check} returned rows: ${JSON.stringify({ status: response.status, body: response.json || response.text })}`);
  }
}

function assertReadAvailable(check, response, failures) {
  if (!response.ok || !Array.isArray(response.json) || response.json.length === 0) {
    failures.push(`${check} was not available: ${JSON.stringify({ status: response.status, body: response.json || response.text })}`);
  }
}

function assertDenied(check, response, failures) {
  if (response.status !== 401 && response.status !== 403) {
    failures.push(`${check} was not denied: ${JSON.stringify({ status: response.status, body: response.json || response.text })}`);
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
  if (testData.issueId) {
    await deleteById('/rest/v1/maintenance_issues?id=eq.', testData.issueId);
  }
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

  const roomRes = await fetchJson(`${baseUrl}/rest/v1/rooms?select=*&active=eq.true`, {
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

  const catRes = await fetchJson(`${baseUrl}/rest/v1/room_categories?select=*&id=eq.${readyRoom.category_id}`, {
    method: 'GET',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
  });

  if (!catRes.ok || !Array.isArray(catRes.json) || catRes.json.length === 0) {
    throw new Error(`Failed to load category rate: ${catRes.text}`);
  }

  const category = catRes.json[0];
  const dailyRate = Number(category.daily_rate);

  testData.securityFailures = [];
  await auditInventoryAccess(accounts, category, readyRoom, testData.securityFailures);

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
    {
      name: 'owner->record_arrival',
      token: accounts.owner.token,
      func: 'record_arrival',
      params: { p_room_id: readyRoom.id, p_guest_name: 'Owner role check', p_guest_phone: '08000000000', p_paid_days: 1, p_expected_amount: dailyRate },
    },
    {
      name: 'owner->extend_stay',
      token: accounts.owner.token,
      func: 'extend_stay',
      params: { p_stay_id: crypto.randomUUID(), p_added_days: 1, p_expected_amount: dailyRate, p_expected_version: 1 },
    },
    {
      name: 'owner->confirm_departure',
      token: accounts.owner.token,
      func: 'confirm_departure',
      params: { p_stay_id: crypto.randomUUID(), p_expected_version: 1 },
    },
    {
      name: 'owner->move_stay',
      token: accounts.owner.token,
      func: 'move_stay',
      params: { p_stay_id: crypto.randomUUID(), p_to_room_id: readyRoom.id, p_reason: 'role check', p_expected_version: 1 },
    },
    {
      name: 'owner->correct_stay',
      token: accounts.owner.token,
      func: 'correct_stay',
      params: { p_stay_id: crypto.randomUUID(), p_guest_name: 'Owner role check', p_guest_phone: null, p_paid_days: 1, p_reason: 'role check', p_expected_version: 1 },
    },
    {
      name: 'owner->void_stay',
      token: accounts.owner.token,
      func: 'void_stay',
      params: { p_stay_id: crypto.randomUUID(), p_reason: 'role check', p_expected_version: 1 },
    },
    {
      name: 'owner->submit_inspection',
      token: accounts.owner.token,
      func: 'submit_inspection',
      params: { p_requirement_id: crypto.randomUUID(), p_outcome: 'approved', p_findings: 'role check', p_personally_verified: true, p_expected_version: 1 },
    },
  ];

  for (const call of blockedCalls) {
    const res = await invokeRpc(call.token, call.func, call.params);
    if (call.name === 'owner->record_arrival' && res.ok) testData.stayId = res.json;
    assertRoleGuard(call.name, res);
    console.log(JSON.stringify({ check: call.name, status: res.status, ok: res.ok, body: res.json || res.text }, null, 2));
  }

  console.log(JSON.stringify({
    check: 'category-price-change-rpc',
    status: 'not-defined',
    evidence: 'No category-price-change RPC exists in the repository migrations or application RPC call sites; no such RPC was available to invoke.',
  }, null, 2));

  console.log('\n=== valid role actions ===');
  const arrivalStartedAt = Date.now();
  const forgedNow = '2000-01-01T00:00:00.000Z';
  const validArrival = await invokeRpc(accounts.receptionist.token, 'record_arrival', {
    p_room_id: readyRoom.id,
    p_guest_name: 'Receptionist valid test',
    p_guest_phone: '08011111111',
    p_paid_days: 1,
    p_expected_amount: dailyRate,
    p_now: forgedNow,
  });
  if (!validArrival.ok || typeof validArrival.json !== 'string') {
    throw new Error(`Legitimate receptionist action failed: ${validArrival.text}`);
  }
  testData.stayId = validArrival.json;
  console.log(JSON.stringify({ check: 'receptionist->record_arrival', status: validArrival.status, ok: validArrival.ok, body: validArrival.json || validArrival.text }, null, 2));

  const [createdStay, initialPayment, arrivalEvent] = await Promise.all([
    fetchJson(`${baseUrl}/rest/v1/stays?id=eq.${testData.stayId}&select=arrival_at`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    }),
    fetchJson(`${baseUrl}/rest/v1/payment_records?stay_id=eq.${testData.stayId}&kind=eq.initial&select=received_on,created_at`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    }),
    fetchJson(`${baseUrl}/rest/v1/activity_events?stay_id=eq.${testData.stayId}&action=eq.stay.arrived&select=created_at`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    }),
  ]);
  if (!createdStay.ok || !createdStay.json?.[0] || !initialPayment.ok || !initialPayment.json?.[0] || !arrivalEvent.ok || !arrivalEvent.json?.[0]) {
    throw new Error('Unable to read back arrival timestamps for the forged-time regression check.');
  }
  try {
    assertRecentDatabaseTime('stay.arrival_at', createdStay.json[0].arrival_at, arrivalStartedAt);
    assertRecentDatabaseTime('payment_records.created_at', initialPayment.json[0].created_at, arrivalStartedAt);
    assertRecentDatabaseTime('activity_events.created_at', arrivalEvent.json[0].created_at, arrivalStartedAt);
    if (initialPayment.json[0].received_on !== lagosDate(new Date(initialPayment.json[0].created_at))) {
      throw new Error(`LIVE TIME SECURITY DEFECT: received_on ${initialPayment.json[0].received_on} does not match the database-created payment's Africa/Lagos day.`);
    }
    console.log(JSON.stringify({ check: 'forged-p_now->arrival-and-payment-use-database-time', status: 'passed' }, null, 2));
  } catch (error) {
    testData.timeRegressionError = error.message;
    console.error(error.message);
  }

  const extensionStartedAt = Date.now();
  const extension = await invokeRpc(accounts.receptionist.token, 'extend_stay', {
    p_stay_id: testData.stayId,
    p_added_days: 1,
    p_expected_amount: dailyRate,
    p_expected_version: 1,
    p_now: forgedNow,
  });
  if (!extension.ok) throw new Error(`Valid extension failed: ${extension.text}`);
  const extensionRows = await fetchJson(`${baseUrl}/rest/v1/payment_records?stay_id=eq.${testData.stayId}&kind=eq.extension&select=received_on,created_at`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
  });
  const extensionEvent = await fetchJson(`${baseUrl}/rest/v1/activity_events?stay_id=eq.${testData.stayId}&action=eq.stay.extended&select=created_at`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
  });
  if (!extensionRows.ok || !extensionRows.json?.[0] || !extensionEvent.ok || !extensionEvent.json?.[0]) {
    throw new Error('Unable to read back extension timestamps for the forged-time regression check.');
  }
  try {
    assertRecentDatabaseTime('extension payment created_at', extensionRows.json[0].created_at, extensionStartedAt);
    assertRecentDatabaseTime('stay.extended activity created_at', extensionEvent.json[0].created_at, extensionStartedAt);
    if (extensionRows.json[0].received_on !== lagosDate(new Date(extensionRows.json[0].created_at))) {
      throw new Error(`LIVE TIME SECURITY DEFECT: extension received_on ${extensionRows.json[0].received_on} does not match the database-created payment's Africa/Lagos day.`);
    }
    console.log(JSON.stringify({ check: 'forged-p_now->extension-payment-and-activity-use-database-time', status: 'passed' }, null, 2));
  } catch (error) {
    testData.timeRegressionError = testData.timeRegressionError ?? error.message;
    console.error(error.message);
  }

  const departureStartedAt = Date.now();
  const validDeparture = await invokeRpc(accounts.receptionist.token, 'confirm_departure', {
    p_stay_id: testData.stayId,
    p_expected_version: 2,
    p_now: forgedNow,
  });
  if (!validDeparture.ok) throw new Error(`Legitimate receptionist departure failed: ${validDeparture.text}`);
  const [departedStay, departureEvent, departureRequirements] = await Promise.all([
    fetchJson(`${baseUrl}/rest/v1/stays?id=eq.${testData.stayId}&select=status,departed_at`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    }),
    fetchJson(`${baseUrl}/rest/v1/activity_events?stay_id=eq.${testData.stayId}&action=eq.stay.departed&select=created_at`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    }),
    fetchJson(`${baseUrl}/rest/v1/inspection_requirements?room_id=eq.${readyRoom.id}&trigger=eq.departure&status=eq.pending&select=id,due_at,created_at`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    }),
  ]);
  if (!departedStay.ok || !departedStay.json?.[0] || !departureEvent.ok || !departureEvent.json?.[0]
    || !departureRequirements.ok || !departureRequirements.json?.[0]) {
    throw new Error('Unable to read back confirmed departure and its generated inspection requirement.');
  }
  if (departedStay.json[0].status !== 'departed') {
    throw new Error(`Departure did not end the stay: ${departedStay.json[0].status}`);
  }
  assertRecentDatabaseTime('stay.departed_at', departedStay.json[0].departed_at, departureStartedAt);
  assertRecentDatabaseTime('stay.departed activity created_at', departureEvent.json[0].created_at, departureStartedAt);
  assertRecentDatabaseTime('departure inspection due_at', departureRequirements.json[0].due_at, departureStartedAt);

  const requirementId = departureRequirements.json[0].id;
  testData.requirementId = requirementId;
  console.log(JSON.stringify({ check: 'receptionist->confirm_departure', status: validDeparture.status, ok: validDeparture.ok }, null, 2));
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

  const ownerReport = await invokeRpc(accounts.owner.token, 'report_maintenance_issue', {
    p_room_id: readyRoom.id,
    p_issue_type: 'air_conditioning',
    p_detail: 'Owner maintenance report check',
  });
  if (!ownerReport.ok || typeof ownerReport.json !== 'string') {
    throw new Error(`Legitimate owner maintenance report failed: ${ownerReport.text}`);
  }
  testData.issueId = ownerReport.json;
  console.log(JSON.stringify({ check: 'owner->report_maintenance_issue', status: ownerReport.status, ok: ownerReport.ok, body: ownerReport.json || ownerReport.text }, null, 2));

  const ownerResolve = await invokeRpc(accounts.owner.token, 'resolve_maintenance_issue', {
    p_issue_id: testData.issueId,
    p_resolution_detail: 'Owner maintenance resolution check',
    p_expected_version: 1,
  });
  if (!ownerResolve.ok) {
    throw new Error(`Legitimate owner maintenance resolution failed: ${ownerResolve.text}`);
  }
  console.log(JSON.stringify({ check: 'owner->resolve_maintenance_issue', status: ownerResolve.status, ok: ownerResolve.ok, body: ownerResolve.json || ownerResolve.text }, null, 2));

  if (testData.timeRegressionError) testData.securityFailures.push(testData.timeRegressionError);
  if (testData.securityFailures.length) {
    throw new Error(`Security audit failures:\n- ${testData.securityFailures.join('\n- ')}`);
  }
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
