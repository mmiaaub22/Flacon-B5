// pages/index.js
import { useState, useEffect, useRef } from 'react';

// 👉 change this if Render URL changes
const API_BASE = 'https://btc-flacon-b5-5.onrender.com';

export default function DoubleSpendTool() {
  // Core state
  const [network, setNetwork] = useState('testnet');
  const [address, setAddress] = useState('');
  const [wif, setWif] = useState('');
  const [utxos, setUtxos] = useState([]);
  const [selectedUtxo, setSelectedUtxo] = useState(null);
  const [output1, setOutput1] = useState('');
  const [output2, setOutput2] = useState('');
  const [rbf, setRbf] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Mempool state (UI only – no WS here)
  const [mempoolTxs, setMempoolTxs] = useState([]);
  const wsRef = useRef(null);

  // --- simple mempool watcher (optional, can delete whole useEffect if you like)
  useEffect(() => {
    if (!address) return;

    const wsUrl =
      network === 'testnet'
        ? 'wss://mempool.space/testnet/ws'
        : 'wss://mempool.space/ws';

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      // this “action” format is just our own convention – mempool
      // doesn’t actually support “track-address” messages like this.
      // You can remove this send() if you want.
      try {
        wsRef.current.send(
          JSON.stringify({
            action: 'track-address',
            address
          })
        );
      } catch (e) {
        console.warn('WS send failed', e);
      }
    };

    wsRef.current.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'mempool-tx') {
          setMempoolTxs((prev) => [msg, ...prev.slice(0, 9)]);
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    return () => wsRef.current && wsRef.current.close();
  }, [address, network]);

  // --- API calls (all hit your Render backend) ---

  // Generate new key pair
  async function generateKey() {
    const res = await fetch(
      `${API_BASE}/api/generate-key?net=${encodeURIComponent(network)}`
    );
    const data = await res.json();
    if (data.error) {
      alert('Error: ' + data.error);
      return;
    }
    setWif(data.wif);
    setAddress(data.address);
  }

  // Load UTXOs
  async function fetchUtxos() {
    if (!address) {
      alert('No address yet – generate one first.');
      return;
    }
    const url = `${API_BASE}/api/utxos?address=${encodeURIComponent(
      address
    )}&net=${encodeURIComponent(network)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      alert('UTXO error: ' + data.error);
      return;
    }
    setUtxos(data);
  }

  // Craft double-spend
  async function handleDoubleSpend() {
    if (!selectedUtxo || !output1 || !output2 || !wif) {
      alert('Fill all fields + select UTXO');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/double-spend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wif,
          utxo: selectedUtxo,
          outputAddress1: output1,
          outputAddress2: output2,
          feeRate: 3,
          net: network,
          enableRBF: rbf
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setLoading(false);
  }

  // Broadcast TX via backend
  async function broadcast(hex, label) {
    const res = await fetch(`${API_BASE}/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hex, net: network })
    });
    const data = await res.json();
    alert(`${label} broadcast: ${data.txid || data.error}`);
  }

  // --- UI ---
  return (
    <div className="container">
      <h1>⚡ Bitcoin Double-Spend Lab (Testnet)</h1>

      {/* Network Selector */}
      <div className="section">
        <label>Network: </label>
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
        >
          <option value="testnet">Testnet</option>
          <option value="main">Mainnet (⚠️ for viewing only)</option>
        </select>
      </div>

      {/* Key Generation */}
      <div className="section">
        <button onClick={generateKey}>Generate New Wallet</button>
        {wif && (
          <div className="key-display">
            <p>
              <strong>Address:</strong> {address}
            </p>
            <p>
              <strong>WIF:</strong>{' '}
              <span className="wif">{wif}</span>
            </p>
          </div>
        )}
      </div>

      {/* UTXO Selection */}
      <div className="section">
        <button onClick={fetchUtxos} disabled={!address}>
          Load UTXOs
        </button>
        {utxos.length > 0 && (
          <select
            onChange={(e) =>
              setSelectedUtxo(utxos[e.target.value])
            }
          >
            <option value="">-- Select UTXO --</option>
            {utxos.map((utxo, i) => (
              <option key={i} value={i}>
                {utxo.txid}:{utxo.vout} — {utxo.value} sats
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Output Addresses */}
      <div className="section">
        <input
          type="text"
          value={output1}
          onChange={(e) => setOutput1(e.target.value)}
          placeholder="Output 1 (Victim / target)"
        />
        <input
          type="text"
          value={output2}
          onChange={(e) => setOutput2(e.target.value)}
          placeholder="Output 2 (Return / attacker)"
        />
      </div>

      {/* RBF Toggle */}
      <div className="section">
        <label>
          <input
            type="checkbox"
            checked={rbf}
            onChange={(e) => setRbf(e.target.checked)}
          />
          Enable RBF flag (lab only)
        </label>
      </div>

      {/* Craft Button */}
      <button
        onClick={handleDoubleSpend}
        disabled={loading}
        className="primary-btn"
      >
        {loading ? 'Crafting…' : 'Craft Double-Spend Pair'}
      </button>

      {/* Results */}
      {result && (
        <div className="results">
          <h3>✅ Transactions Crafted</h3>
          <div className="tx-group">
            <div>
              <p>
                <strong>TX1:</strong> {result.tx1.txid}
              </p>
              <button
                onClick={() =>
                  broadcast(result.tx1.hex, 'TX1')
                }
              >
                Broadcast TX1
              </button>
            </div>
            <div>
              <p>
                <strong>TX2:</strong> {result.tx2.txid}
              </p>
              <button
                onClick={() =>
                  broadcast(result.tx2.hex, 'TX2')
                }
              >
                Broadcast TX2
              </button>
            </div>
          </div>
          <details>
            <summary>View Raw Transactions</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      )}

      {/* Mempool Monitor (UI only) */}
      <div className="mempool-section">
        <h3>📡 Live Mempool ({mempoolTxs.length})</h3>
        <div className="mempool-list">
          {mempoolTxs.map((tx, i) => (
            <div key={i} className="mempool-tx">
              <span>
                {(tx.txid || '').slice(0, 10)}…
              </span>
              <span>{tx.fee || '?'} sat/vB</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          font-family: system-ui, sans-serif;
        }
        .section {
          margin: 15px 0;
        }
        input,
        select {
          width: 100%;
          padding: 8px;
          margin: 5px 0;
          box-sizing: border-box;
        }
        .primary-btn {
          background: #0070f3;
          color: white;
          padding: 12px 24px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
        }
        .key-display {
          background: #f5f5f5;
          padding: 10px;
          border-radius: 4px;
          margin-top: 10px;
        }
        .wif {
          font-family: monospace;
          font-size: 12px;
          word-break: break-all;
        }
        .results {
          margin-top: 20px;
          padding: 15px;
          background: #f0f9ff;
          border-radius: 8px;
        }
        .tx-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin: 15px 0;
        }
        .mempool-section {
          margin-top: 30px;
          border-top: 1px solid #eee;
          padding-top: 20px;
        }
        .mempool-list {
          max-height: 200px;
          overflow-y: auto;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .mempool-tx {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          border-bottom: 1px solid #eee;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
