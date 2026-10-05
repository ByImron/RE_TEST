"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import { claimSession } from "@/lib/auth/deviceSession";
import { SetupNotice } from "@/components/SetupNotice";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  LoginShell,
  LoginCard,
  LoginHeading,
  LOGIN_FIELD,
  LOGIN_LABEL,
  LOGIN_LINK,
} from "@/components/LoginShell";
import { PasswordField } from "@/components/PasswordField";

const noopSubscribe = () => () => {};

export default function LoginPage() {
  const { t } = useLocale();
  const router = useRouter();
  // Why the person is back at the sign-in screen (?reason=...): they were
  // signed out because the account was opened on another device, or because the
  // PIN was entered wrong too many times. Read without a Suspense boundary and
  // without a hydration mismatch: the server renders none.
  const reason = useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get("reason"),
    () => null
  );
  const reasonText =
    reason === "other-device" ? t.login.otherDevice : reason === "pin" ? t.login.pinLocked : "";
  // A build-time env check, constant for the whole session. Without the keys
  // the browser Supabase client throws the instant it is constructed, so this
  // screen used to render React's blank "This page couldn't load" -- with no
  // hint that the deployment is simply missing its environment variables,
  // which is exactly the state a freshly created project is in.
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetting, setResetting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configured) return;
    setSubmitting(true);
    setError("");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setSubmitting(false);
      setError(t.login.error);
      return;
    }
    // This device takes the account's one seat (any other device is signed out
    // on its next check). Never blocks: a database that is behind just skips it.
    await claimSession(supabase);
    setSubmitting(false);
    router.push("/");
    router.refresh();
  };

  return (
    <LoginShell>
      <LoginCard onSubmit={handleSubmit}>
        <LoginHeading title={t.login.title} subtitle={t.login.staffOnly} />
        {/* A deployment whose environment variables were never set: say so
            here, where the person is already looking, instead of letting the
            Supabase client throw and replace the whole screen with a blank
            error. Signing in is impossible either way, but this way the
            reason is on screen. */}
        {!configured && <SetupNotice />}
        {reasonText && (
          <p role="status" className="rounded-lg bg-[var(--wash-amber)] px-3 py-2.5 text-sm text-[var(--wash-amber-ink)]">
            {reasonText}
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={LOGIN_LABEL}>{t.login.email}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={LOGIN_FIELD}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LOGIN_LABEL}>{t.login.password}</span>
          <PasswordField
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={LOGIN_FIELD}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
        <button
          type="submit"
          disabled={submitting || !configured}
          className="btn btn-yellow btn-lg mt-1"
        >
          {submitting ? t.common.loading : t.login.submit}
        </button>
        <button
          type="button"
          disabled={resetting || !configured}
          onClick={async () => {
            setError("");
            setNotice("");
            if (!configured) return;
            if (!email.trim()) {
              setError(t.login.resetEnterEmail);
              return;
            }
            setResetting(true);
            const supabase = createClient();
            // Sends only to addresses that exist in Supabase Auth; the
            // wording never confirms whether an account exists, so the
            // form can't be used to probe for staff e-mails.
            await supabase.auth.resetPasswordForEmail(email.trim(), {
              redirectTo: `${window.location.origin}/reset-password`,
            });
            setResetting(false);
            setNotice(t.login.resetSent);
          }}
          className={LOGIN_LINK}
        >
          {t.login.forgot}
        </button>
      </LoginCard>
    </LoginShell>
  );
}
