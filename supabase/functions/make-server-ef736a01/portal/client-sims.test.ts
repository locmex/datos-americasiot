import { describe, expect, it } from "vitest";
import { iccid19, queryClientSims, type ClientSimRow, type ClientSimsOptions } from "./client-sims.ts";

const sim = (i: number, statusId: number, name: string | null, imei?: string): ClientSimRow => ({
  iccid: `89883030000123${String(i).padStart(5, "0")}`,
  iccid_with_luhn: `89883030000123${String(i).padStart(5, "0")}0`,
  status: { id: statusId },
  endpoint: name ? { name } : null,
  endpointId: name ? 9000 + i : null,
  imei: imei ?? null,
  imsi: `29505090101${String(i).padStart(4, "0")}`,
});

// 30 SIMs: 20 activas, 6 suspendidas, 3 disponibles (sin dispositivo), 1 desactivada
const rows: ClientSimRow[] = Array.from({ length: 30 }, (_, i) => {
  const status = i < 20 ? 1 : i < 26 ? 2 : i < 29 ? 0 : 3;
  const name = status === 0 ? null : `Unidad ${String(30 - i).padStart(2, "0")}`;
  return sim(i, status, name, i === 7 ? "862667087307123" : undefined);
});

const base: ClientSimsOptions = {
  view: "sims", status: null, q: "", sort: "iccid", dir: 1, page: 1, perPage: 10, all: false,
};

describe("queryClientSims", () => {
  it("cuenta sobre todas las SIMs, no sobre la página", () => {
    const { counts, sims } = queryClientSims(rows, base);
    expect(sims).toHaveLength(10);
    expect(counts).toEqual({ total: 30, devices: 27, status: { 0: 3, 1: 20, 2: 6, 3: 1 } });
  });

  it("los conteos no cambian al filtrar ni buscar", () => {
    const a = queryClientSims(rows, { ...base, status: 2 }).counts;
    const b = queryClientSims(rows, { ...base, q: "unidad 05" }).counts;
    expect(a).toEqual(b);
    expect(a.status[1]).toBe(20);
  });

  it("filtra por estado sobre todas y pagina el resultado", () => {
    const p1 = queryClientSims(rows, { ...base, status: 1, perPage: 15 });
    const p2 = queryClientSims(rows, { ...base, status: 1, perPage: 15, page: 2 });
    expect(p1.total).toBe(20);
    expect(p1.sims).toHaveLength(15);
    expect(p2.sims).toHaveLength(5);
    expect([...p1.sims, ...p2.sims].every((s) => s.status?.id === 1)).toBe(true);
    // Sin repetidos entre páginas
    expect(new Set([...p1.sims, ...p2.sims].map((s) => s.iccid)).size).toBe(20);
  });

  it("la vista Dispositivos solo incluye SIMs con dispositivo", () => {
    const { total, sims } = queryClientSims(rows, { ...base, view: "devices", all: true });
    expect(total).toBe(27);
    expect(sims.every((s) => s.endpointId != null)).toBe(true);
  });

  it("busca por nombre en todas las SIMs, no solo en la página visible", () => {
    // "Unidad 01" es la última SIM (i = 29) → no está en la página 1
    const { total, sims } = queryClientSims(rows, { ...base, q: "unidad 01" });
    expect(total).toBe(1);
    expect(sims[0].endpoint?.name).toBe("Unidad 01");
  });

  it("busca por IMEI, también en su forma normalizada", () => {
    const normalize = (v: string | null | undefined) => (v === "8626670873071201" ? "862667087307123" : String(v ?? ""));
    const rowsImeisv = rows.map((r, i) => (i === 7 ? { ...r, imei: "8626670873071201" } : r));
    const { sims } = queryClientSims(rowsImeisv, { ...base, q: "862667087307123" }, normalize);
    expect(sims).toHaveLength(1);
    expect(sims[0].iccid).toBe(rows[7].iccid);
  });

  it("ordena por relevancia: exacto antes que 'contiene'", () => {
    const named = [sim(1, 1, "Tracto 1"), sim(2, 1, "Tracto 12"), sim(3, 1, "Mi Tracto 1")];
    const { sims } = queryClientSims(named, { ...base, q: "tracto 1" });
    expect(sims.map((s) => s.endpoint?.name)).toEqual(["Tracto 1", "Tracto 12", "Mi Tracto 1"]);
  });

  it("ordena por nombre ascendente y descendente", () => {
    const asc = queryClientSims(rows, { ...base, view: "devices", sort: "name", all: true }).sims;
    const desc = queryClientSims(rows, { ...base, view: "devices", sort: "name", dir: -1, all: true }).sims;
    expect(asc[0].endpoint?.name).toBe("Unidad 01");
    expect(desc[0].endpoint?.name).toBe("Unidad 30");
  });

  it("ordena por estado numérico", () => {
    const { sims } = queryClientSims(rows, { ...base, sort: "status", all: true });
    expect(sims[0].status?.id).toBe(0);
    expect(sims[sims.length - 1].status?.id).toBe(3);
  });

  it("una página fuera de rango devuelve vacío sin romper", () => {
    const { sims, total } = queryClientSims(rows, { ...base, page: 99 });
    expect(sims).toEqual([]);
    expect(total).toBe(30);
  });
});

describe("iccid19", () => {
  it("quita el dígito de control de un ICCID de 20", () => {
    expect(iccid19("89883030000123456782")).toBe("8988303000012345678");
  });
  it("deja igual uno de 19", () => {
    expect(iccid19("8988303000012345678")).toBe("8988303000012345678");
  });
});
