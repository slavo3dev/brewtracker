import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  loadClientInventoryProducts,
  loadPreviousClientReserveBalances,
} from "./inventory-audit.service";
import { useServiceVisit } from "./ServiceVisitProvider";
import type {
  ClientInventoryProduct,
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

type ProductCountValue = {
  issueQuantity: string;
  looseQuantity: string;
};

type CountValues = Record<string, ProductCountValue>;

function emptyCount(): ProductCountValue {
  return {
    issueQuantity: "",
    looseQuantity: "",
  };
}

function normalizeQuantityInput(value: string): string {
  const normalized = value.replace(",", ".");

  if (!/^\d*(\.\d{0,3})?$/.test(normalized)) {
    return "";
  }

  return normalized;
}

function normalizeWholeQuantityInput(value: string): string {
  if (!/^\d*$/.test(value)) {
    return "";
  }

  return value;
}

export default function InventoryAuditStep() {
  const { activeVisit, completeInventoryAudit } = useServiceVisit();

  const [products, setProducts] = useState<ClientInventoryProduct[]>([]);

  const [counts, setCounts] = useState<CountValues>({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [previousBalances, setPreviousBalances] = useState<
    Map<string, number | null>
  >(new Map());

  const clientId = activeVisit?.clientId ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadProducts(): Promise<void> {
      if (!clientId) {
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        // 1. Load products configured for this client.
        const result = await loadClientInventoryProducts(clientId);

        // 2. Load previous after-service reserve
        // balances for those products.
        const balances = await loadPreviousClientReserveBalances(
          clientId,
          result,
          new Date().toISOString(),
        );

        if (!cancelled) {
          // 3. Store products and their previous balances.
          setProducts(result);
          setPreviousBalances(balances);

          // 4. Restore an unfinished local reserve count.
          const savedAudit = activeVisit?.inventoryAudit;

          const activeVisitId = activeVisit?.id;

          if (
            savedAudit &&
            activeVisitId &&
            savedAudit.sourceVisitId === activeVisitId &&
            savedAudit.syncStatus !== "synced"
          ) {
            const restoredCounts = Object.fromEntries(
              savedAudit.items.map((item) => [
                item.productId,
                {
                  issueQuantity: String(item.issueQuantity ?? 0),

                  looseQuantity: String(item.looseQuantity ?? 0),
                },
              ]),
            );

            setCounts((current) =>
              Object.keys(current).length > 0 ? current : restoredCounts,
            );
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load the client reserve.",
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
  }, [clientId, activeVisit?.id, activeVisit?.inventoryAudit]);

  const groupedProducts = useMemo(() => {
    const groups = new Map<
      InventoryProductCategory,
      ClientInventoryProduct[]
    >();

    for (const product of products) {
      const categoryProducts = groups.get(product.category) ?? [];

      categoryProducts.push(product);
      groups.set(product.category, categoryProducts);
    }

    return Array.from(groups.entries());
  }, [products]);

  if (!activeVisit) {
    return null;
  }

  const missingRequiredCount = products.filter((product) => {
    if (!product.isRequired) {
      return false;
    }

    const count = counts[product.productId];

    if (!count) {
      return true;
    }

    return (
      count.issueQuantity.trim() === "" && count.looseQuantity.trim() === ""
    );
  }).length;

  const hasInvalidQuantity = products.some((product) => {
    const count = counts[product.productId];

    if (!count) {
      return false;
    }

    const issueQuantity =
      count.issueQuantity.trim() === "" ? 0 : Number(count.issueQuantity);

    const looseQuantity =
      count.looseQuantity.trim() === "" ? 0 : Number(count.looseQuantity);

    if (
      !Number.isFinite(issueQuantity) ||
      issueQuantity < 0 ||
      !Number.isInteger(issueQuantity)
    ) {
      return true;
    }

    if (!Number.isFinite(looseQuantity) || looseQuantity < 0) {
      return true;
    }

    if (
      !product.packaging.allowsPartialBaseUnit &&
      !Number.isInteger(looseQuantity)
    ) {
      return true;
    }

    if (!product.packaging.allowsLooseUnits && looseQuantity > 0) {
      return true;
    }

    return false;
  });

  const canSubmit =
    !loading &&
    !submitting &&
    products.length > 0 &&
    missingRequiredCount === 0 &&
    !hasInvalidQuantity;

  function updateCount(
    productId: string,
    field: "issueQuantity" | "looseQuantity",
    value: string,
  ): void {
    const normalized =
      field === "issueQuantity"
        ? normalizeWholeQuantityInput(value)
        : normalizeQuantityInput(value);

    if (value.length > 0 && normalized === "") {
      return;
    }

    setCounts((current) => ({
      ...current,

      [productId]: {
        ...(current[productId] ?? emptyCount()),
        [field]: normalized,
      },
    }));

    setErrorMessage(null);
  }

  const answeredProducts = products.filter((product) => {
    const count = counts[product.productId];

    if (!count) {
      return false;
    }

    return (
      count.issueQuantity.trim() !== "" || count.looseQuantity.trim() !== ""
    );
  });

  async function handleSubmit(): Promise<void> {
    if (submitting) {
      return;
    }

    if (missingRequiredCount > 0) {
      setErrorMessage(
        `Enter a quantity for all ${missingRequiredCount} remaining required ${
          missingRequiredCount === 1 ? "product" : "products"
        }.`,
      );
      return;
    }

    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeInventoryAudit({
        counts: answeredProducts.map((product) => {
          const count = counts[product.productId];

          return {
            productId: product.productId,

            issueQuantity: Number(count?.issueQuantity || 0),

            looseQuantity: Number(count?.looseQuantity || 0),
          };
        }),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete the inventory audit.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Step 5</Text>

      <Text style={styles.title}>Count client reserve</Text>

      <Text style={styles.description}>
        Count the stock physically available at this location before today's
        delivery and before using any stock to refill the machine.
      </Text>

      <View style={styles.clientCard}>
        <Text style={styles.clientLabel}>Location</Text>

        <Text style={styles.clientName}>{activeVisit.target.clientName}</Text>
      </View>

      {products.length === 0 ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            No inventory products are configured for this client. A manager must
            configure the expected product list before this step can be
            completed.
          </Text>
        </View>
      ) : null}

      {groupedProducts.map(([category, categoryProducts]) => (
        <View key={category} style={styles.category}>
          <Text style={styles.categoryTitle}>{CATEGORY_LABELS[category]}</Text>

          {categoryProducts.map((product) => {
            const count = counts[product.productId] ?? emptyCount();

            const issueQuantity = Number(count.issueQuantity || 0);

            const looseQuantity = Number(count.looseQuantity || 0);

            const total =
              issueQuantity * product.packaging.unitsPerIssueUnit +
              looseQuantity;

            const previous = previousBalances.get(product.productId) ?? null;

            const decrease = previous === null ? null : previous - total;

            return (
              <View key={product.productId} style={styles.reserveProduct}>
                <Text style={styles.productName}>{product.name}</Text>

                {product.sku ? (
                  <Text style={styles.productDetail}>SKU {product.sku}</Text>
                ) : null}

                <Text style={styles.packageDescription}>
                  {product.packaging.packageDescription ??
                    `${product.packaging.unitsPerIssueUnit} ${product.packaging.baseUnit} per ${product.packaging.issueUnit}`}
                </Text>

                <View style={styles.quantityGroup}>
                  <Text style={styles.quantityLabel}>
                    {product.packaging.issueUnit}
                  </Text>

                  <TextInput
                    accessibilityLabel={`${product.packaging.issueUnit} quantity for ${product.name}`}
                    keyboardType="number-pad"
                    onChangeText={(value) => {
                      updateCount(product.productId, "issueQuantity", value);
                    }}
                    placeholder="0"
                    placeholderTextColor="#a89c8f"
                    style={styles.quantityInput}
                    value={count.issueQuantity}
                  />
                </View>

                {product.packaging.allowsLooseUnits ? (
                  <View style={styles.quantityGroup}>
                    <Text style={styles.quantityLabel}>
                      Loose {product.packaging.baseUnit}
                    </Text>

                    <TextInput
                      accessibilityLabel={`Loose ${product.packaging.baseUnit} quantity for ${product.name}`}
                      keyboardType={
                        product.packaging.allowsPartialBaseUnit
                          ? "decimal-pad"
                          : "number-pad"
                      }
                      onChangeText={(value) => {
                        updateCount(product.productId, "looseQuantity", value);
                      }}
                      placeholder="0"
                      placeholderTextColor="#a89c8f"
                      style={styles.quantityInput}
                      value={count.looseQuantity}
                    />
                  </View>
                ) : null}

                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Current reserve</Text>

                  <Text style={styles.totalValue}>
                    {total} {product.packaging.baseUnit}
                  </Text>
                </View>

                {previous === null ? (
                  <Text style={styles.baselineText}>
                    No previous reserve baseline
                  </Text>
                ) : (
                  <View style={styles.comparisonCard}>
                    <Text style={styles.comparisonText}>
                      Previous reserve: {previous} {product.packaging.baseUnit}
                    </Text>

                    <Text style={styles.comparisonText}>
                      Reserve change:{" "}
                      {decrease === 0
                        ? "No change"
                        : decrease !== null && decrease > 0
                          ? `${decrease} fewer`
                          : `${Math.abs(decrease ?? 0)} more`}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ))}

      {missingRequiredCount > 0 && products.length > 0 ? (
        <Text style={styles.helperText}>
          Enter a quantity for all {missingRequiredCount} remaining required{" "}
          {missingRequiredCount === 1 ? "product" : "products"}. Enter 0 when
          none remains.
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
          <Text style={styles.primaryButtonText}>
            Save Reserve and Continue
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
    color: "#4a2c1a",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  loadingText: {
    color: "#8a6f53",
    marginTop: 10,
    textAlign: "center",
  },
  warningCard: {
    backgroundColor: "#fff3d8",
    borderColor: "#e8cd86",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  warningText: {
    color: "#7a5414",
    fontSize: 13,
    lineHeight: 19,
  },
  category: {
    marginTop: 22,
  },
  categoryTitle: {
    color: "#4a2c1a",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  productName: {
    color: "#3d2b1f",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  productDetail: {
    color: "#8c8076",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  quantityInput: {
    backgroundColor: "#faf6f0",
    borderColor: "#d8c7b0",
    borderRadius: 10,
    borderWidth: 1,
    color: "#2e1d12",
    fontSize: 16,
    fontWeight: "700",
    minHeight: 44,
    paddingHorizontal: 10,
    textAlign: "center",
    width: 76,
  },
  helperText: {
    color: "#8a6f53",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
  },
  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 52,
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  reserveProduct: {
    borderBottomColor: "#efe6d8",
    borderBottomWidth: 1,
    paddingVertical: 14,
  },

  packageDescription: {
    color: "#8c8076",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  quantityGroup: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },

  quantityLabel: {
    color: "#4a2c1a",
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    paddingRight: 12,
  },

  totalRow: {
    alignItems: "center",
    backgroundColor: "#faf6f0",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    padding: 10,
  },

  totalLabel: {
    color: "#8a6f53",
    fontSize: 12,
    fontWeight: "600",
  },

  totalValue: {
    color: "#2e1d12",
    fontSize: 14,
    fontWeight: "700",
  },

  baselineText: {
    color: "#8c8076",
    fontSize: 11,
    marginTop: 9,
  },

  comparisonCard: {
    backgroundColor: "#f7eadc",
    borderRadius: 10,
    marginTop: 9,
    padding: 10,
  },

  comparisonText: {
    color: "#6b4a32",
    fontSize: 12,
    lineHeight: 18,
  },
});
