/* Conversión de etiquetas de endpoints entre emnify y la app. La API de
   emnify maneja `tags` como un string separado por comas ("sensor,outdoor"),
   mientras que el frontend trabaja con string[]. Función pura (sin Deno ni
   emnify): el edge la importa como "./emnify/tags.ts" y Vitest la prueba
   directamente. */

// Normaliza lo que devuelva emnify (string, array, null) a string[].
export function parseTags(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return parts.map((t) => String(t).trim()).filter(Boolean);
}

// Formato que espera emnify al crear o actualizar un endpoint.
export function formatTags(tags: unknown): string {
  return parseTags(tags).join(",");
}
