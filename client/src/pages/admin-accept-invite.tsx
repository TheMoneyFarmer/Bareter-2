import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

function getTokenFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

export function AdminAcceptInvitePage() {
  const token = getTokenFromUrl();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"checking" | "valid" | "invalid">("checking");
  const [invite, setInvite] = useState<{ email: string; role: string } | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    fetch(`/api/admin/invites/verify/${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          setInvite({ email: data.email, role: data.role });
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!fullName.trim()) {
      setError("Full name is required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, fullName, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Something went wrong");
        return;
      }
      const userData = await res.json();
      queryClient.setQueryData(["/api/auth/me"], userData);
      window.location.href = "/admin";
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-sm text-gray-500">Checking your invite…</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-sm px-6">
          <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">Invite expired</p>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">This invite link is no longer valid</h1>
          <p className="text-sm text-gray-500">
            It may have already been used, revoked, or expired. Ask whoever invited you to send a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1 text-center">Admin Invite</p>
        <p className="text-sm text-gray-500 mb-6 text-center">
          {invite?.email} — {invite?.role === "super_admin" ? "Super Admin" : "Admin"}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Full name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <input
            type="password"
            placeholder="Create a password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <input
            type="password"
            placeholder="Confirm password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 bg-gray-900 text-white text-sm font-semibold rounded-md hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? "Activating…" : "Activate account"}
          </button>
        </form>
      </div>
    </div>
  );
}
