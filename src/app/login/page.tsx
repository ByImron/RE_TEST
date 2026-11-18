"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
  const [submitting, setSubmitting] = useState(false);
  // "Forgot password": the same card turns into a small recovery form. The login IS
  // the person's e-mail, so recovery is one field. `sentTo` is the address the last
  // link was requested for; `cooldown` is the seconds before asking again (Supabase
  // sends one recovery e-mail per address per minute).
  const [mode, setMode] = useState<"signin" | "recover">("signin");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const handleRecover = async () => {
    setError("");
    const address = email.trim();
    if (!address) {
      setError(t.login.resetEnterEmail);
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    // For an address that has no account Supabase answers "ok" as well, so the form
    // cannot be used to find out who works here. Only real failures come back as an
    // error: too many requests, or the project has no mail sending set up -- the
    // second one used to be swallowed and the person waited for a letter that was
    // never going to come.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (resetError) {
      if (resetError.status === 429 || resetError.code === "over_email_send_rate_limit") {
        setCooldown(60);
        setError(t.login.recoverRateLimited);
      } else {
        console.error("resetPasswordForEmail failed:", resetError.message);
        setError(t.login.recoverFailed);
      }
      return;
    }
    setSentTo(address);
    setCooldown(60);
  };

  const backToSignIn = () => {
    setMode("signin");
    setError("");
    setSentTo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configured) return;
    if (mode === "recover") {
      void handleRecover();
      return;
    }
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
        <LoginHeading
          title={mode === "recover" ? t.login.recoverTitle : t.login.title}
          subtitle={mode === "recover" ? undefined : t.login.staffOnly}
        />
        {/* A deployment whose environment variables were never set: say so
            here, where the person is already looking, instead of letting the
            Supabase client throw and replace the whole screen with a blank
            error. Signing in is impossible either way, but this way the
            reason is on screen. */}
        {!configured && <SetupNotice />}
        {mode === "signin" && reasonText && (
          <p role="status" className="rounded-lg bg-[var(--wash-amber)] px-3 py-2.5 text-sm text-[var(--wash-amber-ink)]">
            {reasonText}
          </p>
        )}
        {mode === "recover" && (
          <p className="text-sm leading-relaxed text-slate-600">{t.login.recoverHint}</p>
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
        {mode === "signin" && (
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
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {mode === "recover" && sentTo && (
          <p role="status" className="rounded-lg bg-[var(--wash-emerald)] px-3 py-2.5 text-sm text-[var(--wash-emerald-ink)]">
            {t.login.recoverSentTo.replace("{email}", sentTo)}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || !configured || (mode === "recover" && cooldown > 0)}
          className="btn btn-yellow btn-lg mt-1"
        >
          {submitting
            ? t.common.loading
            : mode === "signin"
              ? t.login.submit
              : cooldown > 0
                ? t.login.recoverWait.replace("{s}", String(cooldown))
                : sentTo
                  ? t.login.recoverResend
                  : t.login.recoverSend}
        </button>
        <button
          type="button"
          disabled={!configured}
          onClick={() => {
            if (mode === "signin") {
              setMode("recover");
              setError("");
              setSentTo(null);
            } else {
              backToSignIn();
            }
          }}
          className={LOGIN_LINK}
        >
          {mode === "signin" ? t.login.forgot : `← ${t.login.recoverBack}`}
        </button>
      </LoginCard>
    </LoginShell>
  );
}
