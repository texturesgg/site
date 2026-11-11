import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Checkbox } from "@/ui/primitives";
import { color, font, text } from "@/ui/tokens.stylex";

const styles = stylex.create({
  why: { margin: 0, fontFamily: font.sans, fontSize: text.xs, color: color.muted },
});

/**
 * Review's "Display only" box for a pending release: approving with it ticked
 * makes the release a display mod, which netplay leaves out. It can't be
 * ticked when the release could change play (it replaces a game function or
 * rewrites input), and says why.
 */
export function DisplayOnly({
  releaseId,
  checked,
  onCheckedChange,
}: {
  releaseId: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const display = useQuery({
    queryKey: ["admin", "code-mod-release-display", releaseId],
    queryFn: async () => {
      const res = await api.admin["code-mods"].releases[":id"].display.$get({
        param: { id: releaseId },
      });
      if (!res.ok) throw await apiError(res);
      return res.json();
    },
  });
  if (display.data?.class === "offline") {
    return <p {...stylex.props(styles.why)}>An offline mod: off during netplay</p>;
  }
  const allowed = display.data?.allowed ?? false;
  return (
    <div>
      <Checkbox
        label="Display only"
        checked={allowed && checked}
        disabled={!allowed}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      {display.data && !allowed && display.data.why && (
        <p {...stylex.props(styles.why)}>Can't be: {display.data.why}</p>
      )}
    </div>
  );
}
