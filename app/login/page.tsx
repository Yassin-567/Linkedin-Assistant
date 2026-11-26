export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark">in</span>
          <span><strong>Inlinked</strong><small>Business development workspace</small></span>
        </div>
        <div className="login-copy">
          <div className="eyebrow">YOUR WORKSPACE, IN ONE PLACE</div>
          <h1>Build better business relationships.</h1>
          <p>Manage prospects, discover opportunities and keep your outreach organised in a private workspace.</p>
        </div>
        <a className="button login-google" href="/api/auth/google">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4.1 6v5h6.6c3.9-3.6 6.1-8.8 6.1-14.7Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2C9.2 39.5 16 44 24 44Z"/><path fill="#FBBC05" d="M12.6 27.7a12 12 0 0 1 0-7.4v-5.2H5.8a20 20 0 0 0 0 17.8l6.8-5.2Z"/><path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.9 29.5 4 24 4 16 4 9.2 8.5 5.8 15.1l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg>
          Continue with Google
        </a>
        <p className="login-note">Each account has its own private records. Your workspace is not shared with other users.</p>
      </section>
      <div className="login-footer">Inlinked <span>·</span> A calmer way to manage your pipeline <span>·</span> <a href="/terms">Terms</a> <span>·</span> <a href="/privacy">Privacy</a> <span>·</span> <a href="/refund">Refunds</a></div>
    </main>
  );
}
