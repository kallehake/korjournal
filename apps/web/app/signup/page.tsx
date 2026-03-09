"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Lösenordet måste vara minst 8 tecken.");
      return;
    }
    if (password !== password2) {
      setError("Lösenorden matchar inte.");
      return;
    }

    setLoading(true);
    const supabase = createBrowserClient();
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    // If session is returned directly (email confirmation disabled) → go to dashboard
    if (data.session) {
      router.push("/dashboard");
      return;
    }

    // Otherwise email confirmation is required
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-50 px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-green-600 shadow-lg">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Kolla din e-post</h1>
          <p className="text-gray-600">Vi har skickat en bekräftelselänk till <strong>{email}</strong>. Klicka på länken för att aktivera ditt konto.</p>
          <Link href="/login" className="text-sm text-primary-600 hover:underline">Tillbaka till inloggning</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-600 shadow-lg">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Skapa konto</h1>
          <p className="mt-1 text-sm text-gray-500">Körjournal — gratis att testa</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="email" className="label">E-postadress</label>
              <input id="email" type="email" required autoComplete="email"
                placeholder="namn@foretag.se" className="input"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="password" className="label">Lösenord</label>
              <input id="password" type="password" required autoComplete="new-password"
                placeholder="Minst 8 tecken" className="input"
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div>
              <label htmlFor="password2" className="label">Upprepa lösenord</label>
              <input id="password2" type="password" required autoComplete="new-password"
                placeholder="Samma lösenord igen" className="input"
                value={password2} onChange={e => setPassword2(e.target.value)} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Skapar konto...
                </span>
              ) : "Skapa konto"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Har du redan ett konto?{" "}
          <Link href="/login" className="text-primary-600 hover:underline">Logga in</Link>
        </p>
      </div>
    </div>
  );
}
