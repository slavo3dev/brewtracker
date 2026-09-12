import type { Database } from "@brewtracker/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

type WarehouseTransferRpc =
  Database["public"]["Functions"]["record_warehouse_driver_transfer"];

type WarehouseTransferRpcArgs =
  WarehouseTransferRpc["Args"];

const testRpcArgs: WarehouseTransferRpcArgs = {
  p_movement_type: "warehouse_issue",
  p_warehouse_id: "test",
  p_driver_id: "test",
  p_product_id: "test",
  p_issue_quantity: 1,
  p_loose_quantity: 0,
  p_occurred_at: new Date().toISOString(),
};

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

export type WarehouseTransferType =
  | "warehouse_issue"
  | "warehouse_return";

export type WarehouseTransferProduct = Pick<
  ProductRow,
  | "id"
  | "sku"
  | "name"
  | "category"
  | "base_unit"
  | "issue_unit"
  | "units_per_issue_unit"
  | "package_description"
  | "allows_loose_units"
  | "allows_partial_base_unit"
>;

export type WarehouseTransferWarehouse = Pick<
  WarehouseRow,
  "id" | "name" | "region"
>;

export type WarehouseTransferDriver = Pick<
  UserRow,
  | "id"
  | "full_name"
  | "email"
  | "region"
>;

export type WarehouseTransferData = {
  warehouses: WarehouseTransferWarehouse[];
  drivers: WarehouseTransferDriver[];
  products: WarehouseTransferProduct[];
};

export type RecordWarehouseTransferInput = {
  movementType: WarehouseTransferType;
  warehouseId: string;
  driverId: string;
  productId: string;
  issueQuantity: number;
  looseQuantity: number;
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

export async function getWarehouseTransferData(): Promise<WarehouseTransferData> {
  const supabase = createAdminClient();

  const [
    warehousesResult,
    driversResult,
    productsResult,
  ] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, name, region")
      .order("name"),

    supabase
      .from("users")
      .select(
        "id, full_name, email, region",
      )
      .eq("role", "driver")
      .eq("is_active", true)
      .order("full_name"),

    supabase
      .from("inventory_products")
      .select(`
        id,
        sku,
        name,
        category,
        base_unit,
        issue_unit,
        units_per_issue_unit,
        package_description,
        allows_loose_units,
        allows_partial_base_unit
      `)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  if (warehousesResult.error) {
    throw new Error(
      warehousesResult.error.message,
    );
  }

  if (driversResult.error) {
    throw new Error(
      driversResult.error.message,
    );
  }

  if (productsResult.error) {
    throw new Error(
      productsResult.error.message,
    );
  }

  return {
    warehouses:
      warehousesResult.data as WarehouseTransferWarehouse[],

    drivers:
      driversResult.data as WarehouseTransferDriver[],

    products:
      productsResult.data as WarehouseTransferProduct[],
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

export async function recordWarehouseTransfer(
  input: RecordWarehouseTransferInput,
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "record_warehouse_driver_transfer",
    {
      p_movement_type: input.movementType,
      p_warehouse_id: input.warehouseId,
      p_driver_id: input.driverId,
      p_product_id: input.productId,
      p_issue_quantity: input.issueQuantity,
      p_loose_quantity: input.looseQuantity,
      p_occurred_at: new Date().toISOString(),
    },
  );

  if (error) {
    throw new Error(
      `Unable to record inventory transfer: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "The inventory transfer did not return a movement ID.",
    );
  }

  return data;
}