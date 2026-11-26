import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_EMAIL } from "@/lib/config";
import { ArticleSection, BulletList } from "@/ui/patterns/Article";
import { TextAnchor, TextLink } from "@/ui/primitives";
import { LegalPage, legalHead } from "./-page";

export const Route = createFileRoute("/legal/terms")({
  head: () => legalHead("Terms of service", "Terms governing your use of textures.gg."),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms of service">
      <ArticleSection title="Overview">
        <p>
          textures.gg is operated by Saavylab LLC. These terms apply to the textures.gg website, the
          desktop app, the <code>tgg</code> CLI, and our online matchmaking and relay services. By
          using any of them, you agree to these terms.
        </p>
        <p>
          textures.gg is an independent community platform and is not affiliated with Nintendo or
          HAL Laboratory. Playing with <code>tgg-melee</code> requires your own copy of Super Smash
          Bros. Melee; we do not host or distribute game ROMs or disc images.
        </p>
      </ArticleSection>

      <ArticleSection title="Accounts">
        <p>
          You can sign in with Discord, Google, GitHub, X, or an email address and password. You are
          responsible for keeping your credentials secure and for activity under your account.
          Moderators and administrators must enable two-factor authentication.
        </p>
      </ArticleSection>

      <ArticleSection title="Content and conduct">
        <p>
          You can upload texture packs, publish mods and mod sets, comment, favorite, and submit
          reports. Only upload content you created or have permission to distribute. Do not post:
        </p>
        <BulletList>
          <li>
            <strong>Unauthorized work:</strong> assets, code, or packs copied from others without
            permission or required attribution.
          </li>
          <li>
            <strong>Malicious or deceptive code:</strong> malware, obfuscated payloads, or mods that
            perform undocumented actions on a player&apos;s machine.
          </li>
          <li>
            <strong>Illegal or abusive material:</strong> illegal content, hate speech, harassment,
            or any sexual content involving minors.
          </li>
          <li>
            <strong>Spam or doxxing:</strong> automated spam, vote manipulation, or other
            people&apos;s private information.
          </li>
        </BulletList>
      </ArticleSection>

      <ArticleSection title="License to textures.gg">
        <p>
          You retain ownership of everything you upload or publish. By posting content on
          textures.gg, you grant Saavylab LLC a worldwide, non-exclusive, royalty-free license to
          host, store, build, display, and distribute it across the website, desktop app, and{" "}
          <code>tgg</code> CLI for as long as it remains on the service. Copies already downloaded
          by players are unaffected if you later remove a listing.
        </p>
        <p>
          Code mods remain subject to the software license declared in their repository; we compile
          and distribute packages under that license.
        </p>
      </ArticleSection>

      <ArticleSection title="Mods and security">
        <p>
          Every mod release is built from its committed git source and reviewed before it appears in
          the catalog. Review reduces risk but is not a security guarantee. Luau script mods run
          inside a sandbox, whereas native C mods are compiled binaries with full access to your
          system. Only install native mods from publishers you trust.
        </p>
        <p>
          In online play, gameplay mods must match across all players in a match. We may withdraw
          any release that breaks online stability, bypasses netplay checks, or creates an unfair
          competitive advantage.
        </p>
      </ArticleSection>

      <ArticleSection title="Online play">
        <p>
          When you queue for matchmaking or join a room, your account name and network addresses are
          shared with matched peers so the games can establish a direct connection (or fall back to
          a relay). Do not abuse matchmaking, intentionally desync matches, or harass other players.
        </p>
      </ArticleSection>

      <ArticleSection title="Moderation, removals, and bans">
        <p>
          We may remove content, withdraw mod releases, or suspend or terminate accounts that
          violate these terms. Withdrawn releases display the removal reason on their mod page, and
          the desktop app warns players or disables affected mods automatically.
        </p>
        <p>
          You can delete your own comments at any time. To request removal of a pack, mod, or
          account, email <TextAnchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextAnchor>.
          For copyright notices, see our{" "}
          <TextLink to="/legal/copyright">Copyright &amp; DMCA policy</TextLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="Disclaimers and liability">
        <p>
          The website, desktop app, CLI, and all community-submitted files are provided &ldquo;as
          is&rdquo; without warranties of any kind, express or implied. To the maximum extent
          permitted by law, Saavylab LLC is not liable for data loss, corrupted saves, hardware or
          software issues, or indirect damages arising from your use of the service or third-party
          downloads.
        </p>
      </ArticleSection>

      <ArticleSection title="Changes to these terms">
        <p>
          We may revise these terms as the service evolves. For material changes, we will post a
          notice on textures.gg before the updated terms take effect.
        </p>
      </ArticleSection>

      <ArticleSection title="Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <TextAnchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextAnchor>.
        </p>
      </ArticleSection>
    </LegalPage>
  );
}
