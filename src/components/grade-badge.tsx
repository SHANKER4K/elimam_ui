"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GRADE_LABELS, normalizeGrade, type GradeCanonical } from "@/lib/grade";

const STYLES: Record<GradeCanonical, { pill: string; dot: string }> = {
  sahih: { pill: "bg-[#EDF3EC] text-[#4A7C59]", dot: "bg-[#4A7C59]" },
  hasan: { pill: "bg-[#FBF3DB] text-[#8B6914]", dot: "bg-[#B4882E]" },
  daif: { pill: "bg-[#FDEBEC] text-[#9B2C2C]", dot: "bg-[#C44B4B]" },
  very_daif: { pill: "bg-[#F9D7D9] text-[#7A1F1F]", dot: "bg-[#9B2C2C]" },
  mawdu: { pill: "bg-[#3F2A2A] text-[#F5DADA]", dot: "bg-[#F5DADA]" },
  unknown: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
};

/**
 * Grade pill. `grade` may be a canonical value or any raw label (legacy enum,
 * citation-tag Arabic, a stored favorite); `raw` and `grader` go in the tooltip.
 */
export function GradeBadge({
  grade,
  raw,
  grader,
}: {
  grade: string | null | undefined;
  raw?: string | null;
  grader?: string | null;
}) {
  const canonical = normalizeGrade(grade);
  const style = STYLES[canonical];
  const label = GRADE_LABELS[canonical];
  // The raw label (e.g. "Sahih Isnaad") is more precise than our bucket.
  const detail = [raw, grader].filter(Boolean).join(" — ");

  const pill = (
    <span
      className={`text-xs px-2 py-0.5 rounded-md ${style.pill} font-medium inline-flex items-center gap-1.5`}
      aria-label={detail ? `${label}: ${detail}` : label}
      tabIndex={detail ? 0 : undefined}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
  if (!detail || detail === label) return pill;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
