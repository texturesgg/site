import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_EMAIL } from "@/lib/config";
import { ArticleSection, BulletList } from "@/ui/patterns/Article";
import { TextAnchor } from "@/ui/primitives";
import { LegalPage, legalHead } from "./-page";

export const Route = createFileRoute("/legal/privacy")({
  head: () => legalHead("Privacy policy", "What data textures.gg collects and how it is used."),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <ArticleSection title="Summary">
        <p>
          textures.gg collects only the data required to run accounts, hosting, mod builds, and
          online matchmaking. We do not sell user data, run third-party ad networks, or embed
          third-party analytics trackers.
        </p>
      </ArticleSection>

      <ArticleSection title="Account information">
        <BulletList>
          <li>
            <strong>Identity:</strong> your email address, username, and avatar. When you sign in
            with Discord, Google, GitHub, or X, these come from that OAuth provider.
          </li>
          <li>
            <strong>Linked X account:</strong> if you sign in with or link X, we store the handle X
            returns for that account, even if it differs from your textures.gg username.
          </li>
          <li>
            <strong>Credentials and sessions:</strong> email/password sign-ins store a salted
            password hash only. Active sessions record the client IP address and user agent and
            expire after up to 7 days.
          </li>
          <li>
            <strong>Two-factor authentication:</strong> for moderators and admins, an encrypted TOTP
            secret and recovery backup codes.
          </li>
          <li>
            <strong>Profile fields:</strong> optional bio, pronouns, and social links you add
            yourself.
          </li>
        </BulletList>
      </ArticleSection>

      <ArticleSection title="Submissions and moderation">
        <p>
          We store the packs, mods, git source repositories, sets, comments, likes, favorites, and
          moderation reports you submit. Public listings and comments are visible to everyone;
          reports are visible only to moderators.
        </p>
        <p>
          Pack uploads use Cloudflare Turnstile for bot protection, which processes your IP address
          during verification.
        </p>
      </ArticleSection>

      <ArticleSection title="Download counts">
        <p>
          We track pack download counts and first-time mod install counts. Signed-in pack downloads
          are associated with your account to deduplicate counts; mod install counts are stored
          without linking them to individual accounts.
        </p>
      </ArticleSection>

      <ArticleSection title="Online matchmaking and relay">
        <p>When you queue for a match or join a room, the matchmaking service receives:</p>
        <BulletList>
          <li>
            <strong>Account name:</strong> shown to the opponent or room members.
          </li>
          <li>
            <strong>Approximate region:</strong> coarse location from Cloudflare to match nearby
            players for lower latency.
          </li>
          <li>
            <strong>IP address:</strong> used for connection rate limiting.
          </li>
          <li>
            <strong>Network endpoints:</strong> your game&apos;s local, public, and Tailscale
            addresses, exchanged with matched peers for direct UDP hole-punching.
          </li>
        </BulletList>
        <p>
          Matchmaking state is ephemeral and held only while you are queued or in a room. When a
          direct peer-to-peer connection cannot be established, traffic falls back to Cloudflare
          TURN relays, which see both players&apos; IP addresses. We record daily per-account relay
          usage counts for abuse prevention.
        </p>
      </ArticleSection>

      <ArticleSection title="Competition voting">
        <p>When you vote in a mod competition, each ballot stores:</p>
        <BulletList>
          <li>your account ID, selected mod, and timestamp</li>
          <li>account age at vote time and sign-in method</li>
          <li>your linked X account ID and handle, if linked</li>
          <li>
            a one-way hash of your IP address (not reversible to the original IP) and your country
            code from Cloudflare
          </li>
          <li>
            whether you confirmed following @texturesgg (self-attested; not verified against X)
          </li>
        </BulletList>
        <p>
          Aggregate vote totals are public. Individual ballots are accessible only to administrators
          for fraud and sockpuppet review, and are deleted 90 days after winners are announced.
        </p>
      </ArticleSection>

      <ArticleSection title="Email">
        <p>
          Transactional emails (email verification and password resets) are sent from{" "}
          <code>noreply@textures.gg</code>. Moderators also receive notifications for new reports.
          We do not send marketing or newsletter emails.
        </p>
      </ArticleSection>

      <ArticleSection title="Cookies and local storage">
        <p>
          We set a session cookie to keep you signed in and use browser local storage to remember
          dismissed announcements and in-progress upload drafts. We do not use advertising or
          cross-site tracking cookies.
        </p>
      </ArticleSection>

      <ArticleSection title="Infrastructure and sub-processors">
        <BulletList>
          <li>
            <strong>Cloudflare:</strong> hosts the web app, API, D1 database, R2 storage, email
            routing, Turnstile, matchmaking Workers, and TURN relays. Standard request logs include
            IP addresses.
          </li>
          <li>
            <strong>OAuth providers:</strong> Discord, Google, GitHub, and X, only when you choose
            to sign in with or link them.
          </li>
        </BulletList>
      </ArticleSection>

      <ArticleSection title="Data access and deletion">
        <p>
          You can edit your profile and delete your comments directly on the site. To request a copy
          of your data or permanent account deletion, email{" "}
          <TextAnchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextAnchor>.
        </p>
      </ArticleSection>

      <ArticleSection title="Policy updates">
        <p>We will update this policy whenever our data handling practices change.</p>
      </ArticleSection>
    </LegalPage>
  );
}
