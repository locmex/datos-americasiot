import { useState } from "react";
import { Eye, EyeOff, Loader2, AlertCircle, Wifi } from "lucide-react";
import { useClientAuth } from "../../lib/client-auth";
import { AmericasIoTLogo } from "../../components/AmericasIoTLogo";

export default function ClientPortalLoginPage() {
  const { login }          = useClientAuth();
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email y contraseña son requeridos");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // Navigation handled automatically by PortalRouter once user state is set
    } catch (e: any) {
      setError(
        e.message ||
        "Error de autenticación. Verifica tus credenciales e inténtalo de nuevo."
      );
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
        style={{
          background: "#ffffff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)",
        }}
      >
        {/* Header */}
        <div
          className="flex flex-col items-center gap-3 px-8 py-7"
          style={{ borderBottom: "1px solid #f0f0f5" }}
        >
          <AmericasIoTLogo height={34} forceLight />
          <div className="text-center">
            <h1 className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>
              Portal de Clientes
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#adadb8" }}>
              Gestión de SIMs y conectividad IoT
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
          {error && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-xl text-xs"
              style={{
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#e11d48",
              }}
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Email */}
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold"
              style={{ color: "#6b6b80" }}
              htmlFor="cp-email"
            >
              Correo electrónico
            </label>
            <input
              id="cp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
              autoFocus
              required
              className="w-full h-10 px-3.5 rounded-xl text-sm outline-none transition-all"
              style={{
                background: "#f5f5f7",
                border: "1.5px solid transparent",
                color: "#1a1a1a",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#3ECF8E";
                e.currentTarget.style.background  = "#fff";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "transparent";
                e.currentTarget.style.background  = "#f5f5f7";
              }}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold"
              style={{ color: "#6b6b80" }}
              htmlFor="cp-password"
            >
              Contraseña
            </label>
            <div className="relative">
              <input
                id="cp-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full h-10 pl-3.5 pr-10 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: "#f5f5f7",
                  border: "1.5px solid transparent",
                  color: "#1a1a1a",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#3ECF8E";
                  e.currentTarget.style.background  = "#fff";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "transparent";
                  e.currentTarget.style.background  = "#f5f5f7";
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "#c7c7cc" }}
              >
                {showPassword
                  ? <EyeOff className="w-4 h-4" />
                  : <Eye     className="w-4 h-4" />
                }
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{
              background: loading ? "#7be3bb" : "#3ECF8E",
              color: "#000",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Wifi    className="w-4 h-4" />
            }
            {loading ? "Verificando..." : "Ingresar al portal"}
          </button>
        </form>
      </div>

      <p className="text-[11px] mt-5" style={{ color: "#c7c7cc" }}>
        ¿Sin acceso? Contacta al administrador de Americas IoT.
      </p>
    </div>
  );
}
