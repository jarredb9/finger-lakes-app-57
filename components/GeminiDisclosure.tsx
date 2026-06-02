import { Sparkles } from "lucide-react";

interface GeminiDisclosureProps {
  className?: string;
}

export function GeminiDisclosure({ className = "" }: GeminiDisclosureProps) {
  return (
    <div className={`flex items-center gap-1 text-[10px] text-muted-foreground/80 italic ${className}`}>
      <Sparkles className="w-3 h-3 fill-purple-600/10" />
      <span>Summarized with Gemini</span>
    </div>
  );
}
