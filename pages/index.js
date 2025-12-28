// pages/index.js
import { useState, useEffect, useRef } from 'react';

// 🔗 your Render backend base URL
const API_BASE = 'https://btc-flacon-b5-5.onrender.com'; 
// If you redeploy and URL changes, just update this string.

export default function DoubleSpendTool() {
  // Core state
  const [network] = useState('testnet');        // locked to testnet (safer)
  const [address, setAddress] = useState('');
  const [wif, setWif] = useState('');
  const [utxos, setUtxos] = useState([]);
  const [selectedUtxo, setSelectedUtxo] = useState(null);
  const [output1, setOutput1] = useState('');
  const [output2, setOutput2] = useState('');
  const [rbf, setRbf] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Mempool state (optional eye candy)
  const [mempoolTxs, setMempoolTxs] = useState([]);
  const wsRef = useRef(null);

  // ─────────────────────────────────────
  // Live mempool watcher (uses mempool.space WS)
  // ─────────────────────────────────────
  useEffect(() => {
    if (!address) return;

    const wsUrl =
      network === 'testnet'
        ? 'wss://mempool.space/testnet/ws'
        : 'wss://mempool.space/ws';

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // This is a light demo subscription; some backends expect a different format
      ws.send(
        JSON.stringify({
          action: 'want',
          data: ['blocks', 'stats', 'mempool-blocks'],
        })
      );
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.txid) {
          setMempoolTxs((prev) => [msg, ...prev.slice(0, 9)]);
        }
      } catch {
        // ignore parsing errors
      }
    };

    ws.onerror = () => {
      // ignore
    };

    return () => ws.close();
  }, [address, network]);

  // ─────────────────────────────────────
  // 1) Generate a fresh testnet wallet from Render API
  // ─────────────────────────────────────
  const generateKey = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/generate-key?net=${network}`);
      const data = await res.json();

      if (data.error) {
        alert('Error: ' + data.error);
        return;
      }

      setWif(data.wif);
      setAddress(data.address);
      setUtxos([]);
      setSelectedUtxo(null);
      setResult(null);
    } catch (err) {
      alert('Failed to contact backend: ' + err.message);
    }
  };

  // ─────────────────────────────────────
  // 2) Fetch UTXOs for current address from Render API
  // ─────────────────────────────────────
  const fetchUtxos = async () => {
    if (!address) {
      alert('No address set');
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/utxos?address=${encodeURIComponent(
          address
        )}&net=${network}`
      );
      const data = await res.json();

      if (data.error) {
        alert('Error: ' + data.error);
        return;
      }
      setUtxos(data);
      setSelectedUtxo(null);
      setResult(null);
    } catch (err) {
      alert('Failed to fetch UTXOs: ' + err.message);
    }
  };

  // ─────────────────────────────────────
  // 3) Craft the double-spend pair via Render API
  // ─────────────────────────────────────
  const handleDoubleSpend = async () => {
    if (!selectedUtxo || !output1 || !output2 || !wif) {
      alert('Fill all fields and select a UTXO first');
      return;
    }

    setLoading(true);
    setResult(null);

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
          enableRBF: rbf,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────
  // 4) Broadcast a raw tx via Render API
  // ─────────────────────────────────────
  const broadcast = async (hex, label) => {
    try {
      const res = await fetch(`${API_BASE}/api/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hex, net: network }),
      });

      const data = await res.json();
      if (data.error) {
        alert(`${label} error: ${data.error}`);
      } else {
        alert(`${label} broadcasted: ${data.txid}`);
      }
    } catch (e) {
      alert(`${label} failed: ` + e.message);
    }
  };

  // ─────────────────────────────────────
  // UI
  // ─────────────────────────────────────
  return (
    <div className="container">
      <h1>⚡ Bitcoin Double-Spend Lab (Testnet)</h1>

      {/* Network (locked to testnet for safety) */}
      <div className="section">
        <label>Network:</label>
        <select value={network} disabled>
          <option value="testnet">Testnet</option>
        </select>
        <p className="hint">Mainnet is intentionally disabled (education only).</p>
      </div>

      {/* Key / address */}
      <div className="section">
        <button onClick={generateKey}>Generate New Wallet</button>
        <p className="hint">
          This creates a fresh <b>testnet</b> key on the Render API. Never paste a
          real-money wallet here.
        </p>
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

      {/* Manual override (you can paste your own testnet key) */}
      <div className="section">
        <label>Address (testnet only)</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="tb1... testnet address"
        />

        <label>Private Key (WIF, testnet)</label>
        <input
          type="text"
          value={wif}
          onChange={(e) => setWif(e.target.value)}
          placeholder="cU... (never real mainnet keys)"
        />
      </div>

      {/* UTXOs */}
      <div className="section">
        <button onClick={fetchUtxos} disabled={!address}>
          Load UTXOs
        </button>
        {utxos.length > 0 && (
          <select
            onChange={(e) =>
              setSelectedUtxo(utxos[parseInt(e.target.value, 10)])
            }
          >
            <option value="">-- Select UTXO --</option>
            {utxos.map((u, i) => (
              <option key={i} value={i}>
                {u.txid}:{u.vout} — {u.value} sats
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Outputs */}
      <div className="section">
        <input
          type="text"
          value={output1}
          onChange={(e) => setOutput1(e.target.value)}
          placeholder="Output 1 (Victim / target address)"
        />
        <input
          type="text"
          value={output2}
          onChange={(e) => setOutput2(e.target.value)}
          placeholder="Output 2 (Return / attacker address)"
        />
      </div>

      {/* RBF flag */}
      <div className="section">
        <label>
          <input
            type="checkbox"
            checked={rbf}
            onChange={(e) => setRbf(e.target.checked)}
          />
          Enable RBF flag (lab only, still testnet)
        </label>
      </div>

      {/* Craft button */}
      <button
        onClick={handleDoubleSpend}
        disabled={loading}
        className="primary-btn"
      >
        {loading ? 'Crafting...' : 'Craft Double-Spend Pair'}
      </button>

      {/* Results */}
      {result && (
        <div className="results">
          <h3>✅ Transactions Crafted (Testnet)</h3>
          <div className="tx-group">
            <div>
              <p>
                <strong>TX1:</strong> {result.tx1.txid}
              </p>
              <button onClick={() => broadcast(result.tx1.hex, 'TX1')}>
                Broadcast TX1
              </button>
            </div>
            <div>
              <p>
                <strong>TX2:</strong> {result.tx2.txid}
              </p>
              <button onClick={() => broadcast(result.tx2.hex, 'TX2')}>
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

      {/* Mempool */}
      <div className="mempool-section">
        <h3>📡 Live Mempool ({mempoolTxs.length})</h3>
        <div className="mempool-list">
          {mempoolTxs.map((tx, i) => (
            <div key={i} className="mempool-tx">
              <span>{(tx.txid || '').slice(0, 12)}...</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
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
          margin-top: 10px;
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
        .hint {
          font-size: 12px;
          color: #666;
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
