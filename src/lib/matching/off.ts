export async function fetchOffInfo(
  ean: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ nova: number | null; nutriscore: string | null }> {
  const res = await fetchFn(
    `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=nova_group,nutriscore_grade`,
    { headers: { "User-Agent": "FreshDrive/0.1 (usage personnel)" } },
  );
  if (!res.ok) return { nova: null, nutriscore: null };
  const data = (await res.json()) as { status?: number; product?: { nova_group?: number; nutriscore_grade?: string } };
  if (data.status !== 1 || !data.product) return { nova: null, nutriscore: null };
  return { nova: data.product.nova_group ?? null, nutriscore: data.product.nutriscore_grade ?? null };
}
