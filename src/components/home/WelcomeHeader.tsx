import { useAuth } from "@/hooks/useAuth";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function WelcomeHeader() {
  const { profile, user } = useAuth();
  const firstName =
    profile?.full_name?.split(" ")[0] ||
    (typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.split(" ")[0]
      : "") ||
    "there";

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        {getGreeting()}, {firstName} 👋
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Welcome to the MySigrid Support Hub.
      </p>
    </div>
  );
}
