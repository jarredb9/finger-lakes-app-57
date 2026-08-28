"use client";

import React from "react";
import Link from "next/link";
import { AuthenticatedUser } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  User as UserIcon,
  Settings,
  FileText,
  Download,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { usePwa } from "@/hooks/use-pwa";
import { useToast } from "@/hooks/use-toast";

export interface UserNavProps {
  user: AuthenticatedUser;
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}

export function UserNav({
  user,
  trigger,
  align = "end",
  className,
}: UserNavProps) {
  const { isInstallable, isStandalone, installApp, isUpdateAvailable, updateApp } = usePwa();
  const { toast } = useToast();

  const handleInstallClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isInstallable) {
      installApp();
    } else {
      toast({
        title: "Install Instructions",
        description: "To install, tap your browser's Share/Menu button and select 'Add to Home Screen'.",
        duration: 5000,
      });
    }
  };

  return (
    <div data-testid="user-nav" className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ? (
            trigger
          ) : (
            <Button variant="ghost" className="relative h-8 w-8 rounded-full" aria-label="User menu">
              <Avatar className="h-8 w-8 border">
                <AvatarImage src="/placeholder-user.jpg" alt={user.name || "User avatar"} />
                <AvatarFallback>{user.name?.charAt(0) || <UserIcon className="h-4 w-4" />}</AvatarFallback>
              </Avatar>
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{user.name}</p>
              <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/settings" className="w-full cursor-pointer flex items-center">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/privacy" className="w-full cursor-pointer flex items-center">
              <FileText className="mr-2 h-4 w-4" />
              <span>Privacy Policy</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/terms" className="w-full cursor-pointer flex items-center">
              <FileText className="mr-2 h-4 w-4" />
              <span>Terms of Service</span>
            </Link>
          </DropdownMenuItem>

          {(!isStandalone || isUpdateAvailable) && <DropdownMenuSeparator />}

          {!isStandalone && (
            <DropdownMenuItem onClick={handleInstallClick} className="cursor-pointer">
              <Download className="mr-2 h-4 w-4" />
              <span>{isInstallable ? "Install App" : "Add to Home Screen"}</span>
            </DropdownMenuItem>
          )}

          {isUpdateAvailable && (
            <DropdownMenuItem onClick={updateApp} className="cursor-pointer text-blue-600 focus:text-blue-600">
              <RefreshCw className="mr-2 h-4 w-4" />
              <span>Update Available</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/logout" className="w-full cursor-pointer flex items-center text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
