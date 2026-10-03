import * as stylex from "@stylexjs/stylex";
import { createLink, Link } from "@tanstack/react-router";
import { type ComponentProps, type Ref, useState } from "react";
import { MenuIcon, UploadIcon } from "../icons";
import {
  Button,
  ButtonLink,
  IconButton,
  MenuItem,
  MenuLink,
  MenuPanel,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  Sheet,
} from "../primitives";
import { color, font, radius, space, text, tracking } from "../tokens.stylex";
import { layout } from "./layout";
import { PRIMARY_GAME_SLUG } from "@vgskins/shared";

const WIDE = "@media (min-width: 768px)";

const styles = stylex.create({
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    backgroundColor: color.bg,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
  },
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    height: "68px",
  },
  left: { display: "flex", alignItems: "center", gap: space.xl },
  logo: {
    fontFamily: font.sans,
    fontSize: text.h3,
    fontWeight: 800,
    letterSpacing: tracking.tight,
    color: color.text,
    textDecoration: "none",
    borderRadius: radius.sm,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accentText}` },
    outlineOffset: "4px",
  },
  logoAccent: { color: color.accentText },
  nav: { display: { default: "none", [WIDE]: "flex" }, alignItems: "center", gap: space.lg },
  navLink: {
    fontSize: text.md,
    fontWeight: 500,
    color: { default: color.muted, ":hover": color.text },
    textDecoration: "none",
    borderRadius: radius.sm,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accentText}` },
    outlineOffset: "4px",
  },
  navLinkActive: { color: color.text },
  right: { display: "flex", alignItems: "center", gap: space.xs },
  wideOnly: { display: { default: "none", [WIDE]: "inline-flex" } },
  narrowOnly: { display: { default: "inline-flex", [WIDE]: "none" } },
  avatar: {
    width: "24px",
    height: "24px",
    borderRadius: radius.pill,
    objectFit: "cover",
    backgroundColor: color.raise,
  },
  accountName: {
    maxWidth: "10rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  skeleton: {
    width: "96px",
    height: "44px",
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  sheetNav: { display: "flex", flexDirection: "column", paddingBottom: space.md },
  sheetLink: {
    display: "flex",
    alignItems: "center",
    minHeight: "52px",
    fontSize: text.xl,
    fontWeight: 700,
    color: color.text,
    textDecoration: "none",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: color.lineStrong,
  },
});

type AnchorProps = Omit<ComponentProps<"a">, "className" | "style"> & {
  ref?: Ref<HTMLAnchorElement>;
  /** Set by the router on the link to the current page. */
  "data-status"?: string;
};

function NavAnchor({ ref, children, ...props }: AnchorProps) {
  const active = props["data-status"] === "active";
  return (
    <a ref={ref} {...props} {...stylex.props(styles.navLink, active && styles.navLinkActive)}>
      {children}
    </a>
  );
}
const NavLink = createLink(NavAnchor);

function SheetAnchor({ ref, children, ...props }: AnchorProps) {
  return (
    <a ref={ref} {...props} {...stylex.props(styles.sheetLink)}>
      {children}
    </a>
  );
}
const SheetLink = createLink(SheetAnchor);

type SiteHeaderUser = { id: string; name: string; image?: string | null; role?: string | null };

type SiteHeaderProps = {
  user: SiteHeaderUser | null;
  isLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
};

export function SiteHeader({ user, isLoading, onSignIn, onSignOut }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const canModerate = user?.role === "moderator" || user?.role === "admin";
  const close = () => setMenuOpen(false);

  return (
    <header {...stylex.props(styles.header)}>
      <div {...stylex.props(layout.container, styles.bar)}>
        <div {...stylex.props(styles.left)}>
          <Link to="/" {...stylex.props(styles.logo)}>
            textures<span {...stylex.props(styles.logoAccent)}>.gg</span>
          </Link>
          <nav aria-label="Main" {...stylex.props(styles.nav)}>
            <NavLink to="/games/$slug" params={{ slug: PRIMARY_GAME_SLUG }}>
              Explore
            </NavLink>
            <NavLink to="/guides">Install</NavLink>
            <NavLink to="/download">App</NavLink>
          </nav>
        </div>

        <div {...stylex.props(styles.right)}>
          {isLoading ? (
            <div aria-hidden="true" {...stylex.props(styles.skeleton)} />
          ) : user ? (
            <>
              <span {...stylex.props(styles.wideOnly)}>
                <ButtonLink to="/upload" variant="primary" icon={<UploadIcon />}>
                  Upload
                </ButtonLink>
              </span>
              <MenuRoot>
                <MenuTrigger>
                  <Button
                    variant="ghost"
                    aria-label={`Account menu for ${user.name}`}
                    icon={
                      user.image ? (
                        <img src={user.image} alt="" {...stylex.props(styles.avatar)} />
                      ) : (
                        <span aria-hidden="true" {...stylex.props(styles.avatar)} />
                      )
                    }
                  >
                    <span {...stylex.props(styles.accountName, styles.wideOnly)}>{user.name}</span>
                  </Button>
                </MenuTrigger>
                <MenuPanel>
                  <MenuLink to="/users/$username" params={{ username: user.name || user.id }}>
                    Profile
                  </MenuLink>
                  <MenuLink to="/settings">Settings</MenuLink>
                  {canModerate && <MenuLink to="/admin">Moderation</MenuLink>}
                  <MenuSeparator />
                  <MenuItem onClick={onSignOut}>Sign out</MenuItem>
                </MenuPanel>
              </MenuRoot>
            </>
          ) : (
            <Button variant="ghost" onClick={onSignIn}>
              Sign in
            </Button>
          )}
          <span {...stylex.props(styles.narrowOnly)}>
            <Sheet
              open={menuOpen}
              onOpenChange={setMenuOpen}
              trigger={<IconButton label="Menu" icon={<MenuIcon />} />}
              title="Menu"
            >
              <nav aria-label="Main" {...stylex.props(styles.sheetNav)}>
                <SheetLink to="/games/$slug" params={{ slug: PRIMARY_GAME_SLUG }} onClick={close}>
                  Explore
                </SheetLink>
                <SheetLink to="/guides" onClick={close}>
                  Install guide
                </SheetLink>
                <SheetLink to="/download" onClick={close}>
                  Desktop app
                </SheetLink>
                <SheetLink to="/about" onClick={close}>
                  About
                </SheetLink>
                {user && (
                  <SheetLink to="/upload" onClick={close}>
                    Upload a pack
                  </SheetLink>
                )}
              </nav>
            </Sheet>
          </span>
        </div>
      </div>
    </header>
  );
}
