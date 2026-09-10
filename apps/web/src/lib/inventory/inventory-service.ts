import type { Database } from "@brewtracker/types";
import { createAdminClient } from "@/lib/supabase/admin";

type ProductRow =
  Database["public"]["Tables"]["inventory_products"]["Row"];

type LocationRow =
  Database["public"]["Tables"]["inventory_locations"]["Row"];

type MovementRow =
  Database["public"]["Tables"]["inventory_movements"]["Row"];

type UserRow =
  Database["public"]["Tables"]["users"]["Row"];

type WarehouseRow =
  Database["public"]["Tables"]["warehouses"]["Row"];

type ClientRow =
  Database["public"]["Tables"]["clients"]["Row"];

type MachineRow =
  Database["public"]["Tables"]["machines"]["Row"];

export type InventoryProduct = ProductRow;

export type InventoryLocation = LocationRow & {
  warehouse: Pick<WarehouseRow, "id" | "name"> | null;
  driver: Pick<UserRow, "id" | "full_name" | "email"> | null;
  client: Pick<ClientRow, "id" | "name"> | null;
  machine: Pick<
    MachineRow,
    "id" | "name" | "serial_number"
  > | null;
};

export type InventoryMovementType =
  MovementRow["movement_type"];

export type InventoryMovement = MovementRow & {
  product: Pick<
    ProductRow,
    "id" | "name" | "sku"
  > | null;

  recorded_by_user: Pick<
    UserRow,
    "id" | "full_name" | "email"
  > | null;

  machine: Pick<
    MachineRow,
    "id" | "name" | "serial_number"
  > | null;

  from_location: InventoryLocation | null;
  to_location: InventoryLocation | null;
};

export type InventoryAdminData = {
  products: InventoryProduct[];
  locations: InventoryLocation[];
};

export type InventoryMovementFilters = {
  search?: string;
  movementType?: InventoryMovementType | "";
  date?: string;
  page?: number;
  pageSize?: number;
};

export type InventoryMovementPage = {
  movements: InventoryMovement[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const locationSelect = `
  id,
  location_type,
  warehouse_id,
  driver_id,
  client_id,
  machine_id,
  created_at,
  warehouse:warehouses (
    id,
    name
  ),
  driver:users (
    id,
    full_name,
    email
  ),
  client:clients (
    id,
    name
  ),
  machine:machines (
    id,
    name,
    serial_number
  )
`;

const movementSelect = `
  *,
  product:inventory_products (
    id,
    name,
    sku
  ),
  recorded_by_user:users!inventory_movements_recorded_by_fkey (
    id,
    full_name,
    email
  ),
  machine:machines (
    id,
    name,
    serial_number
  ),
  from_location:inventory_locations!inventory_movements_from_location_id_fkey (
    ${locationSelect}
  ),
  to_location:inventory_locations!inventory_movements_to_location_id_fkey (
    ${locationSelect}
  )
`;

export async function getInventoryAdminData(): Promise<InventoryAdminData> {
  const supabase = createAdminClient();

  const [
    productsResult,
    locationsResult,
  ] = await Promise.all([
    supabase
      .from("inventory_products")
      .select("*")
      .order("sort_order")
      .order("name"),

    supabase
      .from("inventory_locations")
      .select(locationSelect)
      .order("location_type")
      .order("created_at"),
  ]);

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }

  return {
    products:
      productsResult.data as InventoryProduct[],

    locations:
      locationsResult.data as InventoryLocation[],
  };
}

export async function getInventoryMovements({
  search = "",
  movementType = "",
  date = "",
  page = 1,
  pageSize = 10,
}: InventoryMovementFilters = {}): Promise<InventoryMovementPage> {
  const supabase = createAdminClient();

  const safePage = Math.max(1, page);
  const safePageSize = Math.min(
    100,
    Math.max(1, pageSize),
  );

  const from =
    (safePage - 1) * safePageSize;

  const to = from + safePageSize - 1;

  let query = supabase
    .from("inventory_movements")
    .select(movementSelect, {
      count: "exact",
    });

  if (movementType) {
    query = query.eq(
      "movement_type",
      movementType,
    );
  }

  if (date) {
    const start = `${date}T00:00:00.000Z`;

    const nextDate = new Date(
      `${date}T00:00:00.000Z`,
    );

    nextDate.setUTCDate(
      nextDate.getUTCDate() + 1,
    );

    query = query
      .gte("occurred_at", start)
      .lt(
        "occurred_at",
        nextDate.toISOString(),
      );
  }

  /*
   * Keep this search intentionally limited to columns
   * that belong directly to inventory_movements.
   *
   * Product/client/driver relationship searching should
   * not be emulated with client-side filtering after
   * pagination because that would make total/count wrong.
   */
  const normalizedSearch = search.trim();

  if (normalizedSearch) {
    query = query.or(
      [
        `source_visit_id.ilike.%${escapePostgrestSearch(
          normalizedSearch,
        )}%`,
        `normalized_unit.ilike.%${escapePostgrestSearch(
          normalizedSearch,
        )}%`,
      ].join(","),
    );
  }

  const {
    data,
    error,
    count,
  } = await query
    .order("occurred_at", {
      ascending: false,
    })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const total = count ?? 0;

  return {
    movements:
      (data ?? []) as InventoryMovement[],

    total,
    page: safePage,
    pageSize: safePageSize,

    totalPages: Math.max(
      1,
      Math.ceil(total / safePageSize),
    ),
  };
}

function escapePostgrestSearch(
  value: string,
) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}