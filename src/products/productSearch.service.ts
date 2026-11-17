import type { ProductSearch } from './productSearch.schema.js';

export interface ProductSearchItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  presentation: string;
  priceInCents: number;
  currency: string;
  availableQuantity: number;
  inStock: boolean;
  requiresPrescription: boolean;
  isFeatured: boolean;
  image: { bucket: string; storagePath: string; altText: string } | null;
}
export interface ProductSearchRepository {
  find(search: ProductSearch): Promise<ProductSearchItem[]>;
}
export function createProductSearch(repository: ProductSearchRepository) {
  return async (search: ProductSearch) => {
    const rows = await repository.find(search);
    const hasMore = rows.length > search.limit;
    const items = rows.slice(0, search.limit);
    return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
  };
}
