import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';

export default function ForgotPasswordPage() {
  return <main className="login-page"><section className="login-panel"><div className="login-card">
    <p className="eyebrow">Individual staff access</p><h1>Forgot your password?</h1>
    <p className="login-help">Request a secure reset link for your staff account. This works for every role, including Owner / Manager.</p>
    <ForgotPasswordForm />
  </div></section></main>;
}
