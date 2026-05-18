# Supabase Auth — Email templates

Phase 5 uses `supabase.auth.signInWithOtp()` to send magic-link emails
for both the claim and transfer flows. The email body is rendered by
Supabase Auth itself from a template configured in the dashboard
(Project → Authentication → Email Templates).

These templates are **not** version-controlled inside the repo — they
live in the hosted Supabase project and are edited via the dashboard.
The strings below are the operator-approved bodies for the
`Magic Link` template, kept here so re-applying them after a project
re-link is a copy/paste away.

## Subject (Magic Link)

```
Authentifiez-vous sur Nachi3D Certify · Sign in to Nachi3D Certify · سجِّل الدخول إلى Nachi3D Certify
```

The trilingual subject keeps the email scannable for FR/EN/AR
inboxes; the bodies of the claim and transfer flows are localized via
the magic-link redirect target (the user lands on
`/[locale]/claim/[token]` or `/[locale]/transfer/[token]` in their
chosen locale).

## Body (Magic Link — HTML)

```html
<table style="font-family:Inter,system-ui,sans-serif;color:#1a1a1a;line-height:1.5">
  <tr><td>
    <h2 style="font-family:'Cormorant Garamond',serif;font-weight:300;font-size:22px;margin:0 0 16px">
      Nachi3D Certify
    </h2>

    <p style="margin:0 0 8px">
      🇫🇷 Cliquez sur le lien ci-dessous dans l'heure pour finaliser votre action sur Nachi3D Certify.
    </p>
    <p style="margin:0 0 8px">
      🇬🇧 Click the link below within the next hour to complete your action on Nachi3D Certify.
    </p>
    <p style="margin:0 0 16px" dir="rtl">
      🇲🇦 انقر على الرابط أدناه خلال ساعة لإتمام العملية على Nachi3D Certify.
    </p>

    <p style="margin:24px 0">
      <a href="{{ .ConfirmationURL }}"
         style="background:#b87b00;color:#fff;padding:12px 18px;border-radius:2px;text-decoration:none;font-weight:500">
        Continuer · Continue · المتابعة
      </a>
    </p>

    <p style="font-size:12px;color:#666;margin-top:32px">
      Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail. ·
      If you did not request this, ignore the email. ·
      إذا لم تطلب ذلك، تجاهل هذا البريد.
    </p>
  </td></tr>
</table>
```

The `{{ .ConfirmationURL }}` placeholder is replaced by Supabase with
the magic-link URL that includes the `emailRedirectTo` passed by the
server action — `/auth/callback?next=/[locale]/{claim,transfer}/[token]`.

## Operator workflow

1. Sign in to the Supabase dashboard for the production project.
2. Navigate to **Authentication → Email Templates → Magic Link**.
3. Set the subject and body to the strings above (copy-paste from this
   file).
4. Save. Send a test email to your own inbox via the dashboard's
   "Send test email" button.
5. Visit any unclaimed piece's `/v/[uid]?t=<token>` and click "Claim
   this piece" with your own email to confirm the live trigger fires.

## Trilingual landing pages

Because the magic-link email cannot know the user's locale (Supabase
sends the same template to every recipient), the operator-approved
template surfaces FR/EN/AR in the body. The landing page they reach
*after* clicking is localized: the redirect URL embeds
`/[locale]/...` where `locale` is the locale the user was browsing in
when they submitted the form.

## Supabase Auth SMTP — sanity check

If magic-link emails stop arriving:

- **Brevo dashboard** (Statistics → Transactional) — look for the
  Supabase sender (`noreply@nachi3dlabs.com`). A delivery in the last
  hour means SMTP is fine and the failure is upstream of Brevo.
- **Supabase dashboard** (Authentication → Logs) — failures here mean
  the SMTP creds are wrong or the rate limit was hit.
- **`.env.local`** — the runtime never sends mail directly, but if
  `signInWithOtp` returns `{ error }` in `/api/{claim,transfer}/initiate`
  the route logs it. Watch the dev server stderr.
