'use client';

import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & {
  id: string;
  label: string;
  visible: boolean;
  onVisibilityChange: () => void;
};

export function PasswordInput({ label, visible, onVisibilityChange, ...input }: PasswordInputProps) {
  return <div className="field">
    <label htmlFor={input.id}>{label}</label>
    <div className="password-input-control">
      <input {...input} type={visible ? 'text' : 'password'} />
      <button
        className="password-visibility-toggle"
        type="button"
        aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        aria-pressed={visible}
        aria-controls={input.id}
        disabled={input.disabled}
        onClick={onVisibilityChange}
      >
        {visible ? <EyeOff aria-hidden="true" size={18} strokeWidth={1.8} /> : <Eye aria-hidden="true" size={18} strokeWidth={1.8} />}
      </button>
    </div>
  </div>;
}
