import { describe, expect, it } from 'vitest';
import { parseProductSearch } from './productSearch.schema.js';
import { buildProductSearchQuery } from './productSearch.repository.js';
import { createProductSearch, type ProductSearchItem } from './productSearch.service.js';

describe('product search contract', () => {
  it('uses a bounded default page and no filters', () => {
    expect(parseProductSearch({})).toMatchObject({ success: true, data: { limit: 12 } });
    const query = buildProductSearchQuery({ limit: 12 });
    expect(query.values).toEqual([13]);
    expect(query.text).not.toContain('OFFSET');
  });
  it.each([{ q: 'ab' }, { q: 'a'.repeat(129) }, { q: Array(13).fill('abc').join(' ') }, { limit: '51' }, { limit: '0' }, { limit: ['2'] }, { categoryId: 'invalid' }, { sort: 'name;drop table products' }, { after: 'a'.repeat(101) }, { featured: 'yes' }])('rejects unsafe or excessive inputs %o', input => {
    expect(parseProductSearch(input).success).toBe(false);
  });
  it('binds every client value without incorporating it in SQL text', () => {
    const injection = "x'); DROP TABLE public.products; --";
    const search = { q: injection, categoryId: '3dfdf29f-1665-4f04-9a4e-a24de2da3f04', brandId: '6ad4a21e-c5bd-4814-a537-fc39743055bc', featured: false, after: injection, limit: 3 };
    const query = buildProductSearchQuery(search);
    expect(query.text).not.toContain(injection);
    expect(query.values).toEqual([injection, search.categoryId, search.brandId, false, injection, 4]);
  });
  it('returns a stable next cursor only if an extra row exists', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as ProductSearchItem[];
    const search = createProductSearch({ find: async () => rows });
    expect(await search({ limit: 2 })).toEqual({ items: rows.slice(0, 2), nextCursor: 'b' });
    expect(await search({ limit: 3 })).toEqual({ items: rows, nextCursor: null });
    expect(await createProductSearch({ find: async () => [] })({ limit: 2 })).toEqual({ items: [], nextCursor: null });
  });
});
