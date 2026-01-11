import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { GraphPersistence, type StoredNode, type StoredLink } from '@/graph/graph-persistence';

describe('GraphPersistence', () => {
  let persistence: GraphPersistence;
  let dbCounter = 0;

  const createPersistence = (dbName?: string) =>
    new GraphPersistence({
      dbName: dbName ?? `test-db-${dbCounter++}`,
      indexedDB,
      IDBKeyRange,
    });

  const createNode = (id: string, overrides: Partial<StoredNode> = {}): StoredNode => ({
    id,
    lat: 40.0,
    lng: -80.0,
    ...overrides,
  });

  const createLink = (from: string, to: string, overrides: Partial<Omit<StoredLink, 'id' | 'from' | 'to'>> = {}): Omit<StoredLink, 'id'> => ({
    from,
    to,
    distance: 5.0,
    pathLoss: 80,
    rssi: -60,
    canReceive: true,
    computedAt: Date.now(),
    ...overrides,
  });

  beforeEach(async () => {
    persistence = createPersistence();
    await persistence.open();
  });

  afterEach(async () => {
    await persistence.deleteDatabase();
  });

  describe('node operations', () => {
    it('should save and retrieve a node', async () => {
      const node = createNode('node-1', { txPower: 20, radioRange: 5 });
      await persistence.saveNode(node);

      const retrieved = await persistence.getNode('node-1');
      expect(retrieved).toEqual(node);
    });

    it('should save multiple nodes', async () => {
      const nodes = [
        createNode('node-1'),
        createNode('node-2', { lat: 40.1 }),
        createNode('node-3', { lat: 40.2 }),
      ];
      await persistence.saveNodes(nodes);

      const count = await persistence.getNodeCount();
      expect(count).toBe(3);

      const all = await persistence.getAllNodes();
      expect(all).toHaveLength(3);
    });

    it('should update existing node', async () => {
      await persistence.saveNode(createNode('node-1', { txPower: 20 }));
      await persistence.saveNode(createNode('node-1', { txPower: 30 }));

      const count = await persistence.getNodeCount();
      expect(count).toBe(1);

      const node = await persistence.getNode('node-1');
      expect(node?.txPower).toBe(30);
    });

    it('should delete a node', async () => {
      await persistence.saveNode(createNode('node-1'));
      await persistence.deleteNode('node-1');

      const node = await persistence.getNode('node-1');
      expect(node).toBeUndefined();
    });

    it('should delete multiple nodes', async () => {
      await persistence.saveNodes([
        createNode('node-1'),
        createNode('node-2'),
        createNode('node-3'),
      ]);
      await persistence.deleteNodes(['node-1', 'node-2']);

      const count = await persistence.getNodeCount();
      expect(count).toBe(1);
    });
  });

  describe('link operations', () => {
    beforeEach(async () => {
      await persistence.saveNodes([
        createNode('node-a'),
        createNode('node-b'),
        createNode('node-c'),
      ]);
    });

    it('should save and retrieve a link', async () => {
      const link = createLink('node-a', 'node-b', { distance: 10.5 });
      await persistence.saveLink(link);

      const retrieved = await persistence.getLink('node-a', 'node-b');
      expect(retrieved?.from).toBe('node-a');
      expect(retrieved?.to).toBe('node-b');
      expect(retrieved?.distance).toBe(10.5);
    });

    it('should save multiple links', async () => {
      await persistence.saveLinks([
        createLink('node-a', 'node-b'),
        createLink('node-a', 'node-c'),
        createLink('node-b', 'node-c'),
      ]);

      const count = await persistence.getLinkCount();
      expect(count).toBe(3);
    });

    it('should get links from a node', async () => {
      await persistence.saveLinks([
        createLink('node-a', 'node-b'),
        createLink('node-a', 'node-c'),
        createLink('node-b', 'node-c'),
      ]);

      const links = await persistence.getLinksFrom('node-a');
      expect(links).toHaveLength(2);
    });

    it('should get links to a node', async () => {
      await persistence.saveLinks([
        createLink('node-a', 'node-c'),
        createLink('node-b', 'node-c'),
      ]);

      const links = await persistence.getLinksTo('node-c');
      expect(links).toHaveLength(2);
    });

    it('should get all links for a node', async () => {
      await persistence.saveLinks([
        createLink('node-a', 'node-b'),
        createLink('node-b', 'node-c'),
        createLink('node-c', 'node-a'),
      ]);

      const links = await persistence.getLinksForNode('node-a');
      expect(links).toHaveLength(2); // a->b and c->a
    });

    it('should delete a link', async () => {
      await persistence.saveLink(createLink('node-a', 'node-b'));
      await persistence.deleteLink('node-a', 'node-b');

      const link = await persistence.getLink('node-a', 'node-b');
      expect(link).toBeUndefined();
    });

    it('should delete all links for a node', async () => {
      await persistence.saveLinks([
        createLink('node-a', 'node-b'),
        createLink('node-a', 'node-c'),
        createLink('node-b', 'node-c'),
      ]);

      const deleted = await persistence.deleteLinksForNode('node-a');
      expect(deleted).toBe(2);

      const remaining = await persistence.getLinkCount();
      expect(remaining).toBe(1);
    });
  });

  describe('stale link detection', () => {
    it('should find stale links', async () => {
      const oldTime = Date.now() - 60000; // 1 minute ago
      const newTime = Date.now();

      await persistence.saveNodes([
        createNode('node-a'),
        createNode('node-b'),
        createNode('node-c'),
      ]);

      await persistence.saveLinks([
        createLink('node-a', 'node-b', { computedAt: oldTime }),
        createLink('node-b', 'node-c', { computedAt: newTime }),
      ]);

      const stale = await persistence.getStaleLinks(30000); // older than 30 seconds
      expect(stale).toHaveLength(1);
      expect(stale[0]!.from).toBe('node-a');
    });

    it('should delete stale links', async () => {
      const oldTime = Date.now() - 60000;
      const newTime = Date.now();

      await persistence.saveNodes([
        createNode('node-a'),
        createNode('node-b'),
        createNode('node-c'),
      ]);

      await persistence.saveLinks([
        createLink('node-a', 'node-b', { computedAt: oldTime }),
        createLink('node-b', 'node-c', { computedAt: newTime }),
      ]);

      const deleted = await persistence.deleteStaleLinks(30000);
      expect(deleted).toBe(1);

      const remaining = await persistence.getLinkCount();
      expect(remaining).toBe(1);
    });
  });

  describe('bulk operations', () => {
    it('should load all data', async () => {
      await persistence.saveNodes([
        createNode('node-a'),
        createNode('node-b'),
      ]);
      await persistence.saveLinks([
        createLink('node-a', 'node-b'),
      ]);

      const data = await persistence.loadAll();

      expect(data.nodes).toHaveLength(2);
      expect(data.links).toHaveLength(1);
    });

    it('should clear all data', async () => {
      await persistence.saveNodes([
        createNode('node-a'),
        createNode('node-b'),
      ]);
      await persistence.saveLinks([
        createLink('node-a', 'node-b'),
      ]);

      await persistence.clear();

      const nodeCount = await persistence.getNodeCount();
      const linkCount = await persistence.getLinkCount();

      expect(nodeCount).toBe(0);
      expect(linkCount).toBe(0);
    });
  });

  describe('import/export', () => {
    it('should export and import data', async () => {
      await persistence.saveNodes([
        createNode('node-a', { txPower: 20 }),
        createNode('node-b', { txPower: 25 }),
      ]);
      await persistence.saveLinks([
        createLink('node-a', 'node-b', { distance: 7.5 }),
      ]);

      const exported = await persistence.exportJSON();

      // Create a new persistence instance
      const newPersistence = createPersistence();
      await newPersistence.open();

      try {
        await newPersistence.importJSON(exported);

        const imported = await newPersistence.loadAll();
        expect(imported.nodes).toHaveLength(2);
        expect(imported.links).toHaveLength(1);

        const nodeA = await newPersistence.getNode('node-a');
        expect(nodeA?.txPower).toBe(20);

        const link = await newPersistence.getLink('node-a', 'node-b');
        expect(link?.distance).toBe(7.5);
      } finally {
        await newPersistence.deleteDatabase();
      }
    });

    it('should replace existing data on import', async () => {
      await persistence.saveNode(createNode('old-node'));

      await persistence.importJSON({
        nodes: [createNode('new-node')],
        links: [],
      });

      const oldNode = await persistence.getNode('old-node');
      const newNode = await persistence.getNode('new-node');

      expect(oldNode).toBeUndefined();
      expect(newNode).toBeDefined();
    });
  });

  describe('database lifecycle', () => {
    it('should report open state', async () => {
      expect(persistence.isOpen()).toBe(true);

      persistence.close();
      expect(persistence.isOpen()).toBe(false);
    });
  });
});
