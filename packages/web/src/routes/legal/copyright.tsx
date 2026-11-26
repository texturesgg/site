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
    legalHead(
      "Copyright and DMCA",
      "How to request attribution fixes or submit a DMCA takedown notice on textures.gg."
    ),
  component: Copyright,
});

const mailto = `mailto:${CONTACT_EMAIL}`;

function Copyright() {
  return (
    <LegalPage title="Copyright and DMCA">
      <ArticleSection title="Attribution fixes">
        <p>
          If one of your texture packs is missing credit or attributed to the wrong creator, use the
          report button on that pack&apos;s page and moderators will correct it. Legacy packs
          imported from ssbmtextures.com retained their original creator attributions.
        </p>
      </ArticleSection>

      <ArticleSection title="Submitting a DMCA takedown notice">
        <p>
          If content hosted on textures.gg infringes your copyright, send a written notice under 17
          U.S.C. &sect; 512(c)(3) to <TextAnchor href={mailto}>{CONTACT_EMAIL}</TextAnchor>{" "}
          including:
        </p>
        <BulletList>
          <li>identification of the copyrighted work you claim has been infringed</li>
          <li>the exact textures.gg URL(s) of the allegedly infringing pack, mod, or file</li>
          <li>your full legal name, mailing address, telephone number, and email address</li>
          <li>
            a statement that you have a good-faith belief that the disputed use is not authorized by
            the copyright owner, its agent, or the law
          </li>
          <li>
            a statement, made under penalty of perjury, that the information in your notice is
            accurate and that you are the copyright owner or authorized to act on their behalf
          </li>
          <li>your physical or electronic signature</li>
        </BulletList>
        <p>
          Upon receiving a complete notice, we will remove the pack or withdraw the mod release and
          notify the uploader with a copy of the notice.
        </p>
      </ArticleSection>

      <ArticleSection title="Submitting a counter-notice">
        <p>
          If your content was removed by mistake or misidentification, you may send a counter-notice
          under 17 U.S.C. &sect; 512(g)(3) to <TextAnchor href={mailto}>{CONTACT_EMAIL}</TextAnchor>{" "}
          including:
        </p>
        <BulletList>
          <li>the URL(s) of the material that was removed or disabled</li>
          <li>your full legal name, mailing address, telephone number, and email address</li>
          <li>
            a statement, made under penalty of perjury, that you have a good-faith belief the
            material was removed or disabled as a result of mistake or misidentification
          </li>
          <li>
            a statement that you consent to the jurisdiction of the federal district court for your
            judicial district (or, if outside the United States, any judicial district in which
            Saavylab LLC may be found), and that you will accept service of process from the person
            who submitted the original takedown notice
          </li>
          <li>your physical or electronic signature</li>
        </BulletList>
        <p>
          We forward valid counter-notices to the original claimant. Unless they notify us that they
          have filed a court action seeking to restrain the disputed activity, we will restore the
          removed content within 10 to 14 business days.
        </p>
      </ArticleSection>

      <ArticleSection title="Repeat infringers">
        <p>
          In accordance with the DMCA, Saavylab LLC terminates accounts determined to be repeat
          infringers.
        </p>
      </ArticleSection>
    </LegalPage>
  );
}
