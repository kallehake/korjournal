"use client";

import { useState } from "react";
import { login, sendPasswordReset } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  async function handleReset(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await sendPasswordReset(formData);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
    } else {
      setResetSent(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-600 shadow-lg">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Körjournal</h1>
          <p className="mt-1 text-sm text-gray-500">
            Logga in i administrationspanelen
          </p>
        </div>

        {/* Card */}
        <div className="card">
          {mode === "login" ? (
            <form action={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="email" className="label">E-postadress</label>
                <input id="email" name="email" type="email" autoComplete="email" required placeholder="namn@foretag.se" className="input" />
              </div>
              <div>
                <label htmlFor="password" className="label">Lösenord</label>
                <input id="password" name="password" type="password" autoComplete="current-password" required placeholder="Ange ditt lösenord" className="input" />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loggar in...
                  </span>
                ) : "Logga in"}
              </button>
              <button type="button" onClick={() => { setMode("reset"); setError(null); }} className="w-full text-sm text-center text-primary-600 hover:underline">
                Glömt lösenord?
              </button>
            </form>
          ) : resetSent ? (
            <div className="space-y-4 text-center">
              <p className="text-green-700 font-semibold">E-post skickad!</p>
              <p className="text-sm text-gray-600">Kolla din inkorg och klicka på länken för att välja nytt lösenord.</p>
              <button onClick={() => { setMode("login"); setResetSent(false); }} className="text-sm text-primary-600 hover:underline">
                Tillbaka till inloggning
              </button>
            </div>
          ) : (
            <form action={handleReset} className="space-y-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <p className="text-sm text-gray-600">Ange din e-postadress så skickar vi en länk för att återställa lösenordet.</p>
              <div>
                <label htmlFor="reset-email" className="label">E-postadress</label>
                <input id="reset-email" name="email" type="email" autoComplete="email" required placeholder="namn@foretag.se" className="input" />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Skickar..." : "Skicka återställningslänk"}
              </button>
              <button type="button" onClick={() => { setMode("login"); setError(null); }} className="w-full text-sm text-center text-gray-500 hover:underline">
                Tillbaka till inloggning
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Kontakta din administratör om du behöver ett konto.
        </p>
      </div>
    </div>
  );
}
