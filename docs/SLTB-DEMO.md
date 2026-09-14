# SLTB Blend Sheet demo

**This branch is not for merge.** It carries the SLTB-specific form so the
`x-xml.writeTo` and table-evaluation work can be exercised against real data.
Everything here is form configuration and a sample document — no library code.

Run it with `pnpm dev` from `packages/jsonforms-renderers`, pick
**SLTB Blend Sheet (demo)**, and upload `dev/sample-files/blend-sheet-31490.xml`.

## What one upload produces

| Field                   | Value                | Where it comes from                                     |
| ----------------------- | -------------------- | ------------------------------------------------------- |
| `exporter_tin`          | `"2940013877000"`    | `as: "string"`, or 13 digits become a float             |
| `cusdec_number`         | `CBEX1/E/44695/2026` | `formula`, composed from four elements                  |
| `lion_logo_requested`   | `yes`                | `map`, from the number `1`                              |
| `date_of_blend`         | `2026-07-23`         | `as: "date"`, from `7/23/26`                            |
| `blend_gain_determined` | `0`                  | `default`, from `<null/>` — which parses to an _object_ |
| `sales.sheet`           | 25 rows              | the repeated `<Particulars_of_sale>` element            |
| `total_sales_quantity`  | 8522                 | recomputed from the written table                       |
| `total_sales_value`     | 16336200             | recomputed                                              |
| `average_value_per_kg`  | 1916.9444            | recomputed                                              |
| `total`                 | 8522                 | `x-computed`, from the derivations above                |
| `blend_balance`         | 162                  | `x-computed`, `total - quality_to_be_exported`          |

`total` and `blend_balance` are the check worth watching: the file carries its
own `<Total>` 8522 and `<Blend_balance>` 162, and `writeTo` deliberately does
**not** map either. They match because the chain recomputed them.

`imported_tea` and `blend_balances` stay empty, as they are in this file, and
each `x-computed` input's `default: 0` carries the chain without them.

## Three departures from the original schema

These are fixes the real schema needs; the demo carries them so the flow runs.

1. **`average_value_per_kg` used `=AVERAGE(H2:H10000)`** — the simple mean of
   the rate column, which gives **1904**. "Average Value Per KG" is value ÷
   quantity: `=SUM(J2:J10000)/SUM(I2:I10000)` → **1916.944**, which is what both
   the file's own `SaleTotal_average` and `Blend.Average_rate` say.

2. **Two `oneOf` lists could not match the file.** `grade_or_standard` allowed
   BOPF/BOP/PF1/FGS1/PF but the file has `"B604 GRADE CEYLON"`;
   `exporter_registration_no` allowed two SLTB codes but the file has
   `"TC/E/PR/723/522"`. No mapping can fix that — the values simply are not in
   the lists — so AJV would reject a correctly imported document. Both are free
   text here. The real form should either widen the lists or add a `map`.

3. **Three fields have no source in the file** — `warehouse_id`, `form` and
   `private_treaty_to_be_exported` (`<Country/>` is empty). They stay manual.

## Known gap

`x-computed` writes a readonly `type: "number"` field, so a mapped value that
also needs computing cannot be both. Nothing in this form needs that today.
