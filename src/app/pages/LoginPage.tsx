import { useState } from "react";
import { useNavigate, Navigate } from "react-router";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { BrandLockup } from "../components/BrandLockup";

// Archivos en public/login (se sirven tal cual, sin pasar por el bundle)
const LOGIN_VIDEO = "/login/login-sims.mp4";
const LOGIN_POSTER = "/login/login-sims-poster.jpg";

// Fondo de marca: morado #270779 con brillos violeta y cian de señal.
// La tarjeta se queda blanca porque el logo es morado oscuro.
const BRAND_BACKGROUND = [
  "radial-gradient(45% 60% at 12% 18%, #5b2fd6 0%, transparent 70%)",
  "radial-gradient(35% 45% at 92% 12%, rgba(34,228,200,0.55) 0%, transparent 70%)",
  "radial-gradient(50% 60% at 80% 100%, #3a159e 0%, transparent 72%)",
  "#1d0a5c",
].join(", ");

const FOCUS_BORDER = "#4a20c4";

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [reduceMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

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
      className="relative isolate min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden"
      style={{ background: BRAND_BACKGROUND }}
    >
      {/* Video de fondo (SIM → red de América). Con "reducir movimiento"
          queda solo la imagen fija; el degradado de arriba cubre mientras carga. */}
      {reduceMotion ? (
        <img
          src={LOGIN_POSTER}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover object-[72%_50%] md:object-center"
        />
      ) : (
        <video
          src={LOGIN_VIDEO}
          poster={LOGIN_POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover object-[72%_50%] md:object-center"
        />
      )}
      {/* Velo para que la tarjeta y el pie destaquen sobre el video */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(20,6,60,0.45) 0%, rgba(20,6,60,0.15) 100%)" }}
      />

      {/* Card */}
      <div
        className="w-full max-w-[400px] rounded-2xl overflow-hidden"
        style={{ background: "#ffffff", boxShadow: "0 0 0 1px rgba(255,255,255,0.18), 0 24px 70px rgba(5,2,25,0.55)" }}
      >
        {/* Logotipo idéntico al de la landing (Logo.astro): globo con arcos
            en blanco + "AMERICAS / IoT" en Volte, sobre el morado de su barra */}
        <div className="flex justify-center px-8 py-6" style={{ background: "#1a0450" }}>
          <BrandLockup />
        </div>

        {/* Header */}
        <div
          className="flex flex-col items-center gap-3 px-8 pt-7 pb-6"
          style={{ borderBottom: "1px solid #f0eef6" }}
        >
          <div className="text-center">
            <h1 className="text-base font-semibold" style={{ color: "#1a1a1a" }}>
              Bienvenido a Americas IoT
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#77738a" }}>
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
            <label className="text-xs font-semibold" style={{ color: "#5d5873" }} htmlFor="email">
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
              style={{ background: "#f4f3f8", border: "1.5px solid transparent", color: "#1a1a1a" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = FOCUS_BORDER; e.currentTarget.style.background = "#fff"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "#f4f3f8"; }}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#5d5873" }} htmlFor="password">
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
                style={{ background: "#f4f3f8", border: "1.5px solid transparent", color: "#1a1a1a" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = FOCUS_BORDER; e.currentTarget.style.background = "#fff"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "#f4f3f8"; }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: "#8f8aa3" }}
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
            style={{ background: loading ? "#7a63c9" : "#270779", cursor: loading ? "not-allowed" : "pointer" }}
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

      <p className="text-[11px] mt-6" style={{ color: "rgba(255,255,255,0.6)" }}>
        Americas IoT · {new Date().getFullYear()}
      </p>
    </div>
  );
}
