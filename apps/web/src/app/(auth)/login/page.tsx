import { LoginForm } from '@/features/auth/login-form';

type LoginPageProps = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

function safeNextPath(value?: string) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/overview';
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="Hotel operations introduction">
        <div className="login-brand-inner">
          <span className="login-mark" aria-hidden="true">X</span>
          <p className="login-kicker">XYZ Hotel / Operations</p>
          <h1>The hotel day,<br />kept in view.</h1>
          <p className="login-intro">One trusted workspace for rooms, stays, inspections, maintenance, and handovers.</p>
          <div className="login-principle"><i aria-hidden="true" /><span>Every action is tied to the staff member who performed it.</span></div>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Staff access</p>
          <h2>Welcome back</h2>
          <p className="login-help">Use the individual account provided by your Owner / Manager.</p>
          <LoginForm nextPath={safeNextPath(params.next)} reason={params.reason} />
          <p className="login-footnote">No shared logins. Access follows your assigned hotel role.</p>
        </div>
      </section>
    </main>
  );
}
