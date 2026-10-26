'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import type { StaffProfile, StaffRole } from '@/features/auth/staff-profile';
import { getProfileAvatarInitial } from '@/features/auth/profile-avatar';
import { createClient } from '@/lib/supabase/client';
import { XIcon } from '@/components/icons';

const roleLabels: Record<StaffRole, string> = {
  owner: 'Owner / Manager',
  receptionist: 'Receptionist',
  supervisor: 'Supervisor',
};

export function StaffProfileMenu({ profile }: { profile: StaffProfile }) {
  const router = useRouter();
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const signingOut = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const initial = getProfileAvatarInitial(profile.role);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: Event) {
      const panel = panelRef.current;
      // Reading a long profile must not dismiss its own scrollable panel.
      if (event.type === 'scroll' && event.target instanceof Node && panel?.contains(event.target)) return;
      if (panel?.matches(':popover-open')) panel.hidePopover();
    }
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);

  async function signOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    setPending(true);
    setError('');
    try {
      const result = await createClient().auth.signOut();
      if (result.error) throw result.error;
      router.replace('/login');
      router.refresh();
    } catch {
      setError('Could not sign out. Please try again.');
      signingOut.current = false;
      setPending(false);
    }
  }

  return (
    <div className="staff-profile-menu">
      <button
        ref={triggerRef}
        className="profile-trigger"
        type="button"
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Staff account: ${profile.displayName}, ${roleLabels[profile.role]}`}
        title="Staff account"
        onClick={() => { if (!open) setError(''); }}
      >
        <span className="profile-avatar" aria-hidden="true">{initial}</span>
      </button>
      <div
        ref={panelRef}
        id={id}
        popover="auto"
        className="profile-popover"
        role="dialog"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        onBeforeToggle={(event) => {
          if (event.newState !== 'open') return;
          const rect = triggerRef.current?.getBoundingClientRect();
          if (!rect || !panelRef.current) return;
          panelRef.current.style.setProperty('--profile-top', `${rect.bottom + 10}px`);
          panelRef.current.style.setProperty('--profile-right', `${Math.max(12, window.innerWidth - rect.right)}px`);
        }}
        onToggle={(event) => {
          const isOpen = event.newState === 'open';
          setOpen(isOpen);
          if (isOpen) panelRef.current?.focus({ preventScroll: true });
        }}
      >
        <div className="profile-popover-heading">
          <h2 id={`${id}-title`}>Staff account</h2>
          <button type="button" className="profile-close" popoverTarget={id} popoverTargetAction="hide" aria-label="Close staff account">
            <XIcon className="icon icon-sm" aria-hidden="true" />
          </button>
        </div>
        <div className="profile-identity">
          <span className="profile-avatar" aria-hidden="true">{initial}</span>
          <div><p className="profile-name">{profile.displayName}</p><p className="profile-role">{roleLabels[profile.role]}</p></div>
        </div>
        <div className="profile-actions">
          <button className="sign-out" type="button" onClick={signOut} disabled={pending} aria-busy={pending}>
            <LogOut className="icon icon-sm" strokeWidth={1.5} aria-hidden="true" />
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
          {error ? <p className="profile-error" role="alert">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
