/**
 * ICCID legible: grupos de 4 dígitos en monoespaciada y el último grupo
 * resaltado, que es lo que la gente compara al buscar una SIM entre cientos
 * ("…2345 6782"). Los espacios son solo visuales: al copiar se copia el
 * número completo sin espacios.
 */
export function Iccid({ value, className = "" }: { value?: string | null; className?: string }) {
  const raw = (value ?? "").replace(/\s+/g, "");
  if (!raw) return <span className={className}>—</span>;

  const groups = raw.match(/.{1,4}/g) ?? [raw];
  const head = groups.slice(0, -1);
  const tail = groups[groups.length - 1];

  return (
    <span
      className={`font-mono whitespace-nowrap tracking-tight ${className}`}
      title={raw}
      onCopy={(e) => {
        e.preventDefault();
        e.clipboardData.setData("text/plain", raw);
      }}
    >
      {head.map((g, i) => (
        <span key={i} className="text-on-surface-variant">{g}{" "}</span>
      ))}
      <span className="font-medium text-on-surface">{tail}</span>
    </span>
  );
}
