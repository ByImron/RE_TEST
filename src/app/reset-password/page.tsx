"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { claimSession } from "@/lib/auth/deviceSession";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { BackLink } from "@/components/BackLink";
import {
  LoginShell,
  LoginCard,
  LoginHeading,
  LOGIN_FIELD,
  LOGIN_LABEL,
} from "@/components/LoginShell";
import { PasswordField } from "@/components/PasswordField";

// Lands here from the password-recovery e-mail. Supabase exchanges the
// token from the link for a temporary session automatically on page load;
// all this page does is take a new password twice and call updateUser.
// If there's no session (stale or reused link), it says so instead of
// failing silently.
export default function ResetPasswordPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // The recovery token in the URL is processed asynchronously; poll a few
    // times before declaring the link dead.
    let tries = 0;
    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        setReady(true);
        return;
      }
      tries += 1;
      if (tries < 10) setTimeout(check, 400);
      else setReady(false);
    };
    check();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return;
    if (password !== password2) {
      setError(t.login.resetMismatch);
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      return;
    }
    // Following the e-mailed link is a sign-in, so this device takes the account's
    // one seat, exactly as the login form does. Without it the next session check
    // finds a seat held by some other device (or none of ours) and signs the person
    // straight back out with "you signed in on another device".
    await claimSession(supabase);
    setSubmitting(false);
    router.replace("/");
    router.refresh();
  };

  return (
    <LoginShell>
      <LoginCard onSubmit={handleSubmit}>
        <LoginHeading title={t.login.resetTitle} />

        {ready === null && <p className="text-sm text-slate-500">{t.common.loading}</p>}

        {ready === false && (
          <>
            <p className="text-sm text-red-600">{t.login.resetNoSession}</p>
            <BackLink href="/login" replace>
              {t.login.title}
            </BackLink>
          </>
        )}

        {ready === true && (
          <>
            <p className="text-sm text-slate-600">{t.login.resetHint}</p>
            <label className="flex flex-col gap-1.5">
              <span className={LOGIN_LABEL}>{t.login.password}</span>
              <PasswordField
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={LOGIN_FIELD}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LOGIN_LABEL}>{t.login.resetPassword2}</span>
              <PasswordField
                required
                minLength={6}
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className={LOGIN_FIELD}
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting || password.length < 6}
              className="btn btn-yellow btn-lg mt-1"
            >
              {submitting ? t.login.resetDone : t.login.resetSubmit}
            </button>
          </>
        )}
      </LoginCard>
    </LoginShell>
  );
}
