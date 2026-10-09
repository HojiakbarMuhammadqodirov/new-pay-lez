import { useEffect, useState } from 'react';
import { call } from './api/client';
import { useLanguage } from './i18n/context';

/**
 * The app's venue taxonomy, as `GET /v1/categories` sends it
 * (`server/domain/categories.ts`). Read, never written here: the tree lives on
 * the server, and this picker only renders it.
 */
type Labels = Record<'en' | 'pl' | 'ru' | 'uk' | 'uz', string>;
export interface TaxonomyNode {
  key: string;
  label: string;
  labels: Labels;
  subcategories: Array<{ key: string; label: string; labels: Labels }>;
}

let cached: TaxonomyNode[] | null = null;

/** The tree, fetched once per page load; `null` while loading or when the server has none. */
function useTaxonomy(): TaxonomyNode[] | null {
  const [tree, setTree] = useState<TaxonomyNode[] | null>(cached);
  useEffect(() => {
    if (cached) return;
    let live = true;
    call<{ categories?: TaxonomyNode[] }>('/v1/categories')
      .then((body) => {
        if (!Array.isArray(body.categories)) return;
        cached = body.categories;
        if (live) setTree(cached);
      })
      /* An older server has no taxonomy; the field simply does not show. */
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return tree;
}

/**
 * Pick the categories a venue is filed under in the app's Deals filter.
 *
 * One group per category: a chip for the category as a whole, then a chip per
 * subcategory. Several may be on — Halal is cross-cutting, so a kebab house is
 * `restaurant.kebabs` *and* `halal.kebabs`. A subcategory already implies its
 * category, so turning one on turns the bare category off, and the other way
 * round, which keeps the stored list free of redundant keys.
 */
export function AppCategoryPicker({
  value,
  onChange,
  wholeLabel,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** `All of {category}`, translated. */
  wholeLabel: string;
}) {
  const tree = useTaxonomy();
  const [language] = useLanguage();
  if (!tree) return null;

  const labelOf = (node: { label: string; labels?: Partial<Labels> }) =>
    node.labels?.[language as keyof Labels] ?? node.label;

  const toggle = (key: string) => {
    const on = value.includes(key);
    const parent = key.split('.')[0];
    let next = on ? value.filter((k) => k !== key) : [...value, key];
    if (!on) {
      next = key.includes('.')
        ? next.filter((k) => k !== parent)
        : next.filter((k) => !k.startsWith(`${key}.`));
    }
    /* In the tree's order, so the stored list reads the same however it was picked. */
    const order = tree.flatMap((node) => [node.key, ...node.subcategories.map((sub) => sub.key)]);
    onChange(order.filter((k) => next.includes(k)));
  };

  const chip = (key: string, text: string) => (
    <button
      key={key}
      type="button"
      className="chip"
      aria-pressed={value.includes(key)}
      data-on={value.includes(key) ? 'true' : undefined}
      onClick={() => toggle(key)}
    >
      {text}
    </button>
  );

  return (
    <div className="app-categories">
      {tree.map((node) => (
        <div key={node.key} className="app-category" role="group" aria-label={labelOf(node)}>
          <span className="app-category-name">{labelOf(node)}</span>
          <div className="chips">
            {chip(node.key, wholeLabel.replace('{category}', labelOf(node)))}
            {node.subcategories.map((sub) => chip(sub.key, labelOf(sub)))}
          </div>
        </div>
      ))}
    </div>
  );
}
