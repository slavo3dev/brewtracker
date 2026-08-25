import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useServiceVisit } from "./ServiceVisitProvider";

import {
  loadClientInventoryProducts,
} from "./inventory-audit.service";

import type {
  ClientInventoryProduct,
} from "./service-visit.types";

type RestockRow = {
  product: ClientInventoryProduct;
  countedQuantity: number;
  recommendedQuantity: number;
};

function formatQuantity(
  quantity: number,
): string {
  return Number.isInteger(quantity)
    ? String(quantity)
    : String(quantity);
}

function normalizeQuantityInput(
  value: string,
): string {
  return value.replace(",", ".");
}

export default function RestockDropStep() {
  const {
    activeVisit,
    completeRestockDrop,
  } = useServiceVisit();

  const [products, setProducts] = useState<
    ClientInventoryProduct[]
  >([]);

  const [actualQuantities, setActualQuantities] =
    useState<Record<string, string>>({});

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts(): Promise<void> {
      if (!activeVisit) {
        setProducts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const loadedProducts =
          await loadClientInventoryProducts(
            activeVisit.clientId,
          );

        if (!cancelled) {
          setProducts(loadedProducts);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load refill products.",
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
  }, [activeVisit?.clientId]);

  const inventoryAudit =
    activeVisit?.inventoryAudit ?? null;

  /*
   * Calculate the refill recommendation for every audited
   * product that still exists in the client's inventory
   * configuration.
   */
  const rows = useMemo<RestockRow[]>(() => {
    if (!inventoryAudit) {
      return [];
    }

    const auditByProductId = new Map(
      inventoryAudit.items.map((item) => [
        item.productId,
        item,
      ]),
    );

    return products
      .filter((product) =>
        auditByProductId.has(
          product.productId,
        ),
      )
      .map((product) => {
        const auditItem =
          auditByProductId.get(
            product.productId,
          )!;

        const recommendedQuantity =
          product.parLevel === null
            ? 0
            : Math.max(
                product.parLevel -
                  auditItem.quantity,
                0,
              );

        return {
          product,
          countedQuantity:
            auditItem.quantity,
          recommendedQuantity,
        };
      });
  }, [inventoryAudit, products]);

  /*
   * FLOW-14:
   *
   * Only products whose recommended refill is greater
   * than zero should be presented to the driver.
   */
  const refillRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.product.parLevel !== null &&
          row.recommendedQuantity > 0,
      ),
    [rows],
  );

  /*
   * Missing par levels remain a configuration error.
   * We cannot determine whether those products need refill.
   */
  const productsWithoutPar =
    useMemo(
      () =>
        rows.filter(
          (row) =>
            row.product.parLevel === null,
        ),
      [rows],
    );

  /*
   * Pre-fill Actual with the recommended quantity for
   * products that actually require refill.
   */
  useEffect(() => {
    if (refillRows.length === 0) {
      setActualQuantities({});
      return;
    }

    setActualQuantities((current) => {
      const next: Record<string, string> =
        {};

      for (const row of refillRows) {
        next[row.product.productId] =
          current[
            row.product.productId
          ] ??
          formatQuantity(
            row.recommendedQuantity,
          );
      }

      return next;
    });
  }, [refillRows]);

  /*
   * Group only products that actually need refill.
   */
  const groupedRows = useMemo(() => {
    const groups = new Map<
      string,
      RestockRow[]
    >();

    for (const row of refillRows) {
      const category =
        row.product.category;

      const existing =
        groups.get(category) ?? [];

      existing.push(row);

      groups.set(category, existing);
    }

    return [...groups.entries()];
  }, [refillRows]);

  const missingQuantityCount =
    refillRows.filter(
      (row) =>
        actualQuantities[
          row.product.productId
        ]?.trim() === "",
    ).length;

  const hasInvalidQuantity =
    refillRows.some((row) => {
      const value =
        actualQuantities[
          row.product.productId
        ];

      if (
        value === undefined ||
        value.trim() === ""
      ) {
        return false;
      }

      const quantity = Number(value);

      return (
        !Number.isFinite(quantity) ||
        quantity < 0
      );
    });

  /*
   * FLOW-14:
   *
   * refillRows.length > 0 is deliberately NOT required.
   *
   * If every recommendation is zero, the driver must still
   * be able to confirm "No refill needed" and continue.
   */
  const canSubmit =
    !loading &&
    !submitting &&
    productsWithoutPar.length === 0 &&
    missingQuantityCount === 0 &&
    !hasInvalidQuantity;

  if (!activeVisit) {
    return null;
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeRestockDrop({
        quantities: refillRows.map(
          (row) => ({
            productId:
              row.product.productId,

            actualQuantity: Number(
              actualQuantities[
                row.product.productId
              ] ?? "0",
            ),
          }),
        ),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to confirm the refill.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator />

        <Text style={styles.loadingText}>
          Loading refill recommendations...
        </Text>
      </View>
    );
  }

  if (!inventoryAudit) {
    return (
      <View style={styles.errorCard}>
        <Text style={styles.errorText}>
          Complete the inventory audit before
          confirming the refill.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {productsWithoutPar.length > 0 ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>
            Missing par level
          </Text>

          <Text style={styles.errorText}>
            Configure a par level for{" "}
            {productsWithoutPar
              .map(
                (row) =>
                  row.product.name,
              )
              .join(", ")}{" "}
            before continuing.
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      {productsWithoutPar.length === 0 &&
      refillRows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCheck}>
            ✓
          </Text>

          <Text style={styles.emptyTitle}>
            No refill needed
          </Text>

          <Text style={styles.emptyText}>
            Inventory is already at the
            required level.
          </Text>
        </View>
      ) : null}

      {groupedRows.map(
        ([category, categoryRows]) => (
          <View
            key={category}
            style={styles.group}
          >
            <Text style={styles.category}>
              {category
                .replaceAll("_", " ")
                .toUpperCase()}
            </Text>

            {categoryRows.map((row) => {
              const productId =
                row.product.productId;

              return (
                <View
                  key={productId}
                  style={styles.productCard}
                >
                  <View
                    style={
                      styles.productHeader
                    }
                  >
                    <View style={styles.productInfo}>
                      <Text
                        style={
                          styles.productName
                        }
                      >
                        {row.product.name}
                      </Text>

                      {row.product.sku ? (
                        <Text
                          style={
                            styles.productMeta
                          }
                        >
                          {row.product.sku}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View
                    style={
                      styles.quantityRow
                    }
                  >
                    <View
                      style={
                        styles.recommendedColumn
                      }
                    >
                      <Text
                        style={
                          styles.quantityLabel
                        }
                      >
                        Recommended Refill
                      </Text>

                      <Text
                        style={
                          styles.recommendedValue
                        }
                      >
                        {formatQuantity(
                          row.recommendedQuantity,
                        )}
                      </Text>

                      <Text
                        style={
                          styles.unitLabel
                        }
                      >
                        {row.product.unitLabel}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.actualColumn
                      }
                    >
                      <Text
                        style={
                          styles.quantityLabel
                        }
                      >
                        Actual
                      </Text>

                      <TextInput
                        value={
                          actualQuantities[
                            productId
                          ] ?? ""
                        }
                        onChangeText={(
                          value,
                        ) => {
                          setActualQuantities(
                            (current) => ({
                              ...current,

                              [productId]:
                                normalizeQuantityInput(
                                  value,
                                ),
                            }),
                          );

                          setErrorMessage(
                            null,
                          );
                        }}
                        editable={
                          !submitting
                        }
                        keyboardType="decimal-pad"
                        placeholder="0"
                        style={
                          styles.quantityInput
                        }
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ),
      )}

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={() => {
          void handleSubmit();
        }}
        style={({ pressed }) => [
          styles.confirmButton,

          pressed &&
            canSubmit &&
            styles.buttonPressed,

          !canSubmit &&
            styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator
            color="#ffffff"
          />
        ) : (
          <Text
            style={
              styles.confirmButtonText
            }
          >
            Confirm & Continue
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 18,
  },

  loadingContainer: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
  },

  loadingText: {
    color: "#75665d",
    fontSize: 14,
  },

  group: {
    gap: 10,
  },

  category: {
    color: "#8a6f53",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
  },

  productCard: {
    borderWidth: 1,
    borderColor: "#e2d4c0",
    borderRadius: 14,
    backgroundColor: "#fffdf8",
    padding: 16,
    gap: 16,
  },

  productHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  productInfo: {
    flex: 1,
  },

  productName: {
    color: "#3d2b1f",
    fontSize: 16,
    fontWeight: "700",
  },

  productMeta: {
    marginTop: 3,
    color: "#8a7a70",
    fontSize: 12,
  },

  quantityRow: {
    flexDirection: "row",
    gap: 16,
  },

  recommendedColumn: {
    flex: 1,
  },

  actualColumn: {
    width: 110,
  },

  quantityLabel: {
    marginBottom: 6,
    color: "#8a6f53",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  recommendedValue: {
    color: "#b6692b",
    fontSize: 24,
    fontWeight: "800",
  },

  unitLabel: {
    marginTop: 2,
    color: "#8a7a70",
    fontSize: 12,
  },

  quantityInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#ddd2c5",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    color: "#3d2b1f",
    fontSize: 17,
    fontWeight: "600",
  },

  emptyCard: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2d4c0",
    borderRadius: 14,
    backgroundColor: "#f6f2ea",
    paddingHorizontal: 18,
    paddingVertical: 22,
  },

  emptyCheck: {
    marginBottom: 8,
    color: "#38734d",
    fontSize: 24,
    fontWeight: "800",
  },

  emptyTitle: {
    color: "#2e1d12",
    fontSize: 16,
    fontWeight: "700",
  },

  emptyText: {
    marginTop: 5,
    color: "#8a6f53",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },

  errorCard: {
    borderWidth: 1,
    borderColor: "#e7b9aa",
    borderRadius: 12,
    backgroundColor: "#fff6f3",
    padding: 12,
  },

  errorTitle: {
    marginBottom: 4,
    color: "#8a3324",
    fontSize: 14,
    fontWeight: "700",
  },

  errorText: {
    color: "#8a3324",
    fontSize: 14,
    lineHeight: 20,
  },

  confirmButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#b6692b",
    paddingHorizontal: 20,
  },

  confirmButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  buttonPressed: {
    opacity: 0.85,
  },

  buttonDisabled: {
    opacity: 0.45,
  },
});