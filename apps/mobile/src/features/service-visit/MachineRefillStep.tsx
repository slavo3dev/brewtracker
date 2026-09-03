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

import {
  loadClientInventoryProducts,
} from "./inventory-audit.service";

import {
  useServiceVisit,
} from "./ServiceVisitProvider";

import type {
  ClientInventoryProduct,
} from "./service-visit.types";

type RefillValue = {
  issueQuantity: string;
  looseQuantity: string;
};

type RefillValues =
  Record<string, RefillValue>;

function emptyValue(): RefillValue {
  return {
    issueQuantity: "",
    looseQuantity: "",
  };
}

function normalizeWholeInput(
  value: string,
): string {
  return /^\d*$/.test(value)
    ? value
    : "";
}

function normalizeQuantityInput(
  value: string,
): string {
  const normalized =
    value.replace(",", ".");

  return /^\d*(\.\d{0,3})?$/.test(
    normalized,
  )
    ? normalized
    : "";
}

function formatQuantity(
  quantity: number,
): string {
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity
        .toFixed(3)
        .replace(/0+$/, "")
        .replace(/\.$/, "");
}

export default function MachineRefillStep() {
  const {
    activeVisit,
    completeMachineRefill,
  } = useServiceVisit();

  const [products, setProducts] =
    useState<ClientInventoryProduct[]>(
      [],
    );

  const [values, setValues] =
    useState<RefillValues>({});

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeVisit) {
        setProducts([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const result =
          await loadClientInventoryProducts(
            activeVisit.clientId,
          );

        if (!cancelled) {
          setProducts(result);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load machine refill products.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    activeVisit?.clientId,
  ]);

  /*
   * Use products already participating in the
   * service inventory workflow.
   */
  const refillProducts =
    useMemo(
      () =>
        products.filter(
          (product) =>
            product.isRequired,
        ),
      [products],
    );

  function updateValue(
    productId: string,
    field:
      | "issueQuantity"
      | "looseQuantity",
    value: string,
  ) {
    const normalized =
      field === "issueQuantity"
        ? normalizeWholeInput(value)
        : normalizeQuantityInput(
            value,
          );

    if (
      value.length > 0 &&
      normalized === ""
    ) {
      return;
    }

    setValues((current) => ({
      ...current,

      [productId]: {
        ...(current[productId] ??
          emptyValue()),

        [field]: normalized,
      },
    }));

    setErrorMessage(null);
  }

  const hasInvalidQuantity =
    refillProducts.some(
      (product) => {
        const value =
          values[
            product.productId
          ] ?? emptyValue();

        const issueQuantity =
          Number(
            value.issueQuantity || 0,
          );

        const looseQuantity =
          Number(
            value.looseQuantity || 0,
          );

        if (
          !Number.isInteger(
            issueQuantity,
          ) ||
          issueQuantity < 0
        ) {
          return true;
        }

        if (
          !Number.isFinite(
            looseQuantity,
          ) ||
          looseQuantity < 0
        ) {
          return true;
        }

        if (
          !product.packaging
            .allowsLooseUnits &&
          looseQuantity > 0
        ) {
          return true;
        }

        if (
          !product.packaging
            .allowsPartialBaseUnit &&
          !Number.isInteger(
            looseQuantity,
          )
        ) {
          return true;
        }

        return false;
      },
    );

  const canSubmit =
    !loading &&
    !submitting &&
    !hasInvalidQuantity;

  if (!activeVisit) {
    return null;
  }

  async function handleSubmit() {
    if (
      !canSubmit ||
      submitting
    ) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeMachineRefill({
        quantities:
          refillProducts.map(
            (product) => {
              const value =
                values[
                  product.productId
                ] ?? emptyValue();

              return {
                productId:
                  product.productId,

                issueQuantity:
                  Number(
                    value.issueQuantity ||
                      0,
                  ),

                looseQuantity:
                  Number(
                    value.looseQuantity ||
                      0,
                  ),
              };
            },
          ),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to confirm machine refill.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View
        style={
          styles.loadingContainer
        }
      >
        <ActivityIndicator />

        <Text
          style={styles.secondaryText}
        >
          Loading machine products...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Machine refill
        </Text>

        <Text
          style={styles.secondaryText}
        >
          Enter what you actually took
          from the van and put directly
          into the machine.
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          This stock is deducted from
          your van inventory. It is not
          deducted from the client's
          reserve stock.
        </Text>
      </View>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text
            style={styles.errorText}
          >
            {errorMessage}
          </Text>
        </View>
      ) : null}

      {refillProducts.map(
        (product) => {
          const value =
            values[
              product.productId
            ] ?? emptyValue();

          const actual =
            Number(
              value.issueQuantity || 0,
            ) *
              product.packaging
                .unitsPerIssueUnit +
            Number(
              value.looseQuantity || 0,
            );

          return (
            <View
              key={product.productId}
              style={
                styles.productCard
              }
            >
              <Text
                style={
                  styles.productName
                }
              >
                {product.name}
              </Text>

              <Text
                style={
                  styles.secondaryText
                }
              >
                {product.packaging
                  .packageDescription ??
                  `${product.packaging.unitsPerIssueUnit} ${product.packaging.baseUnit} per ${product.packaging.issueUnit}`}
              </Text>

              <View
                style={
                  styles.quantityRow
                }
              >
                <View
                  style={
                    styles.quantityField
                  }
                >
                  <Text
                    style={
                      styles.quantityLabel
                    }
                  >
                    {
                      product.packaging
                        .issueUnit
                    }
                  </Text>

                  <TextInput
                    value={
                      value.issueQuantity
                    }
                    editable={
                      !submitting
                    }
                    keyboardType="number-pad"
                    placeholder="0"
                    onChangeText={(
                      text,
                    ) =>
                      updateValue(
                        product.productId,
                        "issueQuantity",
                        text,
                      )
                    }
                    style={
                      styles.quantityInput
                    }
                  />
                </View>

                {product.packaging
                  .allowsLooseUnits ? (
                  <View
                    style={
                      styles.quantityField
                    }
                  >
                    <Text
                      style={
                        styles.quantityLabel
                      }
                    >
                      Loose{" "}
                      {
                        product.packaging
                          .baseUnit
                      }
                    </Text>

                    <TextInput
                      value={
                        value.looseQuantity
                      }
                      editable={
                        !submitting
                      }
                      keyboardType={
                        product.packaging
                          .allowsPartialBaseUnit
                          ? "decimal-pad"
                          : "number-pad"
                      }
                      placeholder="0"
                      onChangeText={(
                        text,
                      ) =>
                        updateValue(
                          product.productId,
                          "looseQuantity",
                          text,
                        )
                      }
                      style={
                        styles.quantityInput
                      }
                    />
                  </View>
                ) : null}
              </View>

              <Text
                style={styles.actual}
              >
                Into machine:{" "}
                <Text
                  style={
                    styles.actualValue
                  }
                >
                  {formatQuantity(
                    actual,
                  )}{" "}
                  {
                    product.packaging
                      .baseUnit
                  }
                </Text>
              </Text>
            </View>
          );
        },
      )}

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={() => {
          void handleSubmit();
        }}
        style={({ pressed }) => [
          styles.button,

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
            style={styles.buttonText}
          >
            Confirm Machine Refill &
            Continue
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      gap: 14,
    },

    header: {
      gap: 5,
    },

    title: {
      color: "#2e1d12",
      fontSize: 22,
      fontWeight: "700",
    },

    secondaryText: {
      color: "#8a6f53",
      fontSize: 13,
      lineHeight: 19,
    },

    loadingContainer: {
      alignItems: "center",
      gap: 10,
      paddingVertical: 24,
    },

    infoCard: {
      backgroundColor: "#f6f2ea",
      borderColor: "#e2d4c0",
      borderRadius: 12,
      borderWidth: 1,
      padding: 12,
    },

    infoText: {
      color: "#6b5543",
      fontSize: 12,
      lineHeight: 18,
    },

    productCard: {
      backgroundColor: "#fffdf8",
      borderColor: "#e2d4c0",
      borderRadius: 12,
      borderWidth: 1,
      padding: 12,
    },

    productName: {
      color: "#3d2b1f",
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 3,
    },

    quantityRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 10,
    },

    quantityField: {
      flex: 1,
    },

    quantityLabel: {
      color: "#6b5543",
      fontSize: 11,
      fontWeight: "600",
      marginBottom: 5,
    },

    quantityInput: {
      backgroundColor: "#ffffff",
      borderColor: "#ddd2c5",
      borderRadius: 9,
      borderWidth: 1,
      color: "#3d2b1f",
      fontSize: 15,
      fontWeight: "700",
      height: 40,
      paddingHorizontal: 10,
      textAlign: "center",
    },

    actual: {
      color: "#8a6f53",
      fontSize: 11,
      marginTop: 8,
    },

    actualValue: {
      color: "#3d2b1f",
      fontWeight: "700",
    },

    errorCard: {
      backgroundColor: "#fff6f3",
      borderColor: "#e7b9aa",
      borderRadius: 12,
      borderWidth: 1,
      padding: 12,
    },

    errorText: {
      color: "#8a3324",
      fontSize: 13,
      lineHeight: 19,
    },

    button: {
      alignItems: "center",
      backgroundColor: "#b6692b",
      borderRadius: 14,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: 20,
    },

    buttonText: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "700",
      textAlign: "center",
    },

    buttonPressed: {
      opacity: 0.85,
    },

    buttonDisabled: {
      opacity: 0.45,
    },
  });