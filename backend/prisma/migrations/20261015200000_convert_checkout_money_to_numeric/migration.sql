-- Normalize existing checkout-related floating-point values to exact rupees
-- and paise. Values are rounded half-up to the selected scale; rows and keys
-- are retained. Reject non-finite or out-of-range legacy values before any
-- DDL runs, and keep the conversion atomic. Review a data audit and backup
-- before applying this migration.

BEGIN;

DO $$
DECLARE
    amount_field record;
    has_invalid_value boolean;
BEGIN
    FOR amount_field IN
        SELECT * FROM (VALUES
            ('Dish', 'price', 2, 1000000000000::numeric),
            ('Order', 'subtotal', 2, 1000000000000::numeric),
            ('Order', 'deliveryFee', 2, 1000000000000::numeric),
            ('Order', 'platformFee', 2, 1000000000000::numeric),
            ('Order', 'totalAmount', 2, 1000000000000::numeric),
            ('Order', 'cookEarning', 2, 1000000000000::numeric),
            ('Order', 'deliveryEarning', 2, 1000000000000::numeric),
            ('Checkout', 'subtotal', 2, 1000000000000::numeric),
            ('Checkout', 'deliveryFee', 2, 1000000000000::numeric),
            ('Checkout', 'platformFee', 2, 1000000000000::numeric),
            ('Checkout', 'totalAmount', 2, 1000000000000::numeric),
            ('OrderItem', 'unitPrice', 2, 1000000000000::numeric),
            ('OrderItem', 'totalPrice', 2, 1000000000000::numeric),
            ('PlatformSettings', 'platformFeePercent', 4, 1000::numeric),
            ('PlatformSettings', 'deliveryFeeBase', 2, 1000000000000::numeric),
            ('PaymentAttempt', 'amount', 2, 1000000000000::numeric)
        ) AS fields(table_name, column_name, decimal_scale, absolute_limit)
    LOOP
        EXECUTE format(
            'SELECT EXISTS (
                SELECT 1 FROM %I
                WHERE CASE
                    WHEN %I::text IN (''NaN'', ''Infinity'', ''-Infinity'') THEN TRUE
                    ELSE abs(round(%I::numeric, %s)) >= %s
                END
            )',
            amount_field.table_name,
            amount_field.column_name,
            amount_field.column_name,
            amount_field.decimal_scale,
            amount_field.absolute_limit
        ) INTO has_invalid_value;

        IF has_invalid_value THEN
            RAISE EXCEPTION 'Cannot convert %.% to NUMERIC safely: non-finite or out-of-range values exist.',
                amount_field.table_name, amount_field.column_name;
        END IF;
    END LOOP;
END $$;

ALTER TABLE "Dish" ALTER COLUMN "price" TYPE NUMERIC(14,2)
    USING ROUND("price"::numeric, 2);

ALTER TABLE "Order"
    ALTER COLUMN "deliveryFee" DROP DEFAULT,
    ALTER COLUMN "platformFee" DROP DEFAULT,
    ALTER COLUMN "subtotal" TYPE NUMERIC(14,2) USING ROUND("subtotal"::numeric, 2),
    ALTER COLUMN "deliveryFee" TYPE NUMERIC(14,2) USING ROUND("deliveryFee"::numeric, 2),
    ALTER COLUMN "platformFee" TYPE NUMERIC(14,2) USING ROUND("platformFee"::numeric, 2),
    ALTER COLUMN "totalAmount" TYPE NUMERIC(14,2) USING ROUND("totalAmount"::numeric, 2),
    ALTER COLUMN "cookEarning" TYPE NUMERIC(14,2) USING ROUND("cookEarning"::numeric, 2),
    ALTER COLUMN "deliveryEarning" TYPE NUMERIC(14,2) USING ROUND("deliveryEarning"::numeric, 2),
    ALTER COLUMN "deliveryFee" SET DEFAULT 30.00,
    ALTER COLUMN "platformFee" SET DEFAULT 10.00;

ALTER TABLE "Checkout"
    ALTER COLUMN "subtotal" TYPE NUMERIC(14,2) USING ROUND("subtotal"::numeric, 2),
    ALTER COLUMN "deliveryFee" TYPE NUMERIC(14,2) USING ROUND("deliveryFee"::numeric, 2),
    ALTER COLUMN "platformFee" TYPE NUMERIC(14,2) USING ROUND("platformFee"::numeric, 2),
    ALTER COLUMN "totalAmount" TYPE NUMERIC(14,2) USING ROUND("totalAmount"::numeric, 2);

ALTER TABLE "OrderItem"
    ALTER COLUMN "unitPrice" TYPE NUMERIC(14,2) USING ROUND("unitPrice"::numeric, 2),
    ALTER COLUMN "totalPrice" TYPE NUMERIC(14,2) USING ROUND("totalPrice"::numeric, 2);

ALTER TABLE "PlatformSettings"
    ALTER COLUMN "platformFeePercent" DROP DEFAULT,
    ALTER COLUMN "deliveryFeeBase" DROP DEFAULT,
    ALTER COLUMN "platformFeePercent" TYPE NUMERIC(7,4) USING ROUND("platformFeePercent"::numeric, 4),
    ALTER COLUMN "deliveryFeeBase" TYPE NUMERIC(14,2) USING ROUND("deliveryFeeBase"::numeric, 2),
    ALTER COLUMN "platformFeePercent" SET DEFAULT 10.0000,
    ALTER COLUMN "deliveryFeeBase" SET DEFAULT 30.00;

-- The payment-foundation migration is left unchanged because its application
-- status could not be established. Convert its amount safely as a successor.
ALTER TABLE "PaymentAttempt" ALTER COLUMN "amount" TYPE NUMERIC(14,2)
    USING ROUND("amount"::numeric, 2);

COMMIT;
