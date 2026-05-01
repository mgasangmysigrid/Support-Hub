import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import mysigridLogo from "@/assets/mysigrid-logo-white.jpeg";
import { ArrowLeft, CheckCircle, AlertTriangle } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [checking, setChecking] = useState(true);
  const recoveryConfirmed = useRef(false);

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event — this is the only valid entry
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryConfirmed.current = true;
        setChecking(false);
        setInvalid(false);
      }
    });

    // Check if there's a recovery hash in the URL
    const hash = window.location.hash;
    const hasRecoveryHash = hash && hash.includes("type=recovery");

    if (hasRecoveryHash) {
      // Supabase will process the hash and fire PASSWORD_RECOVERY
      // Give it time, then fall back to invalid if event never fired
      const timeout = setTimeout(() => {
        if (!recoveryConfirmed.current) {
          setChecking(false);
          setInvalid(true);
        }
      }, 4000);
      return () => { timeout && clearTimeout(timeout); subscription.unsubscribe(); };
    } else {
      // No recovery hash — this is not a valid recovery entry
      setChecking(false);
      setInvalid(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Sign out so the user must log in with new password
    await supabase.auth.signOut();
    setSuccess(true);
    setLoading(false);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Verifying your reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img src={mysigridLogo} alt="MySigrid Logo" className="mx-auto mb-4 h-16 w-16 object-contain" />
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-2" />
            <CardTitle className="text-xl">Invalid or Expired Link</CardTitle>
            <CardDescription>This password reset link is invalid or has expired. Please request a new one.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/login")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img src={mysigridLogo} alt="MySigrid Logo" className="mx-auto mb-4 h-16 w-16 object-contain" />
            <CheckCircle className="mx-auto h-12 w-12 text-primary mb-2" />
            <CardTitle className="text-xl">Password Reset Successfully</CardTitle>
            <CardDescription>Your password has been reset successfully. Please sign in.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/login")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={mysigridLogo} alt="MySigrid Logo" className="mx-auto mb-4 h-16 w-16 object-contain" />
          <CardTitle className="text-2xl font-bold">Set New Password</CardTitle>
          <CardDescription>Enter your new password below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 6 characters" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating..." : "Reset Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
