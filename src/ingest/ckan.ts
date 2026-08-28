/**
 * Toronto Open Data (CKAN) resource discovery.
 *
 * Resource URLs on the portal are not stable across refreshes, so we resolve
 * them by dataset id at ingest time rather than hardcoding download links.
 */

const CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";

interface CkanResource {
  id: string;
  name: string;
  format: string;
  url: string;
}

interface CkanPackage {
  result: {
    title: string;
    last_refreshed?: string;
    resources: CkanResource[];
  };
}

async function getPackage(datasetId: string): Promise<CkanPackage["result"]> {
  const res = await fetch(`${CKAN}/package_show?id=${datasetId}`);
  if (!res.ok) {
    throw new Error(`CKAN package_show failed for ${datasetId}: ${res.status}`);
  }
  const body = (await res.json()) as CkanPackage;
  return body.result;
}

/**
 * Finds one resource in a dataset by format, optionally narrowed by a name
 * predicate. Throws rather than guessing when the match is ambiguous — a silent
 * wrong file here would poison every downstream number (P-08).
 */
export async function findResource(
  datasetId: string,
  format: string,
  matches: (name: string) => boolean,
): Promise<CkanResource> {
  const pkg = await getPackage(datasetId);
  const candidates = pkg.resources.filter(
    (r) => r.format.toUpperCase() === format.toUpperCase() && matches(r.name),
  );

  if (candidates.length === 0) {
    const available = pkg.resources.map((r) => `${r.name} [${r.format}]`).join(", ");
    throw new Error(`No ${format} resource matched in ${datasetId}. Available: ${available}`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `Ambiguous ${format} match in ${datasetId}: ${candidates.map((r) => r.name).join(", ")}`,
    );
  }
  return candidates[0]!;
}

export async function datasetRefreshedAt(datasetId: string): Promise<string | undefined> {
  return (await getPackage(datasetId)).last_refreshed;
}
