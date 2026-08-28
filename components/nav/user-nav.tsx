import { AuthenticatedUser } from "@/lib/types";

export interface UserNavProps {
  user: AuthenticatedUser;
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}

export function UserNav(_props: UserNavProps) {
  return null;
}
