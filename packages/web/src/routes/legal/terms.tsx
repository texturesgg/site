import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_EMAIL } from "@/lib/config";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { ArticleSection, BulletList } from "@/ui/patterns/Article";
import { TextAnchor, TextLink } from "@/ui/primitives";
import { LegalPage, legalHead } from "./-page";

export const Route = createFileRoute("/legal/terms")({
  loader: async ({ context }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
  },
  head: () => legalHead("Terms of service", "The terms for using textures.gg."),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms of service">
      <ArticleSection title="Who we are">
        <p>
          textures.gg is run by Saavylab LLC. These terms cover the website, the textures.gg app,
          the tgg command line tool, and the online play they offer. By using any of them you agree
          to these terms.
        </p>
        <p>
          textures.gg isn&apos;t affiliated with Nintendo or HAL Laboratory. You need your own copy
          of Super Smash Bros. Melee. We don&apos;t host or share the game.
        </p>
      </ArticleSection>

      <ArticleSection title="Your account">
        <p>
          You can sign in with Discord, GitHub, or an email and password. Keep your sign-in safe.
          You&apos;re responsible for what happens on your account. Moderators and admins also need
          two-factor sign-in.
        </p>
      </ArticleSection>

      <ArticleSection title="What you can post">
        <p>
          You can upload texture packs, publish mods and sets, comment, like, and report things.
          Only post what you made or have permission to share. Don&apos;t post:
        </p>
        <BulletList>
          <li>someone else&apos;s work without their permission</li>
          <li>malware, or a mod that does something it doesn&apos;t say it does</li>
          <li>anything illegal, hateful, or sexual involving minors</li>
          <li>harassment, spam, or other people&apos;s private information</li>
        </BulletList>
      </ArticleSection>

      <ArticleSection title="What you let us do with it">
        <p>
          You keep ownership of what you post. You give Saavylab LLC a worldwide, non-exclusive,
          royalty-free license to host, store, copy, build, show, and distribute it, so the site,
          the app, and tgg can offer it to players. The license lasts while it&apos;s on
          textures.gg. Copies players already downloaded stay theirs to use.
        </p>
        <p>
          A mod&apos;s source keeps the license you publish it under. We build and distribute it
          under that license.
        </p>
      </ArticleSection>

      <ArticleSection title="Mods">
        <p>
          Every mod release is reviewed before it&apos;s listed. Review lowers the risk but
          isn&apos;t a guarantee. Mods change how the game runs on your computer, and native mods
          are compiled code that can do anything a program can. Install what you trust.
        </p>
        <p>
          Gameplay mods have to match between players in online play. If a mod gives an unfair
          advantage or breaks matches, we can withdraw it.
        </p>
      </ArticleSection>

      <ArticleSection title="Online play">
        <p>
          When you search for a match or join a room, the player you&apos;re matched with gets your
          account name and your game&apos;s network address, so the two games can connect. Play fair
          and treat other players well.
        </p>
      </ArticleSection>

      <ArticleSection title="Removals and bans">
        <p>
          We can remove posts, withdraw mod releases, and suspend or ban accounts that break these
          terms, for a set time or for good. A withdrawn mod shows why on its page, and the app
          turns it off or warns you. You can delete your own comments. To remove a pack, a mod, or
          your account, email{" "}
          <TextAnchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextAnchor>.
        </p>
        <p>
          To report someone using your work, see the{" "}
          <TextLink to="/legal/copyright">copyright page</TextLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="No warranty">
        <p>
          textures.gg, the app, tgg, and everything on them are provided as they are, without
          warranties. Saavylab LLC isn&apos;t liable for lost data, broken saves, or other damage
          from using them or anything downloaded from them, as far as the law allows.
        </p>
      </ArticleSection>

      <ArticleSection title="Changes">
        <p>
          We may update these terms. When we make a big change we&apos;ll say so on the site before
          it takes effect.
        </p>
      </ArticleSection>

      <ArticleSection title="Contact">
        <p>
          <TextAnchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextAnchor>
        </p>
      </ArticleSection>
    </LegalPage>
  );
}
