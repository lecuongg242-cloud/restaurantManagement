"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerWithInvite } from "./actions";

const ERR_MAP: Record<string, string> = {
  INVITE_INVALID: "Lời mời không tồn tại hoặc đã bị thu hồi.",
  INVITE_ALREADY_USED: "Lời mời này đã được sử dụng.",
  INVITE_EXPIRED: "Lời mời đã hết hạn. Hãy nhờ quản lý gửi lời mời mới.",
  INVITE_EMAIL_MISMATCH:
    "Email tài khoản không khớp email được mời. Hãy đăng nhập đúng email.",
};

function mapError(message?: string) {
  for (const [code, text] of Object.entries(ERR_MAP)) {
    if (message?.includes(code)) return text;
  }
  return "Không chấp nhận được lời mời. Vui lòng thử lại.";
}

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setLoggedInEmail(data.user?.email ?? null));
  }, []);

  async function accept() {
    const supabase = createClient();
    const { data: slug, error } = await supabase.rpc("accept_invitation", {
      p_token: token,
    });
    if (error) {
      setError(mapError(error.message));
      return;
    }
    router.push(`/choose`);
    router.refresh();
    void slug;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "register") {
      // Server action: token là bằng chứng xác thực → tạo tài khoản trực tiếp,
      // không gửi email xác nhận (tránh rate limit SMTP), rồi tự accept + redirect.
      const result = await registerWithInvite(token, email, password);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      }
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setLoading(false);
      setError("Email hoặc mật khẩu không đúng.");
      return;
    }
    await accept();
    setLoading(false);
  }

  if (loggedInEmail) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-center text-sm">
          Đang đăng nhập: <span className="font-medium">{loggedInEmail}</span>
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          onClick={() => {
            setError(null);
            accept();
          }}
          className="min-h-11 cursor-pointer rounded-full bg-primary font-medium text-on-primary"
        >
          Chấp nhận lời mời
        </button>
        <button
          onClick={async () => {
            await createClient().auth.signOut();
            setLoggedInEmail(null);
          }}
          className="text-sm underline opacity-70"
        >
          Dùng tài khoản khác
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 rounded-full border border-border p-1 text-sm font-medium">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`min-h-9 cursor-pointer rounded-full ${
              mode === m ? "bg-primary text-on-primary" : "opacity-70"
            }`}
          >
            {m === "login" ? "Đã có tài khoản" : "Tạo tài khoản mới"}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email được mời
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 rounded-lg border border-border bg-transparent px-3 py-2 text-base outline-none focus:border-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Mật khẩu
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-11 rounded-lg border border-border bg-transparent px-3 py-2 text-base outline-none focus:border-ring"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="min-h-11 cursor-pointer rounded-full bg-primary font-medium text-on-primary disabled:opacity-60"
      >
        {loading ? "Đang xử lý..." : "Tiếp tục và chấp nhận lời mời"}
      </button>
    </form>
  );
}
