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
  public async listMetas(): Promise<unknown> {
    return this.get('/metas');
  }

  /** GET /metas/:path — detail for a single meta. */
  public async detail(
    metaPath: string,
    includeArchive?: boolean | number,
  ): Promise<unknown> {
    const encoded = encodeURIComponent(metaPath);
    const qs =
      includeArchive !== undefined
        ? `?includeArchive=${String(includeArchive)}`
        : '';
    return this.get(`/metas/${encoded}${qs}`);
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

  /** POST /config/validate — validate config. */
  public async validate(config?: Record<string, unknown>): Promise<unknown> {
    return this.post('/config/validate', config ?? {});
  }
}
