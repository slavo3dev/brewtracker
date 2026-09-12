"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { SearchIcon } from "@/components/ui/icons";

import type {
  InventoryLocation,
  InventoryMovementPage,
  InventoryMovementType,
  InventoryProduct,
} from "@/lib/inventory/inventory-service";

import { InventoryLocationCard } from "./inventory-location-card";
import { InventoryMovementCard } from "./inventory-movement-card";
import { InventoryProductCard } from "./inventory-product-card";
import { loadInventoryMovements } from "./actions";

type Props = {
  products: InventoryProduct[];
  locations: InventoryLocation[];
  initialMovements: InventoryMovementPage;
};

type InventoryTab =
  | "movements"
  | "products"
  | "locations";

const PAGE_SIZE = 10;

const inputClass =
  "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function InventoryManagement({
  products,
  locations,
  initialMovements,
}: Props) {
  const [tab, setTab] =
    useState<InventoryTab>("movements");

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-display text-3xl text-espresso-950">
            Inventory
          </h1>

          <p className="mt-2 text-sm text-steam-400">
            Review product configuration, custody
            locations, and inventory movement history.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          
          <Link
            href="/dashboard/inventory/transfers"
            className="inline-flex items-center justify-center rounded-full bg-espresso-950 px-4 py-2.5 text-sm font-medium text-crema-50 transition hover:opacity-90"
          >
            Record transfer
          </Link>
          
          <Link
            href="/dashboard/inventory/warehouses"
            className="inline-flex items-center justify-center rounded-full border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm font-medium text-espresso-800 transition hover:bg-latte-100"
          >
            Warehouses
          </Link>

          <Link
            href="/dashboard/inventory/machines"
            className="inline-flex items-center justify-center rounded-full border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm font-medium text-espresso-800 transition hover:bg-latte-100"
          >
            Machines
          </Link>
        </div>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-latte-200">
        <TabButton
          active={tab === "movements"}
          onClick={() => setTab("movements")}
        >
          Movement history
        </TabButton>

        <TabButton
          active={tab === "products"}
          onClick={() => setTab("products")}
        >
          Products
        </TabButton>

        <TabButton
          active={tab === "locations"}
          onClick={() => setTab("locations")}
        >
          Locations
        </TabButton>
      </div>

      {tab === "movements" && (
        <MovementSection initialMovements={initialMovements} />
      )}

      {tab === "products" && (
        <ProductSection products={products} />
      )}

      {tab === "locations" && (
        <LocationSection locations={locations} />
      )}
    </>
  );
}

function MovementSection({
  initialMovements,
}: {
  initialMovements: InventoryMovementPage;
}) {
  const [search, setSearch] = useState("");

  const [movementType, setMovementType] =
    useState<InventoryMovementType | "">("");

  const [date, setDate] = useState("");

  const [result, setResult] =
    useState(initialMovements);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const requestIdRef = useRef(0);

  async function loadPage(
    page: number,
    overrides?: {
      search?: string;
      movementType?: InventoryMovementType | "";
      date?: string;
    },
  ) {
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const nextResult =
        await loadInventoryMovements({
          search:
            overrides?.search ?? search,

          movementType:
            overrides?.movementType ??
            movementType,

          date:
            overrides?.date ?? date,

          page,
          pageSize: PAGE_SIZE,
        });

      if (
        requestId !== requestIdRef.current
      ) {
        return;
      }

      setResult(nextResult);
    } catch (loadError) {
      if (
        requestId !== requestIdRef.current
      ) {
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load inventory movements.",
      );
    } finally {
      if (
        requestId === requestIdRef.current
      ) {
        setLoading(false);
      }
    }
  }

  function handleMovementTypeChange(
    value: InventoryMovementType | "",
  ) {
    setMovementType(value);

    void loadPage(1, {
      movementType: value,
    });
  }

  function handleDateChange(
    value: string,
  ) {
    setDate(value);

    void loadPage(1, {
      date: value,
    });
  }

  function handleSearchSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    void loadPage(1);
  }

  function clearFilters() {
    setSearch("");
    setMovementType("");
    setDate("");

    void loadPage(1, {
      search: "",
      movementType: "",
      date: "",
    });
  }

  const hasFilters = Boolean(
    search || movementType || date,
  );

  return (
    <section>
      <SectionHeader
        title="Movement history"
        count={result.movements.length}
        total={result.total}
        noun="movements"
        hasFilters={hasFilters}
        onClear={clearFilters}
        paginated
        page={result.page}
        pageSize={result.pageSize}
      />

      <form
        onSubmit={handleSearchSubmit}
        className="mb-5 grid gap-3 rounded-2xl border border-latte-200 bg-crema-0 p-4 shadow-sm md:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <label className="relative">
          <span className="sr-only">
            Search movements
          </span>

          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steam-400" />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search visit or unit"
            className={`${inputClass} pl-9`}
          />
        </label>

        <select
          aria-label="Filter by movement type"
          value={movementType}
          onChange={(event) =>
            handleMovementTypeChange(
              event.target.value as
                | InventoryMovementType
                | "",
            )
          }
          className={inputClass}
        >
          <option value="">
            All movement types
          </option>

          <option value="client_delivery">
            Client Delivery
          </option>

          <option value="machine_refill">
            Machine Refill
          </option>

          <option value="warehouse_issue">
            Warehouse Issue
          </option>

          <option value="warehouse_return">
            Warehouse Return
          </option>

          <option value="adjustment">
            Inventory Adjustment
          </option>
        </select>

        <input
          aria-label="Filter by movement date"
          type="date"
          value={date}
          onChange={(event) =>
            handleDateChange(
              event.target.value,
            )
          }
          className={inputClass}
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-copper-500 px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div
        className={
          loading
            ? "pointer-events-none opacity-50"
            : undefined
        }
      >
        {result.movements.length === 0 ? (
          <EmptyState>
            No inventory movements match the
            selected filters.
          </EmptyState>
        ) : (
          <div className="grid gap-4">
            {result.movements.map(
              (movement) => (
                <InventoryMovementCard
                  key={movement.id}
                  movement={movement}
                />
              ),
            )}
          </div>
        )}
      </div>

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        label="Movement"
        onPrevious={() =>
          void loadPage(result.page - 1)
        }
        onNext={() =>
          void loadPage(result.page + 1)
        }
      />
    </section>
  );
}

function ProductSection({
  products,
}: {
  products: InventoryProduct[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const categories = useMemo(
    () =>
      [
        ...new Set(
          products.map(
            (product) => product.category,
          ),
        ),
      ].sort(),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const searchableText = [
        product.name,
        product.sku,
        product.package_description,
        product.base_unit,
        product.issue_unit,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!query ||
          searchableText.includes(query)) &&
        (!category ||
          product.category === category) &&
        (!status ||
          String(product.is_active) === status)
      );
    });
  }, [category, products, search, status]);

  useEffect(() => {
    setPage(1);
  }, [search, category, status]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredProducts.length / PAGE_SIZE,
    ),
  );

  const visibleProducts = filteredProducts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const hasFilters = Boolean(
    search || category || status,
  );

  function clearFilters() {
    setSearch("");
    setCategory("");
    setStatus("");
  }

  return (
    <section>
      <SectionHeader
        title="Products"
        count={filteredProducts.length}
        total={products.length}
        noun="products"
        hasFilters={hasFilters}
        onClear={clearFilters}
      />

      <div className="mb-5 grid gap-3 rounded-2xl border border-latte-200 bg-crema-0 p-4 shadow-sm md:grid-cols-3">
        <label className="relative">
          <span className="sr-only">
            Search products
          </span>

          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steam-400" />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search products"
            className={`${inputClass} pl-9`}
          />
        </label>

        <select
          aria-label="Filter by category"
          value={category}
          onChange={(event) =>
            setCategory(event.target.value)
          }
          className={inputClass}
        >
          <option value="">
            All categories
          </option>

          {categories.map((item) => (
            <option key={item} value={item}>
              {formatLabel(item)}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by product status"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value)
          }
          className={inputClass}
        >
          <option value="">
            All statuses
          </option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {visibleProducts.length === 0 ? (
        <EmptyState>
          No products match the selected filters.
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {visibleProducts.map((product) => (
            <InventoryProductCard
              key={product.id}
              product={product}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        label="Product"
        onPrevious={() =>
          setPage((value) => value - 1)
        }
        onNext={() =>
          setPage((value) => value + 1)
        }
      />
    </section>
  );
}

function LocationSection({
  locations,
}: {
  locations: InventoryLocation[];
}) {
  const [search, setSearch] = useState("");
  const [locationType, setLocationType] =
    useState("");
  const [page, setPage] = useState(1);

  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return locations.filter((location) => {
      const searchableText = [
        getLocationLabel(location),
        location.driver?.email,
        location.machine?.serial_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!query ||
          searchableText.includes(query)) &&
        (!locationType ||
          location.location_type ===
            locationType)
      );
    });
  }, [locationType, locations, search]);

  useEffect(() => {
    setPage(1);
  }, [search, locationType]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredLocations.length / PAGE_SIZE,
    ),
  );

  const visibleLocations =
    filteredLocations.slice(
      (page - 1) * PAGE_SIZE,
      page * PAGE_SIZE,
    );

  const hasFilters = Boolean(
    search || locationType,
  );

  function clearFilters() {
    setSearch("");
    setLocationType("");
  }

  return (
    <section>
      <SectionHeader
        title="Inventory locations"
        count={filteredLocations.length}
        total={locations.length}
        noun="locations"
        hasFilters={hasFilters}
        onClear={clearFilters}
      />

      <div className="mb-5 grid gap-3 rounded-2xl border border-latte-200 bg-crema-0 p-4 shadow-sm md:grid-cols-2">
        <label className="relative">
          <span className="sr-only">
            Search inventory locations
          </span>

          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steam-400" />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search locations"
            className={`${inputClass} pl-9`}
          />
        </label>

        <select
          aria-label="Filter by location type"
          value={locationType}
          onChange={(event) =>
            setLocationType(event.target.value)
          }
          className={inputClass}
        >
          <option value="">
            All location types
          </option>
          <option value="warehouse">
            Warehouse
          </option>
          <option value="driver">
            Driver / Van
          </option>
          <option value="client_reserve">
            Client Reserve
          </option>
          <option value="machine">
            Machine
          </option>
        </select>
      </div>

      {visibleLocations.length === 0 ? (
        <EmptyState>
          No inventory locations match the
          selected filters.
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {visibleLocations.map((location) => (
            <InventoryLocationCard
              key={location.id}
              location={location}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        label="Location"
        onPrevious={() =>
          setPage((value) => value - 1)
        }
        onNext={() =>
          setPage((value) => value + 1)
        }
      />
    </section>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
        active
          ? "border-copper-500 text-copper-600"
          : "border-transparent text-steam-400 hover:text-espresso-800"
      }`}
    >
      {children}
    </button>
  );
}

function SectionHeader({
  title,
  count,
  total,
  noun,
  hasFilters,
  onClear,
  paginated = false,
  page = 1,
  pageSize = PAGE_SIZE,
}: {
  title: string;
  count: number;
  total: number;
  noun: string;
  hasFilters: boolean;
  onClear: () => void;
  paginated?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const start =
    total === 0
      ? 0
      : (page - 1) * pageSize + 1;

  const end =
    total === 0
      ? 0
      : start + count - 1;

  return (
    <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-espresso-950">
          {title}
        </h2>

        <p className="text-sm text-steam-400">
          {paginated
            ? `${total} ${noun} · Showing ${start}–${end}`
            : `Showing ${count} of ${total} ${noun}`}
        </p>
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className="text-left text-sm font-medium text-copper-600 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function EmptyState({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-latte-200 bg-crema-0 p-8 text-center text-sm text-steam-400">
      {children}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  label,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  label: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label={`${label} pagination`}
      className="mt-6 flex items-center justify-between gap-4"
    >
      <button
        type="button"
        disabled={page === 1}
        onClick={onPrevious}
        className="rounded-full border border-latte-200 px-4 py-2 text-sm font-medium text-espresso-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Previous
      </button>

      <p className="text-sm text-steam-400">
        Page {page} of {totalPages}
      </p>

      <button
        type="button"
        disabled={page === totalPages}
        onClick={onNext}
        className="rounded-full border border-latte-200 px-4 py-2 text-sm font-medium text-espresso-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  );
}

export function getLocationLabel(
  location: InventoryLocation | null,
) {
  if (!location) {
    return "External";
  }

  switch (location.location_type) {
    case "warehouse":
      return location.warehouse?.name ??
        "Warehouse";

    case "driver":
      return location.driver?.full_name ??
        "Driver / Van";

    case "client_reserve":
      return location.client?.name ??
        "Client Reserve";

    case "machine":
      return (
        location.machine?.name ||
        (location.machine?.serial_number
          ? `Machine ${location.machine.serial_number}`
          : "Machine")
      );

    default:
      return "Unknown location";
  }
}

export function formatLabel(value: string) {
  return value
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}