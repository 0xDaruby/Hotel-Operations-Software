import 'server-only';
import { createAdminClient } from './admin';
import { sendStaffSetupEmail } from '@/features/staff/setup-email';

export async function sendSetupEmail(admin: ReturnType<typeof createAdminClient>, userId: string, email: string, redirectTo: string) {
  await sendStaffSetupEmail(userId, email, {
    getUser: async id => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user) throw Error('Unable to check staff setup.');
      return data.user;
    },
    invite: async address => {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(address, { redirectTo });
      if (error || !data.user) throw Error('Unable to send staff invitation.');
      return data.user;
    },
    recoverLegacy: async address => {
      const { error } = await admin.auth.resetPasswordForEmail(address, { redirectTo });
      if (error) throw Error('Unable to send staff setup email.');
    },
  });
}
