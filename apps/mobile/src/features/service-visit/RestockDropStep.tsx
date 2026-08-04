import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { loadClientInventoryProducts } from "./inventory-audit.service";
import { useServiceVisit } from "./ServiceVisitProvider";
import type {
  ClientInventoryProduct,
  InventoryAuditItemRecord,
  InventoryProductCategory,
} from "./service-visit.types";

const CATEGORY_LABELS: Record<
  InventoryProductCategory,
  string
> = {
  coffee: "Coffee",
  powders: "Powders",
  sweeteners_stirrers: "Sweeteners & Stirrers",
  cups_lids: "Cups & Lids",
  creamers: "Creamers",
  cleaning: "Cleaning",
};

type RestockRow = {
  product: ClientInventoryProduct;
  auditItem: InventoryAuditItemRecord;
  recommendedQuantity: number;
};

type QuantityValues = Record<string, string>;

function normalizeQuantityInput(value: string): string {
  const normalized = value.replace(",", ".");

  if (!/^\d*(\.\d{0,3})?$/.test(normalized)) {
    return "";
  }

  return normalized;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value)
    ? value.toString()
    : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export default function RestockDropStep() {
  const {
    activeVisit,
    completeRestockDrop,
  } = useServiceVisit();

  const [products, setProducts] =
    useState<ClientInventoryProduct[]>([]);

  const [actualQuantities, setActualQuantities] =
    useState<QuantityValues>({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const clientId = activeVisit?.clientId ?? null;
  const inventoryAudit = activeVisit?.inventoryAudit ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadProducts(): Promise<void> {
      if (!clientId) {
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const result =
          await loadClientInventoryProducts(clientId);

        if (!cancelled) {
          setProducts(result);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load the restock configuration.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const rows = useMemo<RestockRow[]>(() => {
    if (!inventoryAudit) {
      return [];
    }

    const productsById = new Map(
      products.map((product) => [
        product.productId,
        product,
      ]),
    );

    return inventoryAudit.items.flatMap(
      (auditItem) => {
        const product = productsById.get(
          auditItem.productId,
        );

        if (!product || product.parLevel === null) {
          return [];
        }

        return [
          {
            product,
            auditItem,
            recommendedQuantity: Math.max(
              product.parLevel - auditItem.quantity,
              0,
            ),
          },
        ];
      },
    );
  }, [inventoryAudit, products]);

  useEffect(() => {
    if (rows.length === 0) {
      return;
    }

    setActualQuantities((current) => {
      if (Object.keys(current).length > 0) {
        return current;
      }

      return Object.fromEntries(
        rows.map((row) => [
          row.product.productId,
          formatQuantity(row.recommendedQuantity),
        ]),
      );
    });
  }, [rows]);

  if (!activeVisit) {
    return null;
  }

  if (
    !inventoryAudit ||
    inventoryAudit.syncStatus !== "synced" ||
    !inventoryAudit.databaseId
  ) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Step 6</Text>

        <Text style={styles.title}>
          Inventory audit required
        </Text>

        <Text style={styles.description}>
          Step 5 must be synced before restock recommendations can be
          calculated.
        </Text>
      </View>
    );
  }

  const productsWithoutPar = inventoryAudit.items.filter(
    (auditItem) => {
      const product = products.find(
        (configuredProduct) =>
          configuredProduct.productId ===
          auditItem.productId,
      );

      return !product || product.parLevel === null;
    },
  );

  const missingQuantityCount = rows.filter(
    (row) =>
      actualQuantities[
        row.product.productId
      ]?.trim() === "",
  ).length;

  const hasInvalidQuantity = rows.some((row) => {
    const value =
      actualQuantities[row.product.productId];

    if (value === undefined || value.trim() === "") {
      return false;
    }

    const quantity = Number(value);

    return !Number.isFinite(quantity) || quantity < 0;
  });

  const canSubmit =
    !loading &&
    !submitting &&
    rows.length > 0 &&
    productsWithoutPar.length === 0 &&
    missingQuantityCount === 0 &&
    !hasInvalidQuantity;

  const groupedRows = new Map<
    InventoryProductCategory,
    RestockRow[]
  >();

  for (const row of rows) {
    const categoryRows =
      groupedRows.get(row.product.category) ?? [];

    categoryRows.push(row);
    groupedRows.set(
      row.product.category,
      categoryRows,
    );
  }

  function updateActualQuantity(
    productId: string,
    value: string,
  ): void {
    const normalized =
      normalizeQuantityInput(value);

    if (value.length > 0 && normalized === "") {
      return;
    }

    setActualQuantities((current) => ({
      ...current,
      [productId]: normalized,
    }));

    setErrorMessage(null);
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeRestockDrop({
        quantities: rows.map((row) => ({
          productId: row.product.productId,
          actualQuantity: Number(
            actualQuantities[
              row.product.productId
            ] ?? "0",
          ),
        })),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete the restock drop.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator />

        <Text style={styles.loadingText}>
          Calculating recommended restock…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Step 6</Text>

      <Text style={styles.title}>
        Confirm restock and drop
      </Text>

      <Text style={styles.description}>
        Recommended quantities are calculated from the client par level
        minus the stock counted during Step 5. Confirm what you actually
        leave at the location.
      </Text>

      <View style={styles.clientCard}>
        <Text style={styles.clientLabel}>
          Destination
        </Text>

        <Text style={styles.clientName}>
          {activeVisit.target.clientName}
        </Text>

        <Text style={styles.movementText}>
          Inventory movement: Driver → Client
        </Text>
      </View>

      {productsWithoutPar.length > 0 ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>
            {productsWithoutPar.length} audited{" "}
            {productsWithoutPar.length === 1
              ? "product does"
              : "products do"}{" "}
            not have a configured par level. A manager must configure the
            missing par level before Step 6 can be completed.
          </Text>
        </View>
      ) : null}

      {Array.from(groupedRows.entries()).map(
        ([category, categoryRows]) => (
          <View
            key={category}
            style={styles.category}
          >
            <Text style={styles.categoryTitle}>
              {CATEGORY_LABELS[category]}
            </Text>

            {categoryRows.map((row) => (
              <View
                key={row.product.productId}
                style={styles.productCard}
              >
                <View style={styles.productHeader}>
                  <View style={styles.productContent}>
                    <Text style={styles.productName}>
                      {row.product.name}
                    </Text>

                    <Text style={styles.productDetail}>
                      {row.product.sku
                        ? `SKU ${row.product.sku} · `
                        : ""}
                      {row.product.unitLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.calculationRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>
                      Counted
                    </Text>

                    <Text style={styles.metricValue}>
                      {formatQuantity(
                        row.auditItem.quantity,
                      )}
                    </Text>
                  </View>

                  <Text style={styles.operator}>→</Text>

                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>
                      Par
                    </Text>

                    <Text style={styles.metricValue}>
                      {formatQuantity(
                        row.product.parLevel ?? 0,
                      )}
                    </Text>
                  </View>

                  <Text style={styles.operator}>=</Text>

                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>
                      Recommended
                    </Text>

                    <Text style={styles.recommendedValue}>
                      {formatQuantity(
                        row.recommendedQuantity,
                      )}
                    </Text>
                  </View>
                </View>

                <View style={styles.actualRow}>
                  <View style={styles.actualContent}>
                    <Text style={styles.actualLabel}>
                      Actual quantity left
                    </Text>

                    <Text style={styles.actualHint}>
                      Change this when the delivered quantity differs from
                      the recommendation.
                    </Text>
                  </View>

                  <TextInput
                    accessibilityLabel={`Actual restock quantity for ${row.product.name}`}
                    keyboardType="decimal-pad"
                    onChangeText={(value) => {
                      updateActualQuantity(
                        row.product.productId,
                        value,
                      );
                    }}
                    placeholder="0"
                    placeholderTextColor="#a89c8f"
                    style={styles.quantityInput}
                    value={
                      actualQuantities[
                        row.product.productId
                      ] ?? ""
                    }
                  />
                </View>
              </View>
            ))}
          </View>
        ),
      )}

      {missingQuantityCount > 0 ? (
        <Text style={styles.helperText}>
          Confirm the actual quantity for all{" "}
          {missingQuantityCount} remaining{" "}
          {missingQuantityCount === 1
            ? "product"
            : "products"}.
        </Text>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={() => {
          void handleSubmit();
        }}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed &&
            canSubmit &&
            styles.buttonPressed,
          !canSubmit &&
            styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            Confirm Restock and Continue
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffdfa",
    borderColor: "#e2d4c0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  eyebrow: {
    color: "#9c5621",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: "#2e1d12",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 7,
  },
  description: {
    color: "#8a6f53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  loadingText: {
    color: "#8a6f53",
    marginTop: 10,
    textAlign: "center",
  },
  clientCard: {
    backgroundColor: "#f7eadc",
    borderRadius: 12,
    marginTop: 16,
    padding: 14,
  },
  clientLabel: {
    color: "#9c5621",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  clientName: {
    color: "#2e1d12",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  movementText: {
    color: "#8a6f53",
    fontSize: 13,
    marginTop: 5,
  },
  category: {
    marginTop: 20,
  },
  categoryTitle: {
    color: "#2e1d12",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  productCard: {
    backgroundColor: "#ffffff",
    borderColor: "#eadfce",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  productHeader: {
    flexDirection: "row",
  },
  productContent: {
    flex: 1,
  },
  productName: {
    color: "#2e1d12",
    fontSize: 15,
    fontWeight: "700",
  },
  productDetail: {
    color: "#8a6f53",
    fontSize: 12,
    marginTop: 3,
  },
  calculationRow: {
    alignItems: "center",
    backgroundColor: "#f8f2e9",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    padding: 12,
  },
  metric: {
    alignItems: "center",
    flex: 1,
  },
  metricLabel: {
    color: "#8a6f53",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metricValue: {
    color: "#2e1d12",
    fontSize: 17,
    fontWeight: "700",
    marginTop: 4,
  },
  recommendedValue: {
    color: "#9c5621",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 4,
  },
  operator: {
    color: "#aa9279",
    fontSize: 16,
    marginHorizontal: 3,
  },
  actualRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  actualContent: {
    flex: 1,
  },
  actualLabel: {
    color: "#2e1d12",
    fontSize: 13,
    fontWeight: "700",
  },
  actualHint: {
    color: "#8a6f53",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
  quantityInput: {
    backgroundColor: "#fffdfa",
    borderColor: "#d7c4aa",
    borderRadius: 10,
    borderWidth: 1,
    color: "#2e1d12",
    fontSize: 17,
    fontWeight: "700",
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: "center",
  },
  helperText: {
    color: "#8a6f53",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  errorCard: {
    backgroundColor: "#fff0ed",
    borderColor: "#efb7ad",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  errorText: {
    color: "#9d3025",
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#9c5621",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 50,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});