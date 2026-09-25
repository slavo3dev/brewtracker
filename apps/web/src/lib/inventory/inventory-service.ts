import type { Database } from "@brewtracker/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ProductRow = Database["public"]["Tables"]["inventory_products"]["Row"];

type LocationRow = Database["public"]["Tables"]["inventory_locations"]["Row"];

type MovementRow = Database["public"]["Tables"]["inventory_movements"]["Row"];

type UserRow = Database["public"]["Tables"]["users"]["Row"];

type WarehouseRow = Database["public"]["Tables"]["warehouses"]["Row"];

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

type MachineRow = Database["public"]["Tables"]["machines"]["Row"];

type WarehouseTransferRpc =
  Database["public"]["Functions"]["record_warehouse_driver_transfer"];

type WarehouseTransferRpcArgs = WarehouseTransferRpc["Args"];

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
  machine: Pick<MachineRow, "id" | "name" | "serial_number"> | null;
};

export type InventoryMovementType = MovementRow["movement_type"];

export type InventoryMovement = MovementRow & {
  product: Pick<ProductRow, "id" | "name" | "sku"> | null;

  recorded_by_user: Pick<UserRow, "id" | "full_name" | "email"> | null;

  machine: Pick<MachineRow, "id" | "name" | "serial_number"> | null;

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

export type WarehouseTransferType = "warehouse_issue" | "warehouse_return";

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
  "id" | "full_name" | "email" | "region"
>;

export type WarehouseTransferData = {
  warehouses: WarehouseTransferWarehouse[];
  drivers: WarehouseTransferDriver[];
  products: WarehouseTransferProduct[];
};

export type RecordWarehouseTransferItemInput = {
  productId: string;
  issueQuantity: number;
  looseQuantity: number;
};

export type RecordWarehouseTransferInput = {
  movementType: WarehouseTransferType;
  warehouseId: string;
  driverId: string;
  items: RecordWarehouseTransferItemInput[];
};

export type WarehouseMovementDashboardFilters = {
  warehouseId?: string;
  driverId?: string;
  from?: string;
  to?: string;
};

export type WarehouseMovementDashboardRow = {
  productId: string;
  sku: string | null;
  productName: string;
  normalizedUnit: string;

  taken: number;
  delivered: number;
  machineRefill: number;
  returned: number;

  driverNetMovement: number;
};

export type WarehouseMovementDashboardData = {
  warehouses: WarehouseTransferWarehouse[];
  drivers: WarehouseTransferDriver[];
  rows: WarehouseMovementDashboardRow[];

  summary: {
    productCount: number;
    movementCount: number;
    driverCount: number;
  };
};

export type InventoryReconciliationDriver = Pick<
  UserRow,
  "id" | "full_name" | "email" | "region"
>;

export type InventoryReconciliationProduct = Pick<
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

export type InventoryExpectedBalance = {
  productId: string;
  baselineQuantity: number | null;
  baselineAt: string | null;
  movementDelta: number;
  expectedQuantity: number | null;
  normalizedUnit: string;
  hasBaseline: boolean;
};

export type InventoryReconciliationData = {
  drivers: InventoryReconciliationDriver[];
  products: InventoryReconciliationProduct[];
};

export type CreateInventoryReconciliationItemInput = {
  productId: string;
  physicalQuantity: number;
  reason?: string;
};

export type CreateInventoryReconciliationInput = {
  driverId: string;
  notes?: string;
  items: CreateInventoryReconciliationItemInput[];
};

export type InventoryReconciliationItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  expectedQuantity: number | null;
  physicalQuantity: number;
  varianceQuantity: number | null;
  normalizedUnit: string;
  reason: string | null;
};

export type InventoryReconciliationDetail = {
  id: string;
  driverId: string;
  status: "draft" | "confirmed";
  notes: string | null;
  countedAt: string;
  confirmedAt: string | null;
  items: InventoryReconciliationItem[];
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

  const [productsResult, locationsResult] = await Promise.all([
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
    products: productsResult.data as InventoryProduct[],

    locations: locationsResult.data as InventoryLocation[],
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
  const safePageSize = Math.min(100, Math.max(1, pageSize));

  const from = (safePage - 1) * safePageSize;

  const to = from + safePageSize - 1;

  let query = supabase.from("inventory_movements").select(movementSelect, {
    count: "exact",
  });

  if (movementType) {
    query = query.eq("movement_type", movementType);
  }

  if (date) {
    const start = `${date}T00:00:00.000Z`;

    const nextDate = new Date(`${date}T00:00:00.000Z`);

    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

    query = query
      .gte("occurred_at", start)
      .lt("occurred_at", nextDate.toISOString());
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
        `source_visit_id.ilike.%${escapePostgrestSearch(normalizedSearch)}%`,
        `normalized_unit.ilike.%${escapePostgrestSearch(normalizedSearch)}%`,
      ].join(","),
    );
  }

  const { data, error, count } = await query
    .order("occurred_at", {
      ascending: false,
    })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const total = count ?? 0;

  return {
    movements: (data ?? []) as InventoryMovement[],

    total,
    page: safePage,
    pageSize: safePageSize,

    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

export async function getWarehouseTransferData(): Promise<WarehouseTransferData> {
  const supabase = createAdminClient();

  const [warehousesResult, driversResult, productsResult] = await Promise.all([
    supabase.from("warehouses").select("id, name, region").order("name"),

    supabase
      .from("users")
      .select("id, full_name, email, region")
      .eq("role", "driver")
      .eq("is_active", true)
      .order("full_name"),

    supabase
      .from("inventory_products")
      .select(
        `
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
      `,
      )
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  if (warehousesResult.error) {
    throw new Error(warehousesResult.error.message);
  }

  if (driversResult.error) {
    throw new Error(driversResult.error.message);
  }

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  return {
    warehouses: warehousesResult.data as WarehouseTransferWarehouse[],

    drivers: driversResult.data as WarehouseTransferDriver[],

    products: productsResult.data as WarehouseTransferProduct[],
  };
}

function escapePostgrestSearch(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export async function recordWarehouseTransfer(
  input: RecordWarehouseTransferInput,
): Promise<string[]> {
  const supabase = await createClient();

  const occurredAt = new Date().toISOString();

  const { data, error } = await supabase.rpc(
    "record_warehouse_driver_transfer_batch",
    {
      p_movement_type: input.movementType,
      p_warehouse_id: input.warehouseId,
      p_driver_id: input.driverId,
      p_items: input.items.map((item) => ({
        product_id: item.productId,
        issue_quantity: item.issueQuantity,
        loose_quantity: item.looseQuantity,
      })),
      p_occurred_at: occurredAt,
    },
  );

  if (error) {
    throw new Error(`Unable to record inventory transfer: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error("The inventory transfer did not return any movement IDs.");
  }

  return data;
}

export async function getWarehouseMovementDashboard(
  filters: WarehouseMovementDashboardFilters = {},
): Promise<WarehouseMovementDashboardData> {
  const supabase = createAdminClient();

  const [
    { data: warehouses, error: warehousesError },
    { data: drivers, error: driversError },
    { data: products, error: productsError },
    { data: locations, error: locationsError },
  ] = await Promise.all([
    supabase.from("warehouses").select("id, name, region").order("name"),

    supabase
      .from("users")
      .select("id, full_name, email, region")
      .eq("role", "driver")
      .eq("is_active", true)
      .order("full_name"),

    supabase.from("inventory_products").select("id, sku, name"),

    supabase.from("inventory_locations").select(`
        id,
        location_type,
        warehouse_id,
        driver_id,
        client_id,
        machine_id
      `),
  ]);

  if (warehousesError) {
    throw new Error(`Unable to load warehouses: ${warehousesError.message}`);
  }

  if (driversError) {
    throw new Error(`Unable to load drivers: ${driversError.message}`);
  }

  if (productsError) {
    throw new Error(
      `Unable to load inventory products: ${productsError.message}`,
    );
  }

  if (locationsError) {
    throw new Error(
      `Unable to load inventory locations: ${locationsError.message}`,
    );
  }

  const locationById = new Map(
    (locations ?? []).map((location) => [location.id, location]),
  );

  const productById = new Map(
    (products ?? []).map((product) => [product.id, product]),
  );

  /*
   * BREW-314 is reporting only.
   *
   * We intentionally read immutable inventory movements and
   * derive the dashboard values rather than storing another
   * mutable balance.
   */
  let movementQuery = supabase
    .from("inventory_movements")
    .select(
      `
      id,
      movement_type,
      product_id,
      from_location_id,
      to_location_id,
      normalized_quantity,
      normalized_unit,
      occurred_at
    `,
    )
    .in("movement_type", [
      "warehouse_issue",
      "client_delivery",
      "machine_refill",
      "warehouse_return",
    ])
    .order("occurred_at", {
      ascending: false,
    });

  if (filters.from) {
    movementQuery = movementQuery.gte(
      "occurred_at",
      `${filters.from}T00:00:00.000Z`,
    );
  }

  if (filters.to) {
    movementQuery = movementQuery.lte(
      "occurred_at",
      `${filters.to}T23:59:59.999Z`,
    );
  }

  const { data: movements, error: movementsError } = await movementQuery;

  if (movementsError) {
    throw new Error(
      `Unable to load warehouse movements: ${movementsError.message}`,
    );
  }

  /*
   * If a warehouse is selected, first determine which drivers
   * actually received inventory from that warehouse.
   *
   * Client deliveries and machine refills no longer contain
   * the warehouse location, so warehouse attribution must be
   * derived through the driver's warehouse_issue movements.
   *
   * This is suitable for the current dashboard view, but is
   * not an accounting-grade warehouse-lot attribution model.
   */
  const warehouseDriverIds = new Set<string>();

  if (filters.warehouseId) {
    for (const movement of movements ?? []) {
      if (movement.movement_type !== "warehouse_issue") {
        continue;
      }

      if (!movement.from_location_id || !movement.to_location_id) {
        continue;
      }

      const from = locationById.get(movement.from_location_id);

      const to = locationById.get(movement.to_location_id);

      if (
        from?.location_type === "warehouse" &&
        from.warehouse_id === filters.warehouseId &&
        to?.location_type === "driver" &&
        to.driver_id
      ) {
        warehouseDriverIds.add(to.driver_id);
      }
    }
  }

  const grouped = new Map<string, WarehouseMovementDashboardRow>();

  function getRow(
    productId: string,
    normalizedUnit: string,
  ): WarehouseMovementDashboardRow {
    const key = `${productId}:${normalizedUnit}`;

    const existing = grouped.get(key);

    if (existing) {
      return existing;
    }

    const product = productById.get(productId);

    const row: WarehouseMovementDashboardRow = {
      productId,
      sku: product?.sku ?? null,
      productName: product?.name ?? "Unknown product",
      normalizedUnit,

      taken: 0,
      delivered: 0,
      machineRefill: 0,
      returned: 0,
      driverNetMovement: 0,
    };

    grouped.set(key, row);

    return row;
  }

  const includedDriverIds = new Set<string>();

  let includedMovementCount = 0;

  for (const movement of movements ?? []) {
    const from = movement.from_location_id
      ? locationById.get(movement.from_location_id)
      : undefined;

    const to = movement.to_location_id
      ? locationById.get(movement.to_location_id)
      : undefined;

    let movementDriverId: string | null = null;
    let movementWarehouseId: string | null = null;

    switch (movement.movement_type) {
      case "warehouse_issue":
        movementWarehouseId = from?.warehouse_id ?? null;

        movementDriverId = to?.driver_id ?? null;
        break;

      case "warehouse_return":
        movementDriverId = from?.driver_id ?? null;

        movementWarehouseId = to?.warehouse_id ?? null;
        break;

      case "client_delivery":
      case "machine_refill":
        movementDriverId = from?.driver_id ?? null;
        break;
    }

    if (filters.driverId && movementDriverId !== filters.driverId) {
      continue;
    }

    if (filters.warehouseId) {
      if (
        movement.movement_type === "warehouse_issue" ||
        movement.movement_type === "warehouse_return"
      ) {
        if (movementWarehouseId !== filters.warehouseId) {
          continue;
        }
      } else if (
        !movementDriverId ||
        !warehouseDriverIds.has(movementDriverId)
      ) {
        continue;
      }
    }

    const quantity = Number(movement.normalized_quantity);

    if (!Number.isFinite(quantity)) {
      continue;
    }

    includedMovementCount += 1;

    if (movementDriverId) {
      includedDriverIds.add(movementDriverId);
    }

    const row = getRow(movement.product_id, movement.normalized_unit);

    switch (movement.movement_type) {
      case "warehouse_issue":
        row.taken += quantity;
        break;

      case "client_delivery":
        row.delivered += quantity;
        break;

      case "machine_refill":
        row.machineRefill += quantity;
        break;

      case "warehouse_return":
        row.returned += quantity;
        break;
    }
  }

  const rows = Array.from(grouped.values())
    .map((row) => ({
      ...row,

      /*
       * This is the driver's net ledger movement for the
       * selected period, NOT an authoritative physical
       * warehouse/van on-hand balance.
       */
      driverNetMovement:
        row.taken - row.delivered - row.machineRefill - row.returned,
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName));

  return {
    warehouses: (warehouses ?? []) as WarehouseTransferWarehouse[],

    drivers: (drivers ?? []) as WarehouseTransferDriver[],

    rows,

    summary: {
      productCount: rows.length,
      movementCount: includedMovementCount,
      driverCount: includedDriverIds.size,
    },
  };
}

export async function getInventoryReconciliationData(): Promise<InventoryReconciliationData> {
  const supabase = createAdminClient();

  const [driversResult, productsResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, email, region")
      .eq("role", "driver")
      .eq("is_active", true)
      .order("full_name"),

    supabase
      .from("inventory_products")
      .select(
        `
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
        `,
      )
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  if (driversResult.error) {
    throw new Error(
      `Unable to load drivers: ${driversResult.error.message}`,
    );
  }

  if (productsResult.error) {
    throw new Error(
      `Unable to load inventory products: ${productsResult.error.message}`,
    );
  }

  return {
    drivers:
      (driversResult.data ?? []) as InventoryReconciliationDriver[],

    products:
      (productsResult.data ?? []) as InventoryReconciliationProduct[],
  };
}

export async function getDriverExpectedInventory(
  driverId: string,
): Promise<InventoryExpectedBalance[]> {
  const supabase = await createClient();

  const { products } = await getInventoryReconciliationData();

  const results = await Promise.all(
    products.map(async (product) => {
      const { data, error } = await supabase.rpc(
        "get_driver_inventory_expected_balance",
        {
          p_driver_id: driverId,
          p_product_id: product.id,
          p_as_of: new Date().toISOString(),
        },
      );

      if (error) {
        throw new Error(
          `Unable to calculate expected inventory for ${product.name}: ${error.message}`,
        );
      }

      const row = data?.[0];

      if (!row) {
        throw new Error(
          `Expected inventory was not returned for ${product.name}.`,
        );
      }

      return {
        productId: product.id,

        baselineQuantity:
          row.baseline_quantity === null
            ? null
            : Number(row.baseline_quantity),

        baselineAt: row.baseline_at,

        movementDelta: Number(row.movement_delta),

        expectedQuantity:
          row.expected_quantity === null
            ? null
            : Number(row.expected_quantity),

        normalizedUnit: row.normalized_unit,

        hasBaseline: row.has_baseline,
      };
    }),
  );

  return results;
}

export async function createInventoryReconciliation(
  input: CreateInventoryReconciliationInput,
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "create_driver_inventory_reconciliation",
    {
      p_driver_id: input.driverId,

      p_items: input.items.map((item) => ({
        product_id: item.productId,
        physical_quantity: item.physicalQuantity,
        reason: item.reason?.trim() || null,
      })),

      p_notes: input.notes?.trim() || undefined,
    },
  );

  if (error) {
    throw new Error(
      `Unable to create inventory reconciliation: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Inventory reconciliation did not return an ID.",
    );
  }

  return data;
}

export async function getInventoryReconciliation(
  reconciliationId: string,
): Promise<InventoryReconciliationDetail> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("inventory_reconciliations")
    .select(
      `
        id,
        driver_id,
        status,
        notes,
        counted_at,
        confirmed_at,
        items:inventory_reconciliation_items (
          id,
          product_id,
          expected_quantity,
          physical_quantity,
          variance_quantity,
          normalized_unit,
          reason,
          product:inventory_products (
            id,
            sku,
            name
          )
        )
      `,
    )
    .eq("id", reconciliationId)
    .single();

  if (error) {
    throw new Error(
      `Unable to load inventory reconciliation: ${error.message}`,
    );
  }

  return {
    id: data.id,
    driverId: data.driver_id,
    status: data.status,
    notes: data.notes,
    countedAt: data.counted_at,
    confirmedAt: data.confirmed_at,

    items: data.items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName:
        item.product?.name ?? "Unknown product",
      sku: item.product?.sku ?? null,

      expectedQuantity:
        item.expected_quantity === null
          ? null
          : Number(item.expected_quantity),

      physicalQuantity: Number(item.physical_quantity),

      varianceQuantity:
        item.variance_quantity === null
          ? null
          : Number(item.variance_quantity),

      normalizedUnit: item.normalized_unit,
      reason: item.reason,
    })),
  };
}

export async function confirmInventoryReconciliation(
  reconciliationId: string,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.rpc(
    "confirm_driver_inventory_reconciliation",
    {
      p_reconciliation_id: reconciliationId,
    },
  );

  if (error) {
    throw new Error(
      `Unable to confirm inventory reconciliation: ${error.message}`,
    );
  }
}
