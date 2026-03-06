"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Tab = "org" | "profile" | "users";

type InviteRole = "driver" | "admin";

type OrgData = {
  id: string;
  name: string;
  org_number: string | null;
  address: string | null;
  city: string | null;
  zip_code: string | null;
};

type ProfileData = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  driver_id: string | null;
  organization_id: string;
};

export default function SettingsPage() {
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("org");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [org, setOrg] = useState<OrgData | null>(null);
  const [users, setUsers] = useState<ProfileData[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("driver");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");

  // Onboarding state
  const [setupName, setSetupName] = useState("");
  const [setupOrgName, setSetupOrgName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email ?? "");

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();

      if (prof) {
        setProfile(prof);
        const { data: o } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", prof.organization_id)
          .single();
        setOrg(o);

        const { data: allUsers } = await supabase
          .from("profiles")
          .select("*")
          .eq("organization_id", prof.organization_id)
          .order("full_name");
        setUsers(allUsers ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const { data, error } = await supabase.rpc("register_organization", {
      org_name: setupOrgName,
      user_full_name: setupName,
      user_email: userEmail,
    });
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    // Reload
    window.location.reload();
  }

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setSaving(true);
    setError("");
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const { error } = await supabase.from("organizations").update({
      name: fd.get("name") as string,
      org_number: (fd.get("org_number") as string) || null,
      address: (fd.get("address") as string) || null,
      zip_code: (fd.get("zip_code") as string) || null,
      city: (fd.get("city") as string) || null,
    }).eq("id", org.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    setSavedMsg("Sparat!");
    setTimeout(() => setSavedMsg(""), 2500);
    // Update local state
    setOrg((prev) => prev ? {
      ...prev,
      name: fd.get("name") as string,
      org_number: (fd.get("org_number") as string) || null,
      address: (fd.get("address") as string) || null,
      zip_code: (fd.get("zip_code") as string) || null,
      city: (fd.get("city") as string) || null,
    } : prev);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    setInviteMsg("");
    setError("");
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const json = await res.json();
    setInviting(false);
    if (!res.ok) {
      setError(json.error ?? "Kunde inte skicka inbjudan");
    } else {
      setInviteEmail("");
      setInviteMsg(`Inbjudan skickad till ${inviteEmail}`);
      setTimeout(() => setInviteMsg(""), 5000);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError("");
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const { error } = await supabase.from("profiles").update({
      full_name: fd.get("full_name") as string,
      phone: (fd.get("phone") as string) || null,
      driver_id: (fd.get("driver_id") as string) || null,
    }).eq("id", profile.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    setSavedMsg("Sparat!");
    setTimeout(() => setSavedMsg(""), 2500);
    setProfile((prev) => prev ? {
      ...prev,
      full_name: fd.get("full_name") as string,
      phone: (fd.get("phone") as string) || null,
      driver_id: (fd.get("driver_id") as string) || null,
    } : prev);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">Laddar...</div>
    );
  }

  // ── ONBOARDING ──────────────────────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Välkommen till Körjournal</h1>
          <p className="mt-2 text-sm text-gray-500">
            Fyll i uppgifterna nedan för att komma igång. Du kan ändra allt detta senare under Inställningar.
          </p>
        </div>
        <div className="card">
          <form onSubmit={handleSetup} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Ditt företag</p>
              <label className="label">Företagsnamn</label>
              <input
                className="input"
                required
                placeholder="Projektdirektiv AB"
                value={setupOrgName}
                onChange={(e) => setSetupOrgName(e.target.value)}
              />
            </div>
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Ditt konto</p>
              <label className="label">Ditt namn</label>
              <input
                className="input"
                required
                placeholder="Karl-Magnus Hake"
                value={setupName}
                onChange={(e) => setSetupName(e.target.value)}
              />
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? "Skapar konto..." : "Kom igång"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── SETTINGS TABS ────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string }[] = [
    { id: "org", label: "Organisation" },
    { id: "profile", label: "Min profil" },
    { id: "users", label: "Användare" },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inställningar</h1>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setError(""); setSavedMsg(""); }}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                tab === t.id
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {savedMsg && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{savedMsg}</div>
      )}

      {/* ── Organisation ── */}
      {tab === "org" && org && (
        <div className="card">
          <form onSubmit={saveOrg} className="space-y-4">
            <div>
              <label className="label">Företagsnamn</label>
              <input className="input" name="name" required defaultValue={org.name} />
            </div>
            <div>
              <label className="label">Organisationsnummer</label>
              <input className="input" name="org_number" placeholder="556000-0000" defaultValue={org.org_number ?? ""} />
            </div>
            <div>
              <label className="label">Adress</label>
              <input className="input" name="address" placeholder="Storgatan 1" defaultValue={org.address ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Postnummer</label>
                <input className="input" name="zip_code" placeholder="123 45" defaultValue={org.zip_code ?? ""} />
              </div>
              <div>
                <label className="label">Ort</label>
                <input className="input" name="city" placeholder="Stockholm" defaultValue={org.city ?? ""} />
              </div>
            </div>
            <div className="pt-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Sparar..." : "Spara"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Min profil ── */}
      {tab === "profile" && profile && (
        <div className="card">
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="label">Namn</label>
              <input className="input" name="full_name" required defaultValue={profile.full_name} />
            </div>
            <div>
              <label className="label">E-postadress</label>
              <input className="input" value={userEmail} disabled readOnly />
              <p className="mt-1 text-xs text-gray-400">E-post hanteras via inloggningen och kan inte ändras här.</p>
            </div>
            <div>
              <label className="label">Telefon</label>
              <input className="input" name="phone" type="tel" placeholder="+46 70 000 00 00" defaultValue={profile.phone ?? ""} />
            </div>
            <div>
              <label className="label">Förar-ID</label>
              <input className="input" name="driver_id" placeholder="Internt ID (valfritt)" defaultValue={profile.driver_id ?? ""} />
              <p className="mt-1 text-xs text-gray-400">Används om ni kör med flera förare i samma organisation.</p>
            </div>
            <div>
              <label className="label">Roll</label>
              <input className="input" value={profile.role === "admin" ? "Administratör" : "Förare"} disabled readOnly />
              <p className="mt-1 text-xs text-gray-400">Roll tilldelas av en administratör.</p>
            </div>
            <div className="pt-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Sparar..." : "Spara"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Användare ── */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Användare i {org?.name}</h2>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                {users.length} {users.length === 1 ? "användare" : "användare"}
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{u.full_name}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    u.role === "admin"
                      ? "bg-primary-100 text-primary-700"
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    {u.role === "admin" ? "Admin" : "Förare"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {profile.role === "admin" && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">Bjud in ny användare</h2>
              <form onSubmit={handleInvite} className="space-y-3">
                {inviteMsg && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    {inviteMsg}
                  </div>
                )}
                <div>
                  <label className="label">E-postadress</label>
                  <input
                    className="input"
                    type="email"
                    required
                    placeholder="forare@foretaget.se"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Roll</label>
                  <select
                    className="input"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as InviteRole)}
                  >
                    <option value="driver">Förare</option>
                    <option value="admin">Administratör</option>
                  </select>
                </div>
                <button type="submit" disabled={inviting} className="btn-primary">
                  {inviting ? "Skickar..." : "Skicka inbjudan"}
                </button>
                <p className="text-xs text-gray-400">
                  Personen får ett e-postmeddelande med en länk för att skapa sitt konto och kopplas automatiskt till {org?.name}.
                </p>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
