import { useState } from "react";
import { useNavigate, Navigate } from "react-router";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { AmericasIoTLogo } from "../components/AmericasIoTLogo";

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  // Redirect authenticated users based on their role
  if (!isLoading && user) {
    return <Navigate to={user.role === "client" ? "/portal" : "/dashboard"} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Ingresa tu correo y contraseña."); return; }
    setLoading(true);
    setError("");
    try {
      await login(email.trim(), password);
      // navigate is called here as a fallback; the Navigate above handles
      // subsequent renders once user state is set.
      const stored = JSON.parse(localStorage.getItem("iot_user") || "{}");
      navigate(stored.role === "client" ? "/portal" : "/dashboard", { replace: true });
    } catch (err: any) {
      setError(err.message || "Credenciales incorrectas. Verifica tus datos e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "#f2f4f7" }}
    >
      {/* Card */}
      <div
        className="w-full max-w-[400px] rounded-2xl overflow-hidden"
        style={{ background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)" }}
      >
        {/* Header */}
        <div
          className="flex flex-col items-center gap-3 px-8 py-8"
          style={{ borderBottom: "1px solid #f0f0f5" }}
        >
          <AmericasIoTLogo height={36} forceLight />
          <div className="text-center">
            <h1 className="text-base font-semibold" style={{ color: "#1a1a1a" }}>
              Bienvenido a Americas IoT
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#adadb8" }}>
              Inicia sesión para continuar
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="px-8 py-7 space-y-5">
          {error && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-xl text-xs"
              style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#e11d48" }}
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6b6b80" }} htmlFor="email">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              placeholder="usuario@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="w-full h-10 px-3.5 rounded-xl text-sm outline-none transition-all"
              style={{ background: "#f5f5f7", border: "1.5px solid transparent", color: "#1a1a1a" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#3ECF8E"; e.currentTarget.style.background = "#fff"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "#f5f5f7"; }}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6b6b80" }} htmlFor="password">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full h-10 pl-3.5 pr-10 rounded-xl text-sm outline-none transition-all"
                style={{ background: "#f5f5f7", border: "1.5px solid transparent", color: "#1a1a1a" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#3ECF8E"; e.currentTarget.style.background = "#fff"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "#f5f5f7"; }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: "#c7c7cc" }}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: loading ? "#7be3bb" : "#3ECF8E", cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Verificando...
              </span>
            ) : "Iniciar Sesión"}
          </button>
        </form>
      </div>

      <p className="text-[11px] mt-6" style={{ color: "#c7c7cc" }}>
        Americas IoT · {new Date().getFullYear()}
      </p>
    </div>
  );
}
