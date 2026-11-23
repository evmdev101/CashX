"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import "./limited-token-insights.css";

export type LimitedTokenInsightView = "holders" | "activity";

type TokenDetails = {
  key: string;
  name: string;
  symbol: string;
  address: string;
  logo: string;
  decimals: number;
};

type HolderRow = { address: string; rawBalance: string };
type ActivityRow = {
  hash: string;
  from: string;
  to: string;
  rawValue: string;
  decimals: number;
  timestamp: string;
  method: string;
};
type LimitedTokenInsightsProps = { token: TokenDetails; view: LimitedTokenInsightView };

const API_BASE = "https://api.scan.pulsechain.com/api/v2";
const EXPLORER_BASE = "https://scan.pulsechain.com";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

function addressFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "hash" in value) {
    const hash = (value as { hash?: unknown }).hash;
    return typeof hash === "string" ? hash : "";
  }
  return "";
}

function compactAddress(address: string): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Unknown";
}

function formattedUnits(rawValue: string, decimals: number, maximumFractionDigits = 4): string {
  try {
    const value = BigInt(rawValue || "0");
    const divisor = 10n ** BigInt(decimals);
    const whole = value / divisor;
    const fraction = (value % divisor).toString().padStart(decimals, "0");
    const trimmedFraction = fraction.slice(0, maximumFractionDigits).replace(/0+$/, "");
    return trimmedFraction ? `${whole.toLocaleString("en-US")}.${trimmedFraction}` : whole.toLocaleString("en-US");
  } catch {
    return "0";
  }
}

function percentageOf(rawValue: string, rawSupply: string): string {
  try {
    const value = BigInt(rawValue || "0");
    const supply = BigInt(rawSupply || "0");
    if (supply === 0n) return "0%";
    return `${(Number((value * 10_000n) / supply) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  } catch {
    return "0%";
  }
}

function relativeTime(timestamp: string): string {
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return "Recently";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function fetchPulseData(path: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}${path}`, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`PulseChain explorer returned ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

export default function LimitedTokenInsights({ token, view }: LimitedTokenInsightsProps) {
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [totalSupply, setTotalSupply] = useState("0");
  const [holderCount, setHolderCount] = useState(0);
  const [decimals, setDecimals] = useState(token.decimals);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      fetchPulseData(`/tokens/${token.address}`, controller.signal),
      fetchPulseData(`/tokens/${token.address}/holders`, controller.signal),
      fetchPulseData(`/tokens/${token.address}/transfers`, controller.signal),
    ])
      .then(([metadata, holderResponse, transferResponse]) => {
        const tokenDecimals = Number(metadata.decimals ?? token.decimals);
        const resolvedDecimals = Number.isFinite(tokenDecimals) ? tokenDecimals : token.decimals;
        setDecimals(resolvedDecimals);
        setTotalSupply(String(metadata.total_supply ?? metadata.totalSupply ?? "0"));
        setHolderCount(Number(metadata.holders ?? 0));
        const holderItems = Array.isArray(holderResponse.items) ? holderResponse.items : [];
        setHolders(holderItems.slice(0, 50).map((item) => {
          const row = item as Record<string, unknown>;
          return { address: addressFrom(row.address), rawBalance: String(row.value ?? row.balance ?? "0") };
        }));
        const transferItems = Array.isArray(transferResponse.items) ? transferResponse.items : [];
        setActivity(transferItems.slice(0, 50).map((item) => {
          const row = item as Record<string, unknown>;
          const total = row.total && typeof row.total === "object" ? row.total as Record<string, unknown> : {};
          const transferToken = row.token && typeof row.token === "object" ? row.token as Record<string, unknown> : {};
          const rowDecimals = Number(total.decimals ?? transferToken.decimals ?? resolvedDecimals);
          return {
            hash: String(row.transaction_hash ?? row.tx_hash ?? ""),
            from: addressFrom(row.from),
            to: addressFrom(row.to),
            rawValue: String(total.value ?? row.value ?? row.amount ?? "0"),
            decimals: Number.isFinite(rowDecimals) ? rowDecimals : resolvedDecimals,
            timestamp: String(row.timestamp ?? ""),
            method: String(row.method ?? ""),
          };
        }));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Unable to load token data");
          setHolders([]);
          setActivity([]);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reloadKey, token.address, token.decimals]);

  const circulatingHolders = useMemo(
    () => holders.filter((holder) => holder.address && holder.address.toLowerCase() !== ZERO_ADDRESS),
    [holders],
  );
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  return (
    <section className="limited-insights" aria-label={`${token.name} ${view}`}>
      <div className="limited-insights__heading">
        <div className="limited-insights__title">
          <img src={token.logo} alt="" />
          <div>
            <span className="limited-insights__eyebrow">Live on PulseChain</span>
            <h2>{view === "holders" ? `${token.symbol} Holders` : `${token.symbol} Activity`}</h2>
          </div>
        </div>
        <div className="limited-insights__heading-actions">
          <span>{view === "holders" ? `${holderCount.toLocaleString("en-US")} holders` : `${activity.length} recent events`}</span>
          <button type="button" onClick={refresh} aria-label={`Refresh ${token.symbol} ${view}`}>↻</button>
        </div>
      </div>

      {loading ? (
        <div className="limited-insights__state">Loading live {token.symbol} {view}…</div>
      ) : error ? (
        <div className="limited-insights__state limited-insights__state--error">
          <strong>Unable to load live data right now.</strong><span>{error}</span><button type="button" onClick={refresh}>Try again</button>
        </div>
      ) : view === "holders" ? (
        <div className="limited-insights__list" role="tabpanel" aria-label={`${token.symbol} holders`}>
          <div className="limited-insights__columns limited-insights__columns--holders"><span>Wallet</span><span>Owned</span><span>% owned</span></div>
          {circulatingHolders.length === 0 ? <div className="limited-insights__state">No holders found yet.</div> : circulatingHolders.map((holder, index) => (
            <a className="limited-insights__row limited-insights__row--holder" href={`${EXPLORER_BASE}/address/${holder.address}`} target="_blank" rel="noreferrer" key={holder.address}>
              <div className="limited-insights__wallet"><span className="limited-insights__rank">{index + 1}</span><span className="limited-insights__avatar" style={{ "--avatar-index": index } as CSSProperties} /><span>{compactAddress(holder.address)}</span></div>
              <strong>{formattedUnits(holder.rawBalance, decimals)}</strong><span>{percentageOf(holder.rawBalance, totalSupply)}</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="limited-insights__list" role="tabpanel" aria-label={`${token.symbol} activity`}>
          {activity.length === 0 ? <div className="limited-insights__state">No token activity found yet.</div> : activity.map((event, index) => {
            const from = event.from.toLowerCase();
            const to = event.to.toLowerCase();
            const isMint = from === ZERO_ADDRESS;
            const isBurn = to === ZERO_ADDRESS || to === DEAD_ADDRESS;
            const eventLabel = isMint ? "Mint" : isBurn ? "Burn" : "Transfer";
            return (
              <article className="limited-insights__row limited-insights__row--activity" key={`${event.hash}-${index}`}>
                <div className="limited-insights__activity-main"><div>
                  <span>{eventLabel} · {isMint ? `to ${compactAddress(event.to)}` : isBurn ? `by ${compactAddress(event.from)}` : `${compactAddress(event.from)} → ${compactAddress(event.to)}`}</span>
                  <strong>{formattedUnits(event.rawValue, event.decimals)} {token.symbol}</strong>{event.method && <small>{event.method}</small>}
                </div></div>
                <div className="limited-insights__activity-action"><time dateTime={event.timestamp}>{relativeTime(event.timestamp)}</time>{event.hash && <a href={`${EXPLORER_BASE}/tx/${event.hash}`} target="_blank" rel="noreferrer">View tx ↗</a>}</div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
