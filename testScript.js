const WebSocket = require("ws");
const zlib = require("zlib");
// ====== CONFIG ======
const API_KEY = "";
const ACCESS_TOKEN ="";
const INSTRUMENT_TOKEN = 5786113; 

const WS_URL = `wss://ws.kite.trade?api_key=${API_KEY}&access_token=${ACCESS_TOKEN}`;


function parseBinaryTicks(buffer) {
  const packets = [];
  let offset = 0;

  try {
    // Read number of packets (2 bytes)
    if (buffer.length < 2) return packets;
    const numPackets = buffer.readUInt16BE(offset);
    offset += 2;

    for (let i = 0; i < numPackets; i++) {
      // Check if we have enough bytes for packet length
      if (offset + 2 > buffer.length) {
        console.warn(`⚠️ Insufficient data for packet ${i} length`);
        break;
      }

      // Read packet length (2 bytes)
      const packetLength = buffer.readUInt16BE(offset);
      offset += 2;

      // Check if we have the full packet
      if (offset + packetLength > buffer.length) {
        console.warn(`⚠️ Insufficient data for packet ${i}: need ${packetLength}, have ${buffer.length - offset}`);
        break;
      }

      const packet = buffer.slice(offset, offset + packetLength);
      offset += packetLength;

      // Parse based on packet length (mode)
      // LTP mode: 8 bytes
      // Index Quote: 28 bytes  
      // Quote mode: 44 bytes
      // Full mode: 184 bytes

      if (packet.length >= 8) {
        const instrument_token = packet.readUInt32BE(0);
        
        const tick = {
          instrument_token,
          mode: packet.length === 8 ? 'ltp' : 
                packet.length === 28 ? 'index_quote' :
                packet.length === 44 ? 'quote' : 'full'
        };

        // All modes have last_price (divisible)
        if (packet.length >= 8) {
          tick.last_price = packet.readUInt32BE(4) / 100.0;
        }

        // Quote and Full modes
        if (packet.length >= 44) {
          tick.last_traded_quantity = packet.readUInt32BE(8);
          tick.average_traded_price = packet.readUInt32BE(12) / 100.0;
          tick.volume_traded = packet.readUInt32BE(16);
          tick.total_buy_quantity = packet.readUInt32BE(20);
          tick.total_sell_quantity = packet.readUInt32BE(24);
          tick.ohlc = {
            open: packet.readUInt32BE(28) / 100.0,
            high: packet.readUInt32BE(32) / 100.0,
            low: packet.readUInt32BE(36) / 100.0,
            close: packet.readUInt32BE(40) / 100.0
          };
        }

        // Full mode additional data
        if (packet.length >= 184) {
          tick.last_trade_time = packet.readUInt32BE(44);
          tick.oi = packet.readUInt32BE(48);
          tick.oi_day_high = packet.readUInt32BE(52);
          tick.oi_day_low = packet.readUInt32BE(56);
          tick.timestamp = packet.readUInt32BE(60);
          
          // Market depth (buy/sell orders)
          tick.depth = {
            buy: [],
            sell: []
          };

          let depthOffset = 64;
          // 5 buy orders
          for (let j = 0; j < 5; j++) {
            tick.depth.buy.push({
              quantity: packet.readUInt32BE(depthOffset),
              price: packet.readUInt32BE(depthOffset + 4) / 100.0,
              orders: packet.readUInt16BE(depthOffset + 8)
            });
            depthOffset += 12;
          }
          
          // 5 sell orders
          for (let j = 0; j < 5; j++) {
            tick.depth.sell.push({
              quantity: packet.readUInt32BE(depthOffset),
              price: packet.readUInt32BE(depthOffset + 4) / 100.0,
              orders: packet.readUInt16BE(depthOffset + 8)
            });
            depthOffset += 12;
          }
        }

        packets.push(tick);
      }
    }

    return packets;
  } catch (err) {
    console.error("❌ Parse error:", err.message);
    console.error("Buffer length:", buffer.length, "Offset:", offset);
    return packets;
  }
}

// ===== MAIN =====
const ws = new WebSocket(WS_URL);

ws.on("open", () => {
  console.log("✅ Connected to Kite WebSocket");

  // Subscribe
  const subscribeMsg = { a: "subscribe", v: [INSTRUMENT_TOKEN] };
  ws.send(JSON.stringify(subscribeMsg));
  console.log("📡 Subscribed:", subscribeMsg);

  // Set mode to 'quote' (use 'full' for complete market depth)
  const modeMsg = { a: "mode", v: ["quote", [INSTRUMENT_TOKEN]] };
  ws.send(JSON.stringify(modeMsg));
  console.log("⚙️ Set mode:", modeMsg);
});

ws.on("message", (message) => {
  if (Buffer.isBuffer(message)) {
    try {
      let data = message;
      
      // Check if compressed (zlib magic bytes: 0x78, 0x9c or 0x78, 0x01)
      if (message.length >= 2 && message[0] === 0x78 && 
          (message[1] === 0x9c || message[1] === 0x01 || message[1] === 0xda)) {
        data = zlib.inflateSync(message);
      }

      const ticks = parseBinaryTicks(data);
      
      if (ticks.length > 0) {
        console.log("\n💹 Tick received:");
        for (const tick of ticks) {
          console.log(JSON.stringify(tick, null, 2));
        }
      }
    } catch (err) {
      console.error("⚠️ Binary message error:", err.message);
      console.error("Message length:", message.length);
      console.error("First bytes:", message.slice(0, Math.min(10, message.length)));
    }
  } else {
    try {
      const text = message.toString();
      const parsed = JSON.parse(text);
      console.log("🪶 Text Message:", parsed);
    } catch {
      console.log("📜 Raw Text:", message.toString());
    }
  }
});

ws.on("close", () => console.log("❌ Connection closed"));
ws.on("error", (err) => console.error("⚠️ WebSocket error:", err));