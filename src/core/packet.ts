/**
 * Packet types and serialization for mesh network communication
 */

export interface PacketHeader {
  id: string; // Unique packet ID (for deduplication)
  source: string; // Originating node ID
  destination: string; // Target node ID or 'broadcast'
  hopLimit: number; // TTL, decremented each hop
  hopCount: number; // How many hops so far
  timestamp: number; // Simulation time created
}

export interface PacketMeta {
  path: string[]; // Node IDs this packet has traversed
  createdAt: number; // Simulation time
  deliveredAt?: number; // Simulation time when delivered
}

export interface Packet {
  header: PacketHeader;
  payload: Uint8Array;
  meta: PacketMeta;
}

const DEFAULT_HOP_LIMIT = 7;

/**
 * Generate a unique packet ID
 */
function generatePacketId(): string {
  return `pkt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a new packet
 */
export function createPacket(
  source: string,
  destination: string,
  payload: Uint8Array,
  hopLimit: number = DEFAULT_HOP_LIMIT
): Packet {
  const now = Date.now();

  return {
    header: {
      id: generatePacketId(),
      source,
      destination,
      hopLimit,
      hopCount: 0,
      timestamp: now,
    },
    payload,
    meta: {
      path: [source],
      createdAt: now,
    },
  };
}

/**
 * Clone a packet for forwarding (decrements hop limit, increments hop count)
 * Returns null if hop limit is exhausted
 */
export function cloneForForward(
  packet: Packet,
  forwarderId: string
): Packet | null {
  if (packet.header.hopLimit <= 0) {
    return null;
  }

  return {
    header: {
      ...packet.header,
      hopLimit: packet.header.hopLimit - 1,
      hopCount: packet.header.hopCount + 1,
    },
    payload: packet.payload,
    meta: {
      ...packet.meta,
      path: [...packet.meta.path, forwarderId],
    },
  };
}

/**
 * Serialize packet to binary format
 */
export function serializePacket(packet: Packet): Uint8Array {
  const encoder = new TextEncoder();

  // Encode header fields
  const idBytes = encoder.encode(packet.header.id);
  const sourceBytes = encoder.encode(packet.header.source);
  const destinationBytes = encoder.encode(packet.header.destination);

  // Calculate total size
  const headerSize =
    1 + // id length
    idBytes.length +
    1 + // source length
    sourceBytes.length +
    1 + // destination length
    destinationBytes.length +
    1 + // hop limit
    1 + // hop count
    8 + // timestamp (64-bit float)
    4; // payload length

  const totalSize = headerSize + packet.payload.length;
  const buffer = new Uint8Array(totalSize);

  let offset = 0;

  // Write header
  buffer[offset++] = idBytes.length;
  buffer.set(idBytes, offset);
  offset += idBytes.length;

  buffer[offset++] = sourceBytes.length;
  buffer.set(sourceBytes, offset);
  offset += sourceBytes.length;

  buffer[offset++] = destinationBytes.length;
  buffer.set(destinationBytes, offset);
  offset += destinationBytes.length;

  buffer[offset++] = packet.header.hopLimit;
  buffer[offset++] = packet.header.hopCount;

  // Write timestamp as 64-bit float
  const timestampView = new DataView(buffer.buffer);
  timestampView.setFloat64(offset, packet.header.timestamp, true);
  offset += 8;

  // Write payload length
  const payloadLengthView = new DataView(buffer.buffer);
  payloadLengthView.setUint32(offset, packet.payload.length, true);
  offset += 4;

  // Write payload
  buffer.set(packet.payload, offset);

  return buffer;
}

/**
 * Deserialize packet from binary format
 */
export function deserializePacket(data: Uint8Array): Packet {
  const decoder = new TextDecoder();
  let offset = 0;

  // Read ID
  const idLength = data[offset++]!;
  const idBytes = data.slice(offset, offset + idLength);
  const id = decoder.decode(idBytes);
  offset += idLength;

  // Read source
  const sourceLength = data[offset++]!;
  const sourceBytes = data.slice(offset, offset + sourceLength);
  const source = decoder.decode(sourceBytes);
  offset += sourceLength;

  // Read destination
  const destinationLength = data[offset++]!;
  const destinationBytes = data.slice(offset, offset + destinationLength);
  const destination = decoder.decode(destinationBytes);
  offset += destinationLength;

  // Read hop limit and count
  const hopLimit = data[offset++]!;
  const hopCount = data[offset++]!;

  // Read timestamp
  const timestampView = new DataView(data.buffer, data.byteOffset);
  const timestamp = timestampView.getFloat64(offset, true);
  offset += 8;

  // Read payload length
  const payloadLengthView = new DataView(data.buffer, data.byteOffset);
  const payloadLength = payloadLengthView.getUint32(offset, true);
  offset += 4;

  // Read payload
  const payload = data.slice(offset, offset + payloadLength);

  return {
    header: {
      id,
      source,
      destination,
      hopLimit,
      hopCount,
      timestamp,
    },
    payload,
    meta: {
      path: [source],
      createdAt: timestamp,
    },
  };
}
