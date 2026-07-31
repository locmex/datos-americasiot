// Agrupación de cargos de factura.
//
// Una factura puede tener 150+ líneas idénticas ("$45.00 · Plan único · 100%").
// Eso es ruido: se agrupa por (plan, precio, prorrateo) y el detalle línea por
// línea queda disponible bajo demanda.
//
// Vive acá y no en una página porque lo consumen el panel del admin y el portal
// del cliente, y ambos deben mostrar EXACTAMENTE los mismos totales.

export interface ChargeLine {
  plan_name: string;
  unit_price: number;
  proration_factor: number;
  amount: number;
}

export interface ChargeGroup {
  key: string;
  planName: string;
  unitPrice: number;
  prorationFactor: number;
  count: number;
  total: number;
}

export function groupCharges(items: ChargeLine[]): ChargeGroup[] {
  const map = new Map<string, ChargeGroup>();

  for (const it of items) {
    const key = `${it.plan_name}__${it.unit_price}__${it.proration_factor}`;
    const g = map.get(key);
    if (g) {
      g.count += 1;
      g.total += Number(it.amount);
    } else {
      map.set(key, {
        key,
        planName: it.plan_name,
        unitPrice: Number(it.unit_price),
        prorationFactor: Number(it.proration_factor),
        count: 1,
        total: Number(it.amount),
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
