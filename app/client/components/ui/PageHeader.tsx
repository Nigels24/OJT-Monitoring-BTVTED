"use client";

import { useEffect, useState } from "react";
import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  showDateTime?: boolean;
}

export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  showDateTime = true,
}: PageHeaderProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // The clock starts after mount (the server render has no "now" to agree
    // with), from a timer callback rather than the effect body itself.
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);

  return (
    // Wraps rather than squeezes: the date and time drop under the title when
    // there is no room beside it, and — as a flex item with a 16rem basis —
    // this whole header gives a page's action buttons their own line before
    // either is cut off.
    <div className="flex flex-[1_1_16rem] min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        <Icon size={28} className="text-white shrink-0" />
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-white break-words">
            {title}
          </h1>
          {subtitle && (
            <p className="text-white/80 text-sm mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {showDateTime && now && (
        <div className="text-left sm:text-right text-white">
          <p className="text-sm">
            {now.toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <p className="text-blue-300 font-semibold text-sm">
            {now.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
