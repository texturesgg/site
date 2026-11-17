import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_EMAIL } from "@/lib/config";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { ArticleSection, BulletList } from "@/ui/patterns/Article";
import { TextAnchor } from "@/ui/primitives";
import { LegalPage, legalHead } from "./-page";

export const Route = createFileRoute("/legal/privacy")({
  loader: async ({ context }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
  },
  head: () => legalHead("Privacy policy", "What textures.gg collects and why."),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <ArticleSection title="The short version">
        <p>
          We collect what the site needs to work. We don&apos;t sell it, show ads, or use
          third-party analytics.
        </p>
      </ArticleSection>

      <ArticleSection title="Your account">
        <BulletList>
          <li>
            Your email, username, and profile picture. With Discord or GitHub sign-in these come
            from that account.
          </li>
          <li>Your password, stored only as a hash, if you sign in with email.</li>
          <li>
            Each sign-in&apos;s IP address and browser, kept with the session. A session lasts up to
            7 days.
          </li>
          <li>For moderators and admins, a two-factor secret and backup codes.</li>
          <li>Anything you add to your profile, like a bio, pronouns, or social links.</li>
        </BulletList>
      </ArticleSection>

      <ArticleSection title="What you post">
        <p>
          Packs, mods, mod source, sets, comments, likes, favorites, and reports. What you post
          publicly is public. Reports are seen only by moderators.
        </p>
        <p>
          When you upload a pack, Cloudflare Turnstile checks that you&apos;re a person. It sees
          your IP address.
        </p>
      </ArticleSection>

      <ArticleSection title="Downloads">
        <p>
          We count pack downloads and first installs of mods. When you&apos;re signed in, a pack
          download is recorded with your account. Mod installs are only counted.
        </p>
      </ArticleSection>

      <ArticleSection title="Online play">
        <p>When you search for a match or join a room, the meeting point gets:</p>
        <BulletList>
          <li>your account name</li>
          <li>your rough location from Cloudflare, to pair you with nearby players</li>
          <li>your IP address, to limit how often a connection can be made</li>
          <li>
            your game&apos;s network addresses (local, public, and Tailscale), which go to the
            player you&apos;re matched with so the games can connect directly
          </li>
        </BulletList>
        <p>
          These are kept only while you&apos;re searching or in the room. When two games can&apos;t
          connect directly, the match goes through Cloudflare&apos;s relay, which sees both
          players&apos; IP addresses. We count relayed matches per account each day.
        </p>
      </ArticleSection>

      <ArticleSection title="Email">
        <p>
          We send sign-in emails (verifying your address, resetting your password) from
          noreply@textures.gg. Moderators get email about new reports. We don&apos;t send
          newsletters.
        </p>
      </ArticleSection>

      <ArticleSection title="Your browser">
        <p>
          A cookie keeps you signed in. Local storage remembers announcements you closed and an
          upload you haven&apos;t finished. There are no tracking cookies.
        </p>
      </ArticleSection>

      <ArticleSection title="Who else handles it">
        <BulletList>
          <li>
            Cloudflare runs the site, the database, file storage, email, Turnstile, matchmaking, and
            the relay. Its request logs include IP addresses.
          </li>
          <li>Discord and GitHub, when you sign in with them.</li>
        </BulletList>
      </ArticleSection>

      <ArticleSection title="Your choices">
        <p>
          You can change your profile and delete your comments any time. To get a copy of your data
          or delete your account, email{" "}
          <TextAnchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextAnchor>.
        </p>
      </ArticleSection>

      <ArticleSection title="Changes">
        <p>We&apos;ll update this page when what we collect changes.</p>
      </ArticleSection>
    </LegalPage>
  );
}
