const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function mustInclude(source, fragment, label) {
  assert.ok(source.includes(fragment), `${label} must include ${fragment}`);
}

const migration = read('supabase/migrations/0003_inspections_maintenance.sql');
mustInclude(migration, 'CREATE TABLE IF NOT EXISTS public.maintenance_issues', 'maintenance migration');
mustInclude(migration, "status text NOT NULL DEFAULT 'open'", 'maintenance migration');
mustInclude(migration, 'CREATE OR REPLACE FUNCTION public.submit_inspection(', 'inspection RPC');
mustInclude(migration, 'p_personally_verified boolean', 'inspection RPC');
mustInclude(migration, 'p_expected_version integer', 'inspection RPC');
mustInclude(migration, 'This inspection was already completed by', 'stale inspection response');
mustInclude(migration, 'CREATE OR REPLACE FUNCTION public.enqueue_daily_inspections(', 'daily inspection RPC');
mustInclude(migration, 'CREATE OR REPLACE FUNCTION public.report_maintenance_issue(', 'maintenance report RPC');
mustInclude(migration, 'CREATE OR REPLACE FUNCTION public.resolve_maintenance_issue(', 'maintenance resolve RPC');
mustInclude(migration, "mi.status = 'open'", 'room readiness rule');
mustInclude(migration, 'ALTER TABLE public.maintenance_issues ENABLE ROW LEVEL SECURITY', 'maintenance access control');

const inspectionFeature = read('apps/web/src/features/inspections/inspections.ts');
mustInclude(inspectionFeature, 'getInspectionQueue', 'inspection queue loader');
const inspectionWorkspace = read('apps/web/src/features/inspections/inspection-workspace.tsx');
mustInclude(inspectionWorkspace, 'Personally verified', 'inspection personal verification control');
mustInclude(inspectionWorkspace, 'No inspection assignments', 'shared queue policy');

const maintenanceFeature = read('apps/web/src/features/maintenance/maintenance.ts');
mustInclude(maintenanceFeature, 'getMaintenanceIssues', 'maintenance loader');
const maintenanceWorkspace = read('apps/web/src/features/maintenance/maintenance-workspace.tsx');
mustInclude(maintenanceWorkspace, 'Report issue', 'maintenance report control');
mustInclude(maintenanceWorkspace, 'does not approve cleanliness', 'maintenance separation notice');

const roomBoard = read('apps/web/src/features/inventory/room-board.tsx');
mustInclude(roomBoard, 'maintenanceIssueCountByRoomId', 'room maintenance display');
mustInclude(roomBoard, 'Inspection due', 'room inspection display');

console.log('Milestones 5 and 6 verification passed.');
