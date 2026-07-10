/* Reconciliación idempotente de períodos de vigencia por SIM (sim-lifecycle).
   syncSimPeriod(iccid, opts) se llama SIEMPRE DESPUÉS de una operación exitosa
   (cambio de estado en EMNIFY, o assign/unassign/bulk-assign en KV). La
   existencia de un período abierto (`deactivated_at IS NULL`) codifica el
   estado previo — no se vuelve a consultar EMNIFY acá; el `statusId` debe
   venir resuelto por el caller (ya lo tiene en el body del PATCH de estado,
   o lo resuelve con un GET puntual antes de llamar en assign/unassign).
   NUNCA debe hacer fallar la request original: los 5 call-sites en index.ts
   la envuelven en try/catch y solo loguean el error. */
import { db } from "../db.tsx";
import * as kv from "../kv_store.tsx";

export type SyncSimPeriodOpts = {
  statusId?: number | null;
  clientId?: string | null;
  clientName?: string | null;
  planId?: string | null;
};

// SIM status ids (convención ya usada en index.ts): 1 = Activa, 2 = Suspendida
// (ambos facturables); 0/3/otros = Disponible/Desactivada (no facturable).
function isBillableStatus(statusId: number | null | undefined): boolean {
  return statusId === 1 || statusId === 2;
}

async function getDefaultActivePlanId(): Promise<string | null> {
  const { data, error } = await db()
    .from("plans")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`plans lookup: ${error.message}`);
  return data?.id ?? null;
}

export async function syncSimPeriod(iccid: string, opts: SyncSimPeriodOpts = {}): Promise<void> {
  if (!iccid) throw new Error("syncSimPeriod: iccid requerido");
  if (opts.statusId === undefined || opts.statusId === null) {
    throw new Error(`syncSimPeriod(${iccid}): statusId no resuelto`);
  }

  // Fuente de verdad del cliente actual: chip:iccid en KV (el caller invoca
  // DESPUÉS de que el KV ya refleja el estado nuevo). opts.clientId/clientName
  // son solo fallback si el chip no existiera (no debería pasar).
  const chip = await kv.get(`chip:${iccid}`);
  const clientId: string | null = chip?.clientId ?? opts.clientId ?? null;
  const clientName: string | null = chip?.clientName ?? opts.clientName ?? null;

  const billable = isBillableStatus(opts.statusId);
  const desired = billable && !!clientId;

  const { data: open, error: openErr } = await db()
    .from("sim_assignments")
    .select("id, client_id")
    .eq("iccid", iccid)
    .is("deactivated_at", null)
    .maybeSingle();
  if (openErr) throw new Error(`sim_assignments lookup: ${openErr.message}`);

  const now = new Date().toISOString();

  const openNewPeriod = async () => {
    const planId = opts.planId ?? (await getDefaultActivePlanId());
    const { error } = await db().from("sim_assignments").insert({
      iccid,
      client_id: clientId,
      client_name: clientName ?? "—",
      plan_id: planId,
      activated_at: now,
      last_status_id: opts.statusId,
    });
    if (error) throw new Error(`sim_assignments insert: ${error.message}`);
  };

  const closeOpenPeriod = async (id: string) => {
    const { error } = await db()
      .from("sim_assignments")
      .update({ deactivated_at: now, last_status_id: opts.statusId })
      .eq("id", id);
    if (error) throw new Error(`sim_assignments close: ${error.message}`);
  };

  if (desired) {
    if (!open) {
      // Disponible→Activa/Suspendida, o Desactivada→Activa (reactivación): abre período.
      await openNewPeriod();
    } else if (open.client_id !== clientId) {
      // Reasignación directa a otro cliente sin pasar por unassign: cierra el
      // período del cliente anterior y abre uno nuevo para el actual (evita
      // facturar al cliente equivocado).
      await closeOpenPeriod(open.id);
      await openNewPeriod();
    } else {
      // Activa↔Suspendida sin corte, o "activar" ya-activa: no-op de vigencia,
      // solo refresca el snapshot de estado.
      const { error } = await db()
        .from("sim_assignments")
        .update({ last_status_id: opts.statusId })
        .eq("id", open.id);
      if (error) throw new Error(`sim_assignments refresh: ${error.message}`);
    }
  } else if (open) {
    // Transición a Desactivada, o desasignación de cliente: cierra el período.
    await closeOpenPeriod(open.id);
  }
  // !desired && !open: desactivar una SIM sin período abierto → no-op (spec sim-lifecycle).
}
