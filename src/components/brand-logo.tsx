import Image from "next/image";
import Link from "next/link";
import { PRODUCT_ICON_PATH, PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Tamanhos em tela (o arquivo-fonte pode ser 500×500). */
const iconSizes = {
  sm: "size-8",
  md: "size-9",
  lg: "size-10",
  xl: "size-14",
} as const;

const iconPixelSizes = {
  sm: 32,
  md: 36,
  lg: 40,
  xl: 56,
} as const;

type BrandLogoProps = {
  showName?: boolean;
  subtitle?: string;
  size?: keyof typeof iconSizes;
  className?: string;
  nameClassName?: string;
  subtitleClassName?: string;
  href?: string;
};

function BrandImage({
  size,
  priority = false,
}: {
  size: keyof typeof iconSizes;
  priority?: boolean;
}) {
  const px = iconPixelSizes[size];
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg",
        iconSizes[size]
      )}
    >
      <Image
        src={PRODUCT_ICON_PATH}
        alt={PRODUCT_NAME}
        fill
        className="object-cover"
        sizes={`${px}px`}
        priority={priority}
        unoptimized
      />
    </div>
  );
}

export function BrandLogo({
  showName = true,
  subtitle,
  size = "md",
  className,
  nameClassName,
  subtitleClassName,
  href,
}: BrandLogoProps) {
  const content = (
    <>
      <BrandImage size={size} priority={size === "xl"} />
      {showName && (
        <div className="grid min-w-0 flex-1 text-left leading-tight">
          <span
            className={cn(
              "truncate font-semibold tracking-tight",
              nameClassName
            )}
          >
            {PRODUCT_NAME}
          </span>
          {subtitle && (
            <span
              className={cn(
                "truncate text-xs text-muted-foreground",
                subtitleClassName
              )}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </>
  );

  const wrapperClass = cn("flex min-w-0 items-center gap-2.5", className);

  if (href) {
    return (
      <Link href={href} className={wrapperClass}>
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-2xl",
        className
      )}
    >
      <Image
        src={PRODUCT_ICON_PATH}
        alt={PRODUCT_NAME}
        fill
        className="object-cover"
        sizes="112px"
        priority
        unoptimized
      />
    </div>
  );
}
