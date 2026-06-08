function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function Header({
  familyName = "family",
  show = true,
}: {
  familyName?: string;
  show?: boolean;
}) {
  if (!show) return null;
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="font-serif italic text-primary text-[clamp(14px,1.6vw,18px)]">
        {greeting()}, {familyName} 👋
      </div>
    </header>
  );
}
