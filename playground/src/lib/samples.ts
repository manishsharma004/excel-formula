export type Shape = "record" | "rows";
export type RowMode = "map" | "filter" | "aggregate";

export type Sample = {
  id: string;
  title: string;
  blurb: string;
  shape: Shape;
  rowMode: RowMode;
  formula: string;
  data: unknown;
  /** When set, loading the sample turns Custom setup on and fills that language's script. */
  setup?: Partial<Record<"javascript" | "typescript" | "python", string>>;
};

export function rowModeLabel(mode: RowMode): string {
  if (mode === "map") return "Calculate (map)";
  if (mode === "filter") return "Query (filter)";
  return "Aggregate";
}

const orders = [
  { id: 1, region: "EU", price: 10, qty: 2, discount: 0.1, paid: true },
  { id: 2, region: "US", price: 5, qty: 10, paid: false },
  { id: 3, region: "eu", price: 20, qty: 1, discount: null, paid: true },
  { id: 4, region: "APAC", price: "n/a", qty: 3, discount: 0 },
];

export const samples: Sample[] = [
  {
    id: "price-qty",
    title: "Price and quantity",
    blurb: "One record. price * qty is 29.97.",
    shape: "record",
    rowMode: "map",
    formula: "price * qty",
    data: { price: 9.99, qty: 3 },
  },
  {
    id: "discount",
    title: "Quantity discount",
    blurb: "IF does not evaluate the unused branch.",
    shape: "record",
    rowMode: "map",
    formula: "IF(qty > 10, price * 0.9, price) * qty",
    data: { price: 9.99, qty: 12 },
  },
  {
    id: "nested",
    title: "Nested field",
    blurb: "nested.price walks into the object.",
    shape: "record",
    rowMode: "map",
    formula: "price * qty * nested.price",
    data: { price: 9.99, qty: 3, nested: { price: 10 } },
  },
  {
    id: "q1",
    title: "Name shaped like a cell",
    blurb: "q1 is a field, not a spreadsheet cell.",
    shape: "record",
    rowMode: "map",
    formula: "q1 * 2",
    data: { q1: 100 },
  },
  {
    id: "squares",
    title: "Sum of squares",
    blurb: "SUM(values * values) is the sum of squares.",
    shape: "record",
    rowMode: "map",
    formula: "SUM(values * values)",
    data: { values: [2, 3, 4] },
  },
  {
    id: "times-constant",
    title: "Array times a constant",
    blurb: "SUM(values * 2) multiplies every element, then adds.",
    shape: "record",
    rowMode: "map",
    formula: "SUM(values * 2)",
    data: { values: [10, 5] },
  },
  {
    id: "orders-field",
    title: "Orders on one object",
    blurb: "Pair each order’s price and qty, then sum.",
    shape: "record",
    rowMode: "map",
    formula: "SUM(orders.price * orders.qty)",
    data: {
      orders: [
        { price: 10, qty: 2 },
        { price: 9.99, qty: 3 },
      ],
    },
  },
  {
    id: "flags",
    title: "Boolean inside a list",
    blurb: "SUM skips TRUE inside an array. The number still counts.",
    shape: "record",
    rowMode: "map",
    formula: "SUM(flags)",
    data: { flags: [true, 1] },
  },
  {
    id: "orders-filter",
    title: "Sample orders",
    blurb: "Query keeps rows whose formula is TRUE.",
    shape: "rows",
    rowMode: "filter",
    formula: 'region = "EU"',
    data: orders,
  },
  {
    id: "orders-calc",
    title: "Line totals",
    blurb: "Calculate returns one value per order.",
    shape: "rows",
    rowMode: "map",
    formula: "price * qty",
    data: orders,
  },
  {
    id: "tax-setup",
    title: "Tax added by setup",
    blurb: "The setup script adds tax. The formula uses that field.",
    shape: "record",
    rowMode: "map",
    formula: "price * qty * (1 + tax)",
    data: { price: 9.99, qty: 3 },
    setup: {
      javascript: `function setup({ data, formula }) {
  return { data: { ...data, tax: 0.2 }, formula };
}
`,
      typescript: `function setup({ data, formula }: { data: Record<string, unknown>; formula: string }) {
  return { data: { ...data, tax: 0.2 }, formula };
}
`,
      python: `def setup(evaluator, data, formula):
    data = {**data, "tax": 0.2}
    return {"data": data, "formula": formula}
`,
    },
  },
  {
    id: "orders-agg",
    title: "Revenue aggregate",
    blurb: "The first record has no price, so that line adds 0. Result is 29.97.",
    shape: "rows",
    rowMode: "aggregate",
    formula: "SUM(price * qty)",
    data: [{ qty: 3 }, { price: 9.99, qty: 3 }],
  },
];
