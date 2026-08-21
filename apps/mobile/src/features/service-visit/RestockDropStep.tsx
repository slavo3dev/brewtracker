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

const CATEGORY_LABELS: Record<InventoryProductCategory, string> = {
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
  const { activeVisit, completeRestockDrop } = useServiceVisit();

  const [products, setProducts] = useState<ClientInventoryProduct[]>([]);

  const [actualQuantities, setActualQuantities] = useState<QuantityValues>({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        const result = await loadClientInventoryProducts(clientId);

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
      products.map((product) => [product.productId, product]),
    );

    return inventoryAudit.items.flatMap((auditItem) => {
      const product = productsById.get(auditItem.productId);

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
    });
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
      <View style={styles.errorCard}>
        <Text style={styles.errorText}>
          Complete and sync the Inventory Audit before continuing.
        </Text>
      </View>
    );
  }

  const productsWithoutPar = inventoryAudit.items.filter((auditItem) => {
    const product = products.find(
      (configuredProduct) =>
        configuredProduct.productId === auditItem.productId,
    );

    return !product || product.parLevel === null;
  });

  const missingQuantityCount = rows.filter(
    (row) => actualQuantities[row.product.productId]?.trim() === "",
  ).length;

  const hasInvalidQuantity = rows.some((row) => {
    const value = actualQuantities[row.product.productId];

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

  const groupedRows = new Map<InventoryProductCategory, RestockRow[]>();

  for (const row of rows) {
    const categoryRows = groupedRows.get(row.product.category) ?? [];

    categoryRows.push(row);
    groupedRows.set(row.product.category, categoryRows);
  }

  function updateActualQuantity(productId: string, value: string): void {
    const normalized = normalizeQuantityInput(value);

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
            actualQuantities[row.product.productId] ?? "0",
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

        <Text style={styles.loadingText}>Calculating recommended restock…</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {productsWithoutPar.length > 0 ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>
            {productsWithoutPar.length}{" "}
            {productsWithoutPar.length === 1 ? "product is" : "products are"}{" "}
            missing a configured par level.
          </Text>
        </View>
      ) : null}

      {Array.from(groupedRows.entries()).map(([category, categoryRows]) => (
        <View key={category} style={styles.category}>
          <Text style={styles.categoryTitle}>{CATEGORY_LABELS[category]}</Text>

          {categoryRows.map((row) => (
            <View key={row.product.productId} style={styles.productCard}>
              <View style={styles.productContent}>
                <Text style={styles.productName}>{row.product.name}</Text>

                <Text style={styles.productDetail}>
                  {row.product.unitLabel}
                </Text>
              </View>

              <View style={styles.refillRow}>
                <View style={styles.recommendation}>
                  <Text style={styles.recommendationLabel}>
                    Recommended refill
                  </Text>

                  <Text style={styles.recommendedValue}>
                    {formatQuantity(row.recommendedQuantity)}
                  </Text>
                </View>

                <View style={styles.actual}>
                  <Text style={styles.actualLabel}>Actual</Text>

                  <TextInput
                    accessibilityLabel={`Actual restock quantity for ${row.product.name}`}
                    keyboardType="decimal-pad"
                    onChangeText={(value) => {
                      updateActualQuantity(row.product.productId, value);
                    }}
                    placeholder="0"
                    placeholderTextColor="#a89c8f"
                    style={styles.quantityInput}
                    value={actualQuantities[row.product.productId] ?? ""}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      ))}

      {missingQuantityCount > 0 ? (
        <Text style={styles.helperText}>
          Enter the actual quantity for all products.
        </Text>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
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
          pressed && canSubmit && styles.buttonPressed,
          !canSubmit && styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>Confirm & Continue</Text>
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
  loadingText: {
    color: "#8a6f53",
    marginTop: 10,
    textAlign: "center",
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
  recommendedValue: {
    color: "#9c5621",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 4,
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
  refillRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  recommendation: {
    flex: 1,
  },
  recommendationLabel: {
    color: "#8a6f53",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  actual: {
    alignItems: "center",
  },
  actualLabel: {
    color: "#8a6f53",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
    textTransform: "uppercase",
  },
});
