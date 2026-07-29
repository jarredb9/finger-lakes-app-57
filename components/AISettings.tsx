"use client";

import { useUserStore } from "@/lib/stores/userStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AISettings() {
  const { toast } = useToast();
  const user = useUserStore((state) => state.user);
  const updateAIEnabled = useUserStore((state) => state.updateAIEnabled);

  const isAIEnabled = user?.ai_enabled ?? false;

  const handleToggle = async (checked: boolean) => {
    try {
      await updateAIEnabled(checked);
      toast({
        description: checked
          ? "AI features enabled."
          : "AI features disabled.",
      });
    } catch {
      toast({
        variant: "destructive",
        description: "Failed to update AI settings.",
      });
    }
  };

  return (
    <Card data-testid="ai-settings-card" id="ai-settings-section">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Features
        </CardTitle>
        <CardDescription>
          Opt into AI-powered insights, personalized tasting notes, and smart recommendations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="ai-toggle" className="text-sm font-medium cursor-pointer">
              Enable AI Features
            </Label>
            <p className="text-xs text-muted-foreground">
              {isAIEnabled
                ? "AI features are active across the app."
                : "AI features are turned off by default."}
            </p>
          </div>
          <Switch
            id="ai-toggle"
            data-testid="ai-features-switch"
            checked={isAIEnabled}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
