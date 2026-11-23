import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";

import { supabase } from "../services/supabaseClient";

type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  displayName: string;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<AuthResult>;
  updateEmail: (email: string) => Promise<AuthResult>;
  updatePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readDisplayName(user: User | null): string {
  const meta = user?.user_metadata;
  const fromMeta =
    (typeof meta?.display_name === "string" && meta.display_name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    "";
  return fromMeta.trim();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setLoading(false);
      },
    );

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? null;

    return {
      session,
      user,
      loading,
      displayName: readDisplayName(user),
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return { error: error?.message ?? null };
      },
      async signUp(email, password) {
        const { error } = await supabase.auth.signUp({ email, password });
        return { error: error?.message ?? null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async updateDisplayName(displayName) {
        const trimmed = displayName.trim();
        if (!trimmed) {
          return { error: "Enter a display name." };
        }

        const { data, error } = await supabase.auth.updateUser({
          data: { display_name: trimmed },
        });

        if (!error && data.user) {
          setSession((current) =>
            current ? { ...current, user: data.user } : current,
          );
        }

        return { error: error?.message ?? null };
      },
      async updateEmail(email) {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) {
          return { error: "Enter an email address." };
        }

        const { data, error } = await supabase.auth.updateUser({
          email: trimmed,
        });

        if (!error && data.user) {
          setSession((current) =>
            current ? { ...current, user: data.user } : current,
          );
        }

        return { error: error?.message ?? null };
      },
      async updatePassword(currentPassword, newPassword) {
        const email = user?.email;
        if (!email) {
          return { error: "No signed-in account found." };
        }

        if (newPassword.length < 8) {
          return { error: "New password must be at least 8 characters." };
        }

        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });

        if (verifyError) {
          return { error: "Current password is incorrect." };
        }

        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        return { error: error?.message ?? null };
      },
      async requestPasswordReset(email) {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) {
          return { error: "Enter your email address." };
        }

        const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
        return { error: error?.message ?? null };
      },
    };
  }, [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
