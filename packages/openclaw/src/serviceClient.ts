/**
 * Thin HTTP client for the jeeves-meta service.
 *
 * Plugin delegates all operations to the running service via HTTP.
 *
 * @module serviceClient
 */

export interface MetaServiceConfig {
  /** Base URL of the jeeves-meta service (e.g. http://127.0.0.1:1938). */
  serviceUrl: string;
}

export class MetaServiceClient {
  private readonly baseUrl: string;

  public constructor(config: MetaServiceConfig) {
    this.baseUrl = config.serviceUrl.replace(/\/$/, '');
  }

  /** GET helper — returns parsed JSON. */
  private async get(path: string): Promise<unknown> {
    const res = await fetch(this.baseUrl + path);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `META ${path} ${String(res.status)} ${res.statusText}: ${text}`,
      );
    }
    return res.json();
  }

  /** POST helper — returns parsed JSON. */
  private async post(path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `META ${path} ${String(res.status)} ${res.statusText}: ${text}`,
      );
    }
    return res.json();
  }

  /** GET /status — service health + queue state. */
  public async status(): Promise<unknown> {
    return this.get('/status');
  }

  /** GET /metas — list all meta entities with summary. */
  public async listMetas(params?: {
    pathPrefix?: string;
    hasError?: boolean;
    staleHours?: number;
    neverSynthesized?: boolean;
    locked?: boolean;
    fields?: string[];
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.pathPrefix) qs.set('pathPrefix', params.pathPrefix);
    if (params?.hasError !== undefined)
      qs.set('hasError', String(params.hasError));
    if (params?.staleHours !== undefined)
      qs.set('staleHours', String(params.staleHours));
    if (params?.neverSynthesized !== undefined)
      qs.set('neverSynthesized', String(params.neverSynthesized));
    if (params?.locked !== undefined) qs.set('locked', String(params.locked));
    if (params?.fields?.length) qs.set('fields', params.fields.join(','));
    const query = qs.toString();
    return this.get('/metas' + (query ? '?' + query : ''));
  }

  /** GET /metas/:path — detail for a single meta. */
  public async detail(
    metaPath: string,
    options?: { includeArchive?: boolean | number; fields?: string[] },
  ): Promise<unknown> {
    const encoded = encodeURIComponent(metaPath);
    const qs = new URLSearchParams();
    if (options?.includeArchive !== undefined)
      qs.set('includeArchive', String(options.includeArchive));
    if (options?.fields?.length) qs.set('fields', options.fields.join(','));
    const query = qs.toString();
    return this.get(`/metas/${encoded}` + (query ? '?' + query : ''));
  }

  /** GET /preview — dry-run next synthesis candidate. */
  public async preview(path?: string): Promise<unknown> {
    const qs = path ? '?path=' + encodeURIComponent(path) : '';
    return this.get('/preview' + qs);
  }

  /** POST /synthesize — enqueue synthesis. */
  public async synthesize(path?: string): Promise<unknown> {
    return this.post('/synthesize', path ? { path } : {});
  }

  /** POST /seed — create .meta/ for a path. */
  public async seed(path: string): Promise<unknown> {
    return this.post('/seed', { path });
  }

  /** POST /unlock — remove .lock from a meta entity. */
  public async unlock(path: string): Promise<unknown> {
    return this.post('/unlock', { path });
  }

  /** GET /config/validate — validate current config. */
  public async validate(): Promise<unknown> {
    return this.get('/config/validate');
  }
}
