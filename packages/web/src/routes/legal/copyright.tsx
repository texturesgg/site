import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_EMAIL } from "@/lib/config";
import { requireFeatureFlag } from "@/lib/feature-flags";
import { ArticleSection, BulletList } from "@/ui/patterns/Article";
import { TextAnchor } from "@/ui/primitives";
import { LegalPage, legalHead } from "./-page";

export const Route = createFileRoute("/legal/copyright")({
  loader: async ({ context }) => {
    await requireFeatureFlag(context.queryClient, "codeMods");
  },
  head: () =>
    legalHead("Copyright and takedowns", "How to report your work being used on textures.gg."),
  component: Copyright,
});

const mailto = `mailto:${CONTACT_EMAIL}`;

function Copyright() {
  return (
    <LegalPage title="Copyright and takedowns">
      <ArticleSection title="Wrong or missing credit">
        <p>
          If a pack is yours but credited to someone else, or not credited, report it from the
          pack&apos;s page and we&apos;ll fix it. Packs imported from ssbmtextures.com came over
          credited to their original creators.
        </p>
      </ArticleSection>

      <ArticleSection title="Report a copyright problem">
        <p>
          If something on textures.gg uses your work without permission, email{" "}
          <TextAnchor href={mailto}>{CONTACT_EMAIL}</TextAnchor> with:
        </p>
        <BulletList>
          <li>the work you own</li>
          <li>the link to each page on textures.gg that uses it</li>
          <li>your name, address, phone number, and email</li>
          <li>
            a statement that you believe in good faith the use isn&apos;t authorized by you, your
            agent, or the law
          </li>
          <li>
            a statement, under penalty of perjury, that your notice is accurate and that you own the
            work or may act for its owner
          </li>
          <li>your physical or electronic signature</li>
        </BulletList>
        <p>
          We remove the pack or withdraw the mod and let the person who posted it know, with a copy
          of your notice.
        </p>
      </ArticleSection>

      <ArticleSection title="If your post was taken down">
        <p>
          If you think it was a mistake, or you had permission, email{" "}
          <TextAnchor href={mailto}>{CONTACT_EMAIL}</TextAnchor> with:
        </p>
        <BulletList>
          <li>the link to what was removed</li>
          <li>your name, address, phone number, and email</li>
          <li>
            a statement, under penalty of perjury, that you believe in good faith it was removed by
            mistake or misidentification
          </li>
          <li>
            a statement that you consent to the jurisdiction of the federal court for your address
            (or, outside the US, any place where SaavyLab LLC can be found), and will accept service
            from the person who sent the notice
          </li>
          <li>your physical or electronic signature</li>
        </BulletList>
        <p>
          We send it to the person who reported it. Unless they tell us they&apos;ve gone to court
          within 10 to 14 business days, we put your post back.
        </p>
      </ArticleSection>

      <ArticleSection title="Repeat infringers">
        <p>We ban accounts that keep posting other people&apos;s work.</p>
      </ArticleSection>
    </LegalPage>
  );
}
