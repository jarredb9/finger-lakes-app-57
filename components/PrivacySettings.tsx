"use client";
// components/PrivacySettings.tsx
import { useUserStore } from "@/lib/stores/userStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, Globe, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PrivacySettings() {
  const { toast } = useToast();
  const { user, updatePrivacyLevel } = useUserStore();

  const handleUpdatePrivacy = async (level: 'public' | 'friends_only' | 'private') => {
    try {
      await updatePrivacyLevel(level);
      toast({ description: `Privacy set to ${level.replace('_', ' ')}.` });
    } catch (err: any) {
      toast({ variant: "destructive", description: "Failed to update privacy settings." });
    }
  };

  return (
    <Card data-testid="privacy-settings-card" id="privacy-settings-section">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          Privacy Settings
        </CardTitle>
        <CardDescription>
          Control who can see your profile and visit history.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Profile Visibility</p>
            <p className="text-xs text-muted-foreground">
              {user?.privacy_level === 'public' && "Anyone can find and view your profile."}
              {user?.privacy_level === 'friends_only' && "Only your friends can see your full history."}
              {user?.privacy_level === 'private' && "Your history is hidden from everyone."}
            </p>
          </div>
          <Select 
            value={user?.privacy_level || 'friends_only'} 
            onValueChange={(val) => handleUpdatePrivacy(val as any)}
          >
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="privacy-select">
              <SelectValue placeholder="Select privacy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span>Public</span>
                </div>
              </SelectItem>
              <SelectItem value="friends_only">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>Friends Only</span>
                </div>
              </SelectItem>
              <SelectItem value="private">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  <span>Private</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
