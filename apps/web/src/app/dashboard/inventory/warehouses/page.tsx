import { requireAdmin } from "@/lib/auth/require-admin";
import { getWarehouses } from "@/lib/warehouses/warehouse-service";
import { updateWarehouseGeofenceAction } from "./actions";

export default async function WarehousesPage() {
  await requireAdmin();

  const warehouses = await getWarehouses();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-display text-3xl text-espresso-950">
        Warehouses
      </h1>

      {warehouses.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-latte-200 bg-crema-0 p-6 text-sm text-steam-400">
          No warehouses yet. Add one in Supabase or create warehouse management next.
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
        {warehouses.map((warehouse) => (
          <form
            key={warehouse.id}
            action={updateWarehouseGeofenceAction}
            className="rounded-2xl border border-latte-200 bg-crema-0 p-5"
          >
            <input type="hidden" name="warehouseId" value={warehouse.id} />

            <h2 className="font-semibold text-espresso-950">
              {warehouse.name}
            </h2>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input
                name="latitude"
                defaultValue={warehouse.latitude ?? ""}
                placeholder="Latitude"
                className="rounded-xl border border-latte-200 px-4 py-2.5 text-sm"
              />

              <input
                name="longitude"
                defaultValue={warehouse.longitude ?? ""}
                placeholder="Longitude"
                className="rounded-xl border border-latte-200 px-4 py-2.5 text-sm"
              />

              <input
                name="radius"
                defaultValue={warehouse.geofence_radius_meters}
                placeholder="Radius meters"
                className="rounded-xl border border-latte-200 px-4 py-2.5 text-sm"
              />
            </div>

            <button className="mt-4 rounded-full bg-espresso-950 px-4 py-2 text-sm text-crema-50">
              Save geofence
            </button>
          </form>
        ))}
      </div>
      )}
    </main>
  );
}