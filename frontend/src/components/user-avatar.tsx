import { getAvatarPreset, getInitialsAvatar, presetAvatarSvg } from "@/lib/avatars";
import { cn } from "@/lib/utils";

export function UserAvatar({
  fullName,
  email,
  avatarPreset,
  className,
}: {
  fullName?: string | null;
  email?: string | null;
  avatarPreset?: string | null;
  className?: string;
}) {
  const preset = getAvatarPreset(avatarPreset);
  const label = fullName?.trim() || email?.trim() || "?";

  if (preset) {
    return (
      <div
        className={cn("h-8 w-8 shrink-0 overflow-hidden rounded-full", className)}
        dangerouslySetInnerHTML={{ __html: presetAvatarSvg(preset) }}
        aria-label={label}
        role="img"
      />
    );
  }

  const { initials, bg } = getInitialsAvatar(label);
  return (
    <div
      className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", className)}
      style={{ backgroundColor: bg }}
      aria-label={label}
      role="img"
    >
      {initials}
    </div>
  );
}
