/**
 * IndexedDB persistence layer for graph data using Dexie
 */

import Dexie, { type Table } from 'dexie';

export interface StoredNode {
  id: string;
  lat: number;
  lng: number;
  txPower?: number;
  radioRange?: number;
}

export interface StoredLink {
  id: string;           // `${from}:${to}`
  from: string;
  to: string;
  distance: number;
  pathLoss: number;
  rssi: number;
  canReceive: boolean;
  hasLineOfSight?: boolean;
  terrainLoss?: number;
  computedAt: number;
}

export interface GraphPersistenceConfig {
  dbName: string;
  version: number;
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
}

const DEFAULT_CONFIG: GraphPersistenceConfig = {
  dbName: 'murmur',
  version: 1,
};

interface DexieOptions {
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
}

class MurmurDatabase extends Dexie {
  nodes!: Table<StoredNode, string>;
  links!: Table<StoredLink, string>;

  constructor(dbName: string, options?: DexieOptions) {
    super(dbName, options);

    this.version(1).stores({
      nodes: 'id, lat, lng',
      links: 'id, from, to, computedAt, [from+to]',
    });
  }
}

export class GraphPersistence {
  private db: MurmurDatabase;
  private config: GraphPersistenceConfig;

  constructor(config: Partial<GraphPersistenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    const dexieOptions: DexieOptions = {};
    if (this.config.indexedDB) {
      dexieOptions.indexedDB = this.config.indexedDB;
    }
    if (this.config.IDBKeyRange) {
      dexieOptions.IDBKeyRange = this.config.IDBKeyRange;
    }
    this.db = new MurmurDatabase(
      this.config.dbName,
      Object.keys(dexieOptions).length > 0 ? dexieOptions : undefined
    );
  }

  /**
   * Open the database connection
   */
  async open(): Promise<void> {
    await this.db.open();
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Check if database is open
   */
  isOpen(): boolean {
    return this.db.isOpen();
  }

  // ============ Node Operations ============

  /**
   * Save a single node
   */
  async saveNode(node: StoredNode): Promise<void> {
    await this.db.nodes.put(node);
  }

  /**
   * Save multiple nodes in a transaction
   */
  async saveNodes(nodes: StoredNode[]): Promise<void> {
    await this.db.nodes.bulkPut(nodes);
  }

  /**
   * Get a node by ID
   */
  async getNode(id: string): Promise<StoredNode | undefined> {
    return await this.db.nodes.get(id);
  }

  /**
   * Get all nodes
   */
  async getAllNodes(): Promise<StoredNode[]> {
    return await this.db.nodes.toArray();
  }

  /**
   * Delete a node by ID
   */
  async deleteNode(id: string): Promise<void> {
    await this.db.nodes.delete(id);
  }

  /**
   * Delete multiple nodes
   */
  async deleteNodes(ids: string[]): Promise<void> {
    await this.db.nodes.bulkDelete(ids);
  }

  /**
   * Get node count
   */
  async getNodeCount(): Promise<number> {
    return await this.db.nodes.count();
  }

  // ============ Link Operations ============

  /**
   * Create a link ID from node IDs
   */
  private makeLinkId(from: string, to: string): string {
    return `${from}:${to}`;
  }

  /**
   * Save a single link
   */
  async saveLink(link: Omit<StoredLink, 'id'>): Promise<void> {
    const storedLink: StoredLink = {
      ...link,
      id: this.makeLinkId(link.from, link.to),
    };
    await this.db.links.put(storedLink);
  }

  /**
   * Save multiple links in a transaction
   */
  async saveLinks(links: Array<Omit<StoredLink, 'id'>>): Promise<void> {
    const storedLinks: StoredLink[] = links.map(link => ({
      ...link,
      id: this.makeLinkId(link.from, link.to),
    }));
    await this.db.links.bulkPut(storedLinks);
  }

  /**
   * Get a link by from/to IDs
   */
  async getLink(from: string, to: string): Promise<StoredLink | undefined> {
    return await this.db.links.get(this.makeLinkId(from, to));
  }

  /**
   * Get all links
   */
  async getAllLinks(): Promise<StoredLink[]> {
    return await this.db.links.toArray();
  }

  /**
   * Get all links from a specific node
   */
  async getLinksFrom(nodeId: string): Promise<StoredLink[]> {
    return await this.db.links.where('from').equals(nodeId).toArray();
  }

  /**
   * Get all links to a specific node
   */
  async getLinksTo(nodeId: string): Promise<StoredLink[]> {
    return await this.db.links.where('to').equals(nodeId).toArray();
  }

  /**
   * Get all links involving a node (as source or destination)
   */
  async getLinksForNode(nodeId: string): Promise<StoredLink[]> {
    const [fromLinks, toLinks] = await Promise.all([
      this.getLinksFrom(nodeId),
      this.getLinksTo(nodeId),
    ]);
    return [...fromLinks, ...toLinks];
  }

  /**
   * Delete a link by from/to IDs
   */
  async deleteLink(from: string, to: string): Promise<void> {
    await this.db.links.delete(this.makeLinkId(from, to));
  }

  /**
   * Delete all links involving a node
   */
  async deleteLinksForNode(nodeId: string): Promise<number> {
    const links = await this.getLinksForNode(nodeId);
    const ids = links.map(l => l.id);
    await this.db.links.bulkDelete(ids);
    return ids.length;
  }

  /**
   * Get link count
   */
  async getLinkCount(): Promise<number> {
    return await this.db.links.count();
  }

  /**
   * Get links older than a threshold
   */
  async getStaleLinks(olderThanMs: number): Promise<StoredLink[]> {
    const threshold = Date.now() - olderThanMs;
    return await this.db.links
      .where('computedAt')
      .below(threshold)
      .toArray();
  }

  /**
   * Delete stale links
   */
  async deleteStaleLinks(olderThanMs: number): Promise<number> {
    const threshold = Date.now() - olderThanMs;
    return await this.db.links
      .where('computedAt')
      .below(threshold)
      .delete();
  }

  // ============ Bulk Operations ============

  /**
   * Load all data from the database
   */
  async loadAll(): Promise<{ nodes: StoredNode[]; links: StoredLink[] }> {
    const [nodes, links] = await Promise.all([
      this.getAllNodes(),
      this.getAllLinks(),
    ]);
    return { nodes, links };
  }

  /**
   * Clear all data from the database
   */
  async clear(): Promise<void> {
    await Promise.all([
      this.db.nodes.clear(),
      this.db.links.clear(),
    ]);
  }

  /**
   * Delete the entire database
   */
  async deleteDatabase(): Promise<void> {
    await this.db.delete();
  }

  /**
   * Export all data as JSON
   */
  async exportJSON(): Promise<{ nodes: StoredNode[]; links: StoredLink[] }> {
    return await this.loadAll();
  }

  /**
   * Import data from JSON (replaces existing data)
   */
  async importJSON(data: { nodes: StoredNode[]; links: StoredLink[] }): Promise<void> {
    await this.db.transaction('rw', [this.db.nodes, this.db.links], async () => {
      await this.db.nodes.clear();
      await this.db.links.clear();
      await this.db.nodes.bulkAdd(data.nodes);
      await this.db.links.bulkAdd(data.links);
    });
  }
}
