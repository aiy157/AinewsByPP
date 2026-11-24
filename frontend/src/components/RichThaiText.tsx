import React from 'react';

interface RichThaiTextProps {
  text: string;
  variant?: 'headline' | 'prose';
}

// Removes raw "[ข่าวลือ]" bracket prefix from headlines since Rumor cards/modals
// already display a clean, dedicated editorial status label above the title.
export function stripRumorPrefix(title: string): string {
  return title.replace(/^\s*\[ข่าวลือ\]\s*/u, '').trim();
}

// Subtle typographic weight emphasis ONLY for key quantitative figures & quoted names
// inside long-form reading prose — zero noisy colored highlight pills.
const PROSE_EMPHASIS_REGEX =
  /("[^"]+"|\b\d+(?:[.,]\d+)*\s*(?:%|GW|MW|TB|GB|MB|K\s*Tokens|Tokens|B\b|พารามิเตอร์|เท่า|มิลลิวินาที|ระดับ|ฉบับ|แห่ง|เดือน))/g;

export const RichThaiText: React.FC<RichThaiTextProps> = ({
  text,
  variant = 'prose',
}) => {
  if (variant === 'headline') {
    return <>{stripRumorPrefix(text)}</>;
  }

  const parts = text.split(PROSE_EMPHASIS_REGEX);

  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        if (PROSE_EMPHASIS_REGEX.test(part)) {
          PROSE_EMPHASIS_REGEX.lastIndex = 0;
          return (
            <strong key={idx} className="font-semibold text-ink-primary">
              {part}
            </strong>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </>
  );
};
