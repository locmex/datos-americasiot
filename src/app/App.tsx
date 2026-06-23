import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { router } from "./routes";
import { ThemeProvider } from "./lib/theme-context";

export default function App() {
  useEffect(() => {
    document.title = "Americas IoT — Portal de Administración";
  }, []);

  return (
    <ThemeProvider>
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        richColors
        expand={false}
        toastOptions={{
          style: { borderRadius: "12px", fontSize: "13px" },
        }}
      />
    </ThemeProvider>
  );
}
