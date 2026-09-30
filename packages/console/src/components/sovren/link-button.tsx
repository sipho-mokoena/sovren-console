/**
 * A link that looks like a button.
 *
 * Not a `Button` with a `Link` rendered into it. That composition is the reason
 * this file exists: base-ui's button adds `role="button"` to whatever it renders,
 * so a navigation control built that way announces itself as an action rather
 * than as a place -- and then the accessibility tree, a keyboard user's
 * expectations and the browser's own context menu all disagree with each other.
 *
 * So the element is an anchor, built with TanStack's own `createLink`, which is
 * the sanctioned way to put a design-system element behind the router: `to` and
 * `params` stay typed against the route tree, and the element underneath is
 * whatever this file says it is.
 *
 * **No active state here.** A control that navigates somewhere is styled the
 * same whether or not it is where you already are; the places that *are* styled
 * by active state -- the top bar's scopes, the sidebar -- use `Link` directly,
 * because they read the router's own active props.
 */

import type { ReactNode } from "react";
import { createLink } from "@tanstack/react-router";
import type { CreateLinkProps } from "@tanstack/react-router";
import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The button's variants, applied to an anchor. */
type Variants = VariantProps<typeof buttonVariants>;

type AnchorProps = CreateLinkProps &
  Variants & {
    className?: string;
    children?: ReactNode;
  };

const Anchor = ({ variant, size, className, children, ...props }: AnchorProps) => (
  <a {...props} className={cn(buttonVariants({ variant, size }), className)}>
    {children}
  </a>
);

export const LinkButton = createLink(Anchor);
