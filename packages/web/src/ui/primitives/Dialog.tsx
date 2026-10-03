import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { CloseIcon } from "../icons";
import { color, font, radius, space, text } from "../tokens.stylex";
import { Button, IconButton } from "./Button";
import { shared } from "./shared";

const styles = stylex.create({
  backdrop: { position: "fixed", inset: 0, backgroundColor: color.scrim },
  dialogPopup: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(480px, calc(100vw - 32px))",
    maxHeight: "calc(100dvh - 32px)",
    overflowY: "auto",
    padding: space.lg,
    borderRadius: radius.xl,
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.md },
  title: {
    margin: 0,
    fontFamily: font.sans,
    fontSize: text.h3,
    fontWeight: 800,
    color: color.text,
  },
  description: {
    margin: 0,
    marginTop: space.xs,
    fontSize: text.md,
    lineHeight: 1.5,
    color: color.muted,
  },
  body: { marginTop: space.md },
  fullscreenPopup: {
    position: "fixed",
    inset: 0,
    // Above the sticky site header.
    zIndex: 120,
    height: "100dvh",
    overflow: "hidden",
    overscrollBehavior: "none",
    touchAction: "none",
    backgroundColor: color.bg,
  },
  sheetViewport: { position: "fixed", inset: 0, display: "flex", alignItems: "flex-end" },
  sheetPopup: {
    width: "100%",
    maxHeight: "85dvh",
    display: "flex",
    flexDirection: "column",
    borderRadius: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderBottomWidth: 0,
    transform: "translateY(var(--drawer-swipe-movement-y, 0px))",
  },
  handle: {
    width: "40px",
    height: "4px",
    marginInline: "auto",
    marginTop: space.xs,
    borderRadius: radius.pill,
    backgroundColor: color.lineStrong,
  },
  sheetHeader: { paddingBlock: space.xs, paddingInline: space.md },
  sheetContent: { flexGrow: 1, overflowY: "auto", paddingInline: space.md },
  sheetFooter: {
    display: "flex",
    gap: space.xs,
    paddingTop: space.sm,
    paddingInline: space.md,
    paddingBottom: `max(${space.lg}, env(safe-area-inset-bottom))`,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: color.lineStrong,
  },
});

type OverlayProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional trigger element (usually a Button); omit when controlled elsewhere. */
  trigger?: ComponentProps<typeof BaseDialog.Trigger>["render"];
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

/** A centered modal for focused tasks: sign in, report, confirm. */
export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
}: OverlayProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <BaseDialog.Trigger render={trigger} />}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop {...stylex.props(styles.backdrop)} />
        <BaseDialog.Popup {...stylex.props(shared.floatingPanel, styles.dialogPopup)}>
          <div {...stylex.props(styles.header)}>
            <BaseDialog.Title {...stylex.props(styles.title)}>{title}</BaseDialog.Title>
            <BaseDialog.Close render={<IconButton label="Close" icon={<CloseIcon />} />} />
          </div>
          {description && (
            <BaseDialog.Description {...stylex.props(styles.description)}>
              {description}
            </BaseDialog.Description>
          )}
          <div {...stylex.props(styles.body)}>{children}</div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/**
 * A modal that fills the viewport, for media such as the expanded 3D preview.
 * Like the others it traps focus, closes on Escape and locks page scroll; the
 * title names it for assistive technology only, and the content draws its own
 * close control.
 */
export function FullscreenDialog({
  open,
  onOpenChange,
  title,
  children,
  initialFocus,
  finalFocus,
}: Omit<OverlayProps, "trigger" | "description"> & {
  initialFocus?: ComponentProps<typeof BaseDialog.Popup>["initialFocus"];
  finalFocus?: ComponentProps<typeof BaseDialog.Popup>["finalFocus"];
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Popup
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          {...stylex.props(styles.fullscreenPopup)}
        >
          <BaseDialog.Title {...stylex.props(shared.visuallyHidden)}>{title}</BaseDialog.Title>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** A bottom sheet for small screens, dismissed by swiping down. */
export function Sheet({
  open,
  onOpenChange,
  trigger,
  title,
  children,
  footer,
}: OverlayProps & { footer?: ReactNode }) {
  return (
    <BaseDrawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="down">
      {trigger && <BaseDrawer.Trigger render={trigger} />}
      <BaseDrawer.Portal>
        <BaseDrawer.Backdrop {...stylex.props(styles.backdrop)} />
        <BaseDrawer.Viewport {...stylex.props(styles.sheetViewport)}>
          <BaseDrawer.Popup {...stylex.props(shared.floatingPanel, styles.sheetPopup)}>
            <div aria-hidden="true" {...stylex.props(styles.handle)} />
            <div {...stylex.props(styles.header, styles.sheetHeader)}>
              <BaseDrawer.Title {...stylex.props(styles.title)}>{title}</BaseDrawer.Title>
              <BaseDrawer.Close render={<IconButton label="Close" icon={<CloseIcon />} />} />
            </div>
            <BaseDrawer.Content {...stylex.props(styles.sheetContent)}>
              {children}
            </BaseDrawer.Content>
            {footer && <div {...stylex.props(styles.sheetFooter)}>{footer}</div>}
          </BaseDrawer.Popup>
        </BaseDrawer.Viewport>
      </BaseDrawer.Portal>
    </BaseDrawer.Root>
  );
}

const confirmStyles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: space.md },
  actions: { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: space.xs },
  error: { margin: 0, marginBottom: space.sm, fontSize: text.sm, color: color.danger },
});

/**
 * Asks before an action that is hard to undo. Stays open while `pending`, and
 * shows `error` if the action fails, so the result is never silently lost.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  error,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  /** Extra inputs for the action, such as a reason; shown under the description. */
  children?: ReactNode;
}) {
  return (
    <BaseAlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop {...stylex.props(styles.backdrop)} />
        <BaseAlertDialog.Popup {...stylex.props(shared.floatingPanel, styles.dialogPopup)}>
          <BaseAlertDialog.Title {...stylex.props(styles.title)}>{title}</BaseAlertDialog.Title>
          <BaseAlertDialog.Description {...stylex.props(styles.description)}>
            {description}
          </BaseAlertDialog.Description>
          <div {...stylex.props(styles.body, confirmStyles.stack)}>
            {children}
            {error && (
              <p role="alert" {...stylex.props(confirmStyles.error)}>
                {error}
              </p>
            )}
            <div {...stylex.props(confirmStyles.actions)}>
              <BaseAlertDialog.Close render={<Button variant="ghost">Cancel</Button>} />
              <Button variant="danger" disabled={pending} onClick={onConfirm}>
                {pending ? "Working…" : confirmLabel}
              </Button>
            </div>
          </div>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}
