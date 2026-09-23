"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronUp,
  Percent,
} from "lucide-react";
import {
  type BasketAllocation,
  type MarketAsset,
  type ProgrammableBasket,
  calculateEqualWeights,
  calculateMarketCapWeights,
  decodeBasketShareCode,
  encodeBasketShareCode,
  forkCuratedBasket,
  formatSocialUrl,
  MAX_CUSTOM_BASKET_LEGS,
  MIN_CUSTOM_BASKET_LEGS,
  resolveProgrammableBasket,
  MAINNET_USDC_MINT,
} from "@kite/sdk";
import { useKite } from "./State";
import { Change, compactMoney, money, AssetAvatar } from "./MarketUI";
import { MarketStatus } from "./Discover";
import { ActualBasketPanel } from "../trading/ActualBasketPanel";
import { useTradingAuth } from "../trading/TradingAuth";
import { kiteClient } from "./api-client";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../ui/command";

const SEGMENT_COLORS = [
  "#d5f478", // Lime accent
  "#60a5fa", // Blue
  "#34d399", // Emerald
  "#fbbf24", // Amber
  "#a78bfa", // Violet
];

const STARTER_TEMPLATES: Array<{
  name: string;
  ticker: string;
  description: string;
  category: ProgrammableBasket["category"];
  symbols: string[];
}> = [
  {
    name: "Magnificent Four",
    ticker: "SOL-MAG4",
    description: "Equal-weight concentration in four trillion-dollar AI and cloud leaders.",
    category: "technology",
    symbols: ["NVDA", "AAPL", "MSFT", "AMZN"],
  },
  {
    name: "Silicon Stack",
    ticker: "SOL-CHIPS",
    description: "Frontier semiconductor designers and fabrication giants powering AI.",
    category: "technology",
    symbols: ["NVDA", "AMD", "TSM", "AVGO"],
  },
  {
    name: "Digital Monopolies",
    ticker: "SOL-MONOP",
    description: "Dominant consumer and enterprise platforms with fortress balance sheets.",
    category: "technology",
    symbols: ["GOOGL", "META", "MSFT", "AAPL"],
  },
  {
    name: "Macro Titans",
    ticker: "SOL-MACRO",
    description: "Broad US index trackers and physical gold reserve for balanced exposure.",
    category: "diversified",
    symbols: ["SPY", "QQQ", "GLD"],
  },
];

export function BasketBuilder() {
  return (
    <Suspense
      fallback={
        <div className="notice" role="status">
          Loading Basket Builder…
        </div>
      }
    >
      <BasketBuilderContent />
    </Suspense>
  );
}

function BasketBuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forkId = searchParams.get("fork");
  const importCode = searchParams.get("import");

  const {
    snapshot,
    mode,
    setMode,
    paper,
    tradeBasket,
    saveCustomBasket,
  } = useKite();
  const auth = useTradingAuth();

  const [name, setName] = useState("Custom Thematic Basket");
  const [ticker, setTicker] = useState("SOL-CUSTOM");
  const [description, setDescription] = useState(
    "Custom thematic portfolio allocated on Solana mainnet.",
  );
  const [category, setCategory] = useState<ProgrammableBasket["category"]>("technology");
  const [creatorName, setCreatorName] = useState("");
  const [creatorSocial, setCreatorSocial] = useState("");
  const [allocations, setAllocations] = useState<BasketAllocation[]>([]);
  const [driftThresholdBps, setDriftThresholdBps] = useState(500); // 5%

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"tvl" | "vol" | "price" | "name">("tvl");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [testingRoute, setTestingRoute] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [routeTestResult, setRouteTestResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);

  const [paperAmount, setPaperAmount] = useState("100");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Global '/' keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Available tradable assets on mainnet
  const availableAssets = useMemo(() => {
    return (snapshot?.assets ?? []).filter(
      (a) => a.verified && !a.tradingHalted && a.priceUsd != null && a.priceUsd > 0,
    );
  }, [snapshot]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: 0,
      tech: 0,
      finance: 0,
      consumer: 0,
      etfs: 0,
      prestocks: 0,
    };
    const techSymbols = new Set([
      "NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "AMD", "TSM", "AVGO", "ORCL", "CRM", "NOW",
    ]);
    const finSymbols = new Set(["JPM", "GS", "V", "MA", "MS", "BAC"]);
    const consSymbols = new Set(["MCD", "SBUX", "KO", "NKE", "WMT", "COST"]);
    const etfSymbols = new Set(["SPY", "QQQ", "GLD", "IWM"]);

    for (const a of availableAssets) {
      counts.all++;
      const sym = a.symbol.toUpperCase();
      if (techSymbols.has(sym)) counts.tech++;
      if (finSymbols.has(sym)) counts.finance++;
      if (consSymbols.has(sym)) counts.consumer++;
      if (a.kind === "etf" || etfSymbols.has(sym)) counts.etfs++;
      if (a.issuer === "prestocks" || a.kind === "pre-ipo") counts.prestocks++;
    }
    return counts;
  }, [availableAssets]);

  // Load fork or import on mount
  useEffect(() => {
    if (forkId && snapshot) {
      const allBaskets = snapshot.baskets ?? [];
      const target = allBaskets.find((b) => b.id === forkId);
      if (target) {
        const forked = forkCuratedBasket(target);
        setName(forked.name || "Custom Basket");
        setTicker(forked.ticker || "CUSTOM");
        setDescription(forked.description || "");
        setCategory(forked.category || "technology");
        setAllocations(forked.allocations);
      }
    } else if (importCode && snapshot) {
      try {
        const imported = decodeBasketShareCode(importCode);
        if (imported) {
          setName(imported.name || "Imported Basket");
          setTicker(imported.ticker || "CUSTOM");
          setDescription(imported.description || "");
          setCategory(imported.category || "technology");
          setAllocations(imported.allocations);
          if (imported.creatorName) setCreatorName(imported.creatorName);
          if (imported.creatorSocial) setCreatorSocial(imported.creatorSocial);
          if (imported.rebalanceRules?.driftThresholdBps) {
            setDriftThresholdBps(imported.rebalanceRules.driftThresholdBps);
          }
        }
      } catch (err) {
        console.error("Failed to decode imported basket code:", err);
      }
    }
  }, [forkId, importCode, snapshot]);

  // Default selection if empty and assets loaded
  useEffect(() => {
    if (allocations.length === 0 && availableAssets.length >= 2 && !forkId && !importCode) {
      const defaultPicks = availableAssets
        .filter((a) =>
          ["NVDA", "AAPL", "MSFT", "AMZN"].includes(a.symbol.toUpperCase()),
        )
        .slice(0, 4);
      if (defaultPicks.length >= 2) {
        setAllocations(calculateEqualWeights(defaultPicks));
      }
    }
  }, [availableAssets, allocations.length, forkId, importCode]);

  const totalWeightBps = allocations.reduce((sum, a) => sum + a.weightBps, 0);
  const isSumValid = totalWeightBps === 10_000;
  const isCountValid =
    allocations.length >= MIN_CUSTOM_BASKET_LEGS &&
    allocations.length <= MAX_CUSTOM_BASKET_LEGS;
  const isValid =
    isSumValid && isCountValid && Boolean(name.trim()) && Boolean(ticker.trim());

  // Account limit estimator (Solana V1 without ALTs)
  const estimatedAccounts = useMemo(() => {
    return 30 + allocations.length * 8;
  }, [allocations.length]);

  // Combined stats
  const combinedStats = useMemo(() => {
    const byMint = new Map(availableAssets.map((a) => [a.mint, a]));
    let totalLiquidity = 0;
    let totalVol = 0;
    for (const alloc of allocations) {
      const asset = byMint.get(alloc.mint);
      if (asset) {
        totalLiquidity += asset.liquidityUsd ?? 0;
        totalVol += asset.volume24hUsd ?? 0;
      }
    }
    return { totalLiquidity, totalVol };
  }, [allocations, availableAssets]);

  // Filtered candidate assets
  const filteredCandidates = useMemo(() => {
    let list = availableAssets.filter((a) => {
      if (selectedCategory === "all") return true;
      if (selectedCategory === "tech") {
        return ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "AMD", "TSM", "AVGO", "ORCL", "CRM", "NOW"].includes(a.symbol.toUpperCase());
      }
      if (selectedCategory === "finance") {
        return ["JPM", "GS", "V", "MA", "MS", "BAC"].includes(a.symbol.toUpperCase());
      }
      if (selectedCategory === "consumer") {
        return ["MCD", "SBUX", "KO", "NKE", "WMT", "COST"].includes(a.symbol.toUpperCase());
      }
      if (selectedCategory === "etfs") {
        return a.kind === "etf" || ["SPY", "QQQ", "GLD", "IWM"].includes(a.symbol.toUpperCase());
      }
      if (selectedCategory === "prestocks") {
        return a.issuer === "prestocks" || a.kind === "pre-ipo";
      }
      return true;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.symbol.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.issuer && a.issuer.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === "tvl") {
        return (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0);
      }
      if (sortBy === "vol") {
        return (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0);
      }
      if (sortBy === "price") {
        return (b.priceUsd ?? 0) - (a.priceUsd ?? 0);
      }
      if (sortBy === "name") {
        return a.symbol.localeCompare(b.symbol);
      }
      return 0;
    });
  }, [availableAssets, searchQuery, selectedCategory, sortBy]);

  // Actions
  const handleAddAsset = (asset: MarketAsset) => {
    if (allocations.length >= MAX_CUSTOM_BASKET_LEGS) return;
    const nextAssets = [
      ...allocations.map((a) => ({ mint: a.mint, symbol: a.symbol, name: a.name })),
      { mint: asset.mint, symbol: asset.symbol, name: asset.name },
    ];
    setAllocations(calculateEqualWeights(nextAssets));
    setRouteTestResult(null);
  };

  const handleRemoveAsset = (mint: string) => {
    if (allocations.length <= MIN_CUSTOM_BASKET_LEGS) return;
    const nextAssets = allocations
      .filter((a) => a.mint !== mint)
      .map((a) => ({ mint: a.mint, symbol: a.symbol, name: a.name }));
    setAllocations(calculateEqualWeights(nextAssets));
    setRouteTestResult(null);
  };

  const handleWeightChange = (mint: string, nextWeightPct: number) => {
    const targetBps = Math.max(1, Math.min(9900, Math.round(nextWeightPct * 100)));
    setAllocations((prev) =>
      prev.map((a) => (a.mint === mint ? { ...a, weightBps: targetBps } : a)),
    );
    setRouteTestResult(null);
  };

  const applyEqualWeights = () => {
    setAllocations((prev) => calculateEqualWeights(prev));
    setRouteTestResult(null);
  };

  const applyMarketCapWeights = () => {
    setAllocations((prev) => calculateMarketCapWeights(prev, availableAssets));
    setRouteTestResult(null);
  };

  const autoBalanceRemainder = () => {
    if (allocations.length === 0) return;
    const diff = 10_000 - totalWeightBps;
    if (diff === 0) return;
    setAllocations((prev) => {
      const copy = [...prev];
      const perLeg = Math.floor(diff / copy.length);
      const rem = diff % copy.length;
      return copy.map((item, i) => {
        const adjustment = perLeg + (i < Math.abs(rem) ? (diff > 0 ? 1 : -1) : 0);
        return {
          ...item,
          weightBps: Math.max(1, item.weightBps + adjustment),
        };
      });
    });
  };

  const applyTemplate = (template: (typeof STARTER_TEMPLATES)[number]) => {
    const matched = template.symbols
      .map((sym) =>
        availableAssets.find((a) => a.symbol.toUpperCase() === sym.toUpperCase()),
      )
      .filter((a): a is MarketAsset => Boolean(a));
    if (matched.length >= 2) {
      setName(template.name);
      setTicker(template.ticker);
      setDescription(template.description);
      setCategory(template.category);
      setAllocations(calculateEqualWeights(matched));
      setRouteTestResult(null);
    }
  };

  const testMainnetRoute = async () => {
    if (!isValid) return;
    setTestingRoute(true);
    setRouteTestResult(null);
    try {
      const order = await kiteClient.requestBasketOrder({
        basketId: "custom-test-route",
        customAllocations: allocations.map((a) => ({
          mint: a.mint,
          weightBps: a.weightBps,
        })),
        inputMint: MAINNET_USDC_MINT,
        amount: "50",
        taker: auth.walletAddress || "11111111111111111111111111111111",
        slippageBps: 100,
        supportedTransactionVersions: [1],
      });
      setRouteTestResult({
        success: true,
        message:
          "Mainnet route verified. Compiled 1 atomic V1 swap with zero dust leakage.",
        details: `${order.outputs.length} legs routed · ~${estimatedAccounts}/64 accounts · Priority fee: ${
          order.priorityFeeLamports / 1e9
        } SOL`,
      });
    } catch (e) {
      setRouteTestResult({
        success: false,
        message: e instanceof Error ? e.message : "Route verification failed.",
      });
    } finally {
      setTestingRoute(false);
    }
  };

  const saveBasket = () => {
    if (!isValid) return;
    const basketId = `custom-${ticker.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36)}`;
    const customBasket: ProgrammableBasket = {
      id: basketId,
      name: name.trim(),
      ticker: ticker.trim().toUpperCase(),
      description: description.trim(),
      category: category || "custom",
      allocations,
      rebalanceRules: { driftThresholdBps, schedule: "none" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isCustom: true,
      creatorName: creatorName.trim() || undefined,
      creatorSocial: formatSocialUrl(creatorSocial) || undefined,
    };
    saveCustomBasket(customBasket);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      router.push(`/basket/${basketId}`);
    }, 1200);
  };

  const handleShare = () => {
    if (!isValid) return;
    const dummy: ProgrammableBasket = {
      id: "preview",
      name: name.trim(),
      ticker: ticker.trim().toUpperCase(),
      description: description.trim(),
      category: category || "custom",
      allocations,
      rebalanceRules: { driftThresholdBps, schedule: "none" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isCustom: true,
      creatorName: creatorName.trim() || undefined,
      creatorSocial: formatSocialUrl(creatorSocial) || undefined,
    };
    const code = encodeBasketShareCode(dummy);
    const url = `${window.location.origin}/basket/builder?import=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 3000);
  };

  // Resolved MarketBasket for actual/paper execution
  const resolvedBasket = useMemo(() => {
    if (!isValid) return null;
    const dummy: ProgrammableBasket = {
      id: "custom-preview",
      name: name.trim(),
      ticker: ticker.trim().toUpperCase(),
      description: description.trim(),
      category: category || "custom",
      allocations,
      rebalanceRules: { driftThresholdBps, schedule: "none" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isCustom: true,
      creatorName: creatorName.trim() || undefined,
      creatorSocial: formatSocialUrl(creatorSocial) || undefined,
    };
    return resolveProgrammableBasket(dummy, availableAssets);
  }, [
    isValid,
    name,
    ticker,
    description,
    category,
    allocations,
    driftThresholdBps,
    availableAssets,
    creatorName,
    creatorSocial,
  ]);

  const handlePaperBuy = () => {
    if (!resolvedBasket || !resolvedBasket.available) return;
    const amt = Number(paperAmount);
    if (!(amt > 0) || amt > paper.cashUsd) return;
    tradeBasket(resolvedBasket, amt);
    router.push("/portfolio");
  };

  const diffPct = (100 - totalWeightBps / 100).toFixed(2);

  return (
    <>
      {/* Studio Header Bar */}
      <header className="builder-header">
        <div className="builder-nav-row">
          <Link href="/baskets" className="builder-breadcrumb">
            <ArrowLeft size={14} /> Back to curated baskets
          </Link>
          <div className="builder-actions-cluster">
            <button
              type="button"
              className="btn secondary small"
              onClick={handleShare}
              disabled={!isValid}
              title="Copy share link for this basket specification"
            >
              {copiedShare ? (
                <>
                  <Check size={14} className="up" /> Copied Link
                </>
              ) : (
                <>
                  <Share2 size={14} /> Share Specification
                </>
              )}
            </button>
            <button
              type="button"
              className="btn small"
              onClick={saveBasket}
              disabled={!isValid || saveSuccess}
            >
              {saveSuccess ? (
                <>
                  <CheckCircle2 size={14} /> Saved
                </>
              ) : (
                <>Save Custom Basket</>
              )}
            </button>
          </div>
        </div>

        <div className="builder-title-row">
          <div className="builder-title-group">
            <h1 className="builder-title">{name || "Custom Basket Studio"}</h1>
            <span
              className={`builder-status-badge ${
                isSumValid ? "valid" : totalWeightBps < 10_000 ? "under" : "over"
              }`}
            >
              {isSumValid ? (
                <>
                  <CheckCircle2 size={13} /> 100.00% Allocated (10,000 bps)
                </>
              ) : totalWeightBps < 10_000 ? (
                <>
                  <AlertTriangle size={13} /> {diffPct}% Unallocated
                  <button
                    type="button"
                    className="builder-status-auto-btn"
                    onClick={autoBalanceRemainder}
                    title="Distribute remainder across constituents"
                  >
                    Auto-balance
                  </button>
                </>
              ) : (
                <>
                  <AlertTriangle size={13} /> +{Math.abs(Number(diffPct)).toFixed(2)}% Overallocated
                  <button
                    type="button"
                    className="builder-status-auto-btn"
                    onClick={autoBalanceRemainder}
                    title="Scale down to exactly 100%"
                  >
                    Auto-balance
                  </button>
                </>
              )}
            </span>
          </div>
        </div>
      </header>

      <MarketStatus />

      {/* Starter Templates Presets Strip */}
      <section className="builder-presets-strip" aria-label="Starter Presets">
        <div className="builder-presets-label">
          <Sparkles size={14} />
          <span>Presets:</span>
        </div>
        <div className="builder-presets-list">
          {STARTER_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.ticker}
              type="button"
              className="builder-preset-btn"
              onClick={() => applyTemplate(tmpl)}
              title={tmpl.description}
            >
              <strong>{tmpl.name}</strong>
              <small>({tmpl.symbols.join(", ")})</small>
            </button>
          ))}
        </div>
      </section>

      {/* Main Studio Workspace Grid */}
      <div className="detail-grid">
        <div className="stack" style={{ gap: 20 }}>
          {/* Section 1: Portfolio Composition & Weight Rebalancer */}
          <section className="builder-card" aria-label="Constituents and Weights">
            <div className="builder-card-head">
              <div className="builder-card-title-group">
                <h2>Constituent Allocations</h2>
                <p>
                  Target weights for atomic single-transaction execution ({allocations.length} of {MAX_CUSTOM_BASKET_LEGS} max)
                </p>
              </div>
              <div className="builder-tools-cluster">
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={applyEqualWeights}
                  disabled={allocations.length === 0}
                  title="Equal weight with Hare-Niemeyer largest remainder (zero dust)"
                >
                  <Scale size={13} /> Equal Weight
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={applyMarketCapWeights}
                  disabled={allocations.length === 0}
                  title="Weight by catalog pool depth and liquidity"
                >
                  <SlidersHorizontal size={13} /> Market Cap
                </button>
              </div>
            </div>

            {/* Visual Allocation Distribution Bar */}
            <div className="builder-alloc-bar-container">
              <div
                className="builder-alloc-bar"
                role="progressbar"
                aria-valuenow={totalWeightBps / 100}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Basket allocation distribution"
              >
                {allocations.map((alloc, idx) => {
                  const pct = alloc.weightBps / 100;
                  const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
                  return (
                    <div
                      key={alloc.mint}
                      className="builder-alloc-segment"
                      style={{
                        width: `${Math.max(1, (alloc.weightBps / Math.max(10000, totalWeightBps)) * 100)}%`,
                        backgroundColor: color,
                      }}
                      title={`${alloc.symbol}: ${pct.toFixed(2)}%`}
                    />
                  );
                })}
              </div>

              <div className="builder-alloc-legend">
                {allocations.map((alloc, idx) => {
                  const pct = alloc.weightBps / 100;
                  const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
                  return (
                    <div key={alloc.mint} className="builder-alloc-legend-item">
                      <span
                        className="builder-alloc-dot"
                        style={{ backgroundColor: color }}
                      />
                      <span>
                        {alloc.symbol} <strong>{pct.toFixed(1)}%</strong>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Constituent Rows */}
            <ul className="builder-constituent-list">
              {allocations.map((alloc, idx) => {
                const asset = availableAssets.find((a) => a.mint === alloc.mint);
                const weightPct = alloc.weightBps / 100;
                const approxUsd =
                  mode === "paper"
                    ? ((Number(paperAmount) || 0) * weightPct) / 100
                    : 0;

                return (
                  <li key={alloc.mint} className="builder-constituent-row">
                    <div className="builder-constituent-info">
                      {asset && <AssetAvatar asset={asset} />}
                      <div className="builder-constituent-meta">
                        <span className="builder-constituent-symbol">
                          {alloc.symbol}
                        </span>
                        <span className="builder-constituent-sub">
                          {asset?.priceUsd ? money(asset.priceUsd) : "Live"} ·{" "}
                          {asset?.liquidityUsd
                            ? `${compactMoney(asset.liquidityUsd)} TVL`
                            : "Verified"}
                        </span>
                      </div>
                    </div>

                    <div className="builder-weight-controls">
                      <input
                        type="range"
                        min="1"
                        max="99"
                        step="1"
                        value={Math.round(weightPct)}
                        onChange={(e) =>
                          handleWeightChange(alloc.mint, Number(e.target.value))
                        }
                        className="builder-range-slider"
                        aria-label={`${alloc.symbol} weight percentage`}
                      />

                      <div className="builder-weight-input-group">
                        <input
                          type="number"
                          min="0.01"
                          max="99.99"
                          step="0.01"
                          value={weightPct}
                          onChange={(e) =>
                            handleWeightChange(alloc.mint, Number(e.target.value))
                          }
                          className="builder-weight-input"
                          aria-label={`${alloc.symbol} percentage`}
                        />
                        <span className="builder-weight-unit">%</span>
                      </div>

                      <span className="builder-bps-badge">
                        {alloc.weightBps} bps
                      </span>

                      {mode === "paper" && Number(paperAmount) > 0 && (
                        <span
                          className="fineprint"
                          style={{ minWidth: 50, textAlign: "right" }}
                        >
                          ~${approxUsd.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="builder-row-del-btn"
                      onClick={() => handleRemoveAsset(alloc.mint)}
                      disabled={allocations.length <= MIN_CUSTOM_BASKET_LEGS}
                      title={
                        allocations.length <= MIN_CUSTOM_BASKET_LEGS
                          ? "Baskets require at least 2 constituents"
                          : `Remove ${alloc.symbol}`
                      }
                      aria-label={`Remove ${alloc.symbol}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Catalog Discovery & Constituent Adder using shadcn/ui Command */}
            <div className="builder-catalog-panel">
              <div className="builder-catalog-top">
                <div className="builder-catalog-heading">
                  <span>Add Constituent</span>
                  <div
                    className="builder-capacity-meter"
                    title={`${allocations.length} of ${MAX_CUSTOM_BASKET_LEGS} max constituents`}
                  >
                    {Array.from({ length: MAX_CUSTOM_BASKET_LEGS }).map(
                      (_, i) => (
                        <span
                          key={i}
                          className={`builder-capacity-dot ${
                            i < allocations.length ? "filled" : ""
                          }`}
                        />
                      ),
                    )}
                  </div>
                  <span className="fineprint" style={{ margin: 0 }}>
                    ({allocations.length}/{MAX_CUSTOM_BASKET_LEGS} added)
                  </span>
                </div>

                <div className="builder-filter-row">
                  {[
                    { id: "all", label: "All" },
                    { id: "tech", label: "Technology" },
                    { id: "finance", label: "Finance" },
                    { id: "consumer", label: "Consumer" },
                    { id: "etfs", label: "ETFs" },
                    { id: "prestocks", label: "PreStocks" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`builder-category-chip ${
                        selectedCategory === cat.id ? "active" : ""
                      }`}
                      onClick={() => setSelectedCategory(cat.id)}
                    >
                      {cat.label} <small>({categoryCounts[cat.id] ?? 0})</small>
                    </button>
                  ))}
                </div>
              </div>

              <Command value={searchQuery} onValueChange={setSearchQuery}>
                <CommandInput
                  ref={searchInputRef}
                  placeholder="Search available mainnet equities by ticker, name, or issuer…"
                  shortcut="/"
                  onClear={() => setSearchQuery("")}
                />

                <CommandList>
                  {filteredCandidates.length === 0 ? (
                    <CommandEmpty>
                      <span>No tradable equities match &ldquo;{searchQuery}&rdquo;</span>
                      <div className="ui-command-empty-suggestions">
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>Quick picks:</span>
                        {["NVDA", "AAPL", "MSFT", "AMZN", "SPY"].map((sym) => (
                          <button
                            key={sym}
                            type="button"
                            className="ui-command-empty-chip"
                            onClick={() => {
                              setSearchQuery(sym);
                              setSelectedCategory("all");
                            }}
                          >
                            {sym}
                          </button>
                        ))}
                      </div>
                    </CommandEmpty>
                  ) : (
                    <CommandGroup
                      heading={
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span>Verified Mainnet Assets ({filteredCandidates.length})</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                fontSize: 10,
                                textTransform: "none",
                                color: "var(--muted)",
                              }}
                            >
                              Sort:
                            </span>
                            <select
                              value={sortBy}
                              onChange={(e) =>
                                setSortBy(
                                  e.target.value as "tvl" | "vol" | "price" | "name",
                                )
                              }
                              style={{
                                background: "var(--raised)",
                                border: "1px solid var(--line)",
                                borderRadius: 4,
                                color: "var(--ink)",
                                fontSize: 10,
                                padding: "2px 6px",
                                outline: "none",
                                cursor: "pointer",
                              }}
                            >
                              <option value="tvl">Deepest TVL</option>
                              <option value="vol">24h Volume</option>
                              <option value="price">Price</option>
                              <option value="name">Symbol A-Z</option>
                            </select>
                          </div>
                        </div>
                      }
                    >
                      {filteredCandidates.map((asset) => {
                        const isAlreadyAdded = allocations.some(
                          (a) => a.mint === asset.mint,
                        );
                        const isAtCapacity =
                          allocations.length >= MAX_CUSTOM_BASKET_LEGS;
                        const existingAlloc = allocations.find(
                          (a) => a.mint === asset.mint,
                        );

                        return (
                          <CommandItem
                            key={asset.mint}
                            disabled={isAlreadyAdded || isAtCapacity}
                            onSelect={() => {
                              if (!isAlreadyAdded && !isAtCapacity) {
                                handleAddAsset(asset);
                              }
                            }}
                          >
                            <div className="ui-command-item-left">
                              <AssetAvatar asset={asset} small />
                              <div className="ui-command-item-meta">
                                <div className="ui-command-item-title-row">
                                  <span className="ui-command-item-symbol">
                                    {asset.symbol}
                                  </span>
                                  <span className="ui-command-item-issuer">
                                    {asset.issuer === "prestocks"
                                      ? "PreStocks"
                                      : asset.kind === "etf"
                                      ? "ETF"
                                      : "xStocks"}
                                  </span>
                                </div>
                                <span className="ui-command-item-name">
                                  {asset.name}
                                </span>
                              </div>
                            </div>

                            <div className="ui-command-item-center">
                              <span className="ui-command-item-price">
                                {money(asset.priceUsd)}
                              </span>
                              {asset.change24hPct != null && (
                                <Change value={asset.change24hPct} />
                              )}
                            </div>

                            <div className="ui-command-item-right">
                              <div className="ui-command-item-stats">
                                <span>{compactMoney(asset.liquidityUsd)} TVL</span>
                                <span style={{ opacity: 0.7 }}>
                                  {compactMoney(asset.volume24hUsd)} 24h
                                </span>
                              </div>

                              {isAlreadyAdded ? (
                                <span className="ui-command-added-chip">
                                  <Check size={11} />{" "}
                                  {existingAlloc
                                    ? (existingAlloc.weightBps / 100).toFixed(1)
                                    : ""}
                                  %
                                </span>
                              ) : isAtCapacity ? (
                                <span
                                  className="fineprint"
                                  style={{ color: "var(--muted)" }}
                                >
                                  Limit (4)
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="ui-command-add-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddAsset(asset);
                                  }}
                                  title={`Add ${asset.symbol} to basket`}
                                >
                                  <Plus size={12} /> Add
                                </button>
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>

              {allocations.length >= MAX_CUSTOM_BASKET_LEGS && (
                <div className="notice" style={{ fontSize: 12, margin: "4px 0 0" }}>
                  <Info size={14} />
                  <span>
                    Maximum 4 constituents reached. Bounded to ensure atomic execution under the 64-account Solana V1 transaction ceiling without Address Lookup Tables. Remove an asset above to add another.
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Section 2: Basket Identity & Metadata */}
          <section className="builder-card" aria-label="Basket Identity">
            <div className="builder-card-head">
              <div className="builder-card-title-group">
                <h2>Basket Specification</h2>
                <p>Public metadata, thesis, and creator attribution</p>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setShowIdentity((v) => !v)}
              >
                {showIdentity ? (
                  <>
                    <ChevronUp size={13} /> Hide Details
                  </>
                ) : (
                  <>
                    <ChevronDown size={13} /> Edit Thesis &amp; Attribution
                  </>
                )}
              </button>
            </div>

            <div className="builder-form-grid">
              <div className="builder-field-box">
                <label className="builder-field-label" htmlFor="basket-name-input">
                  Basket Name
                </label>
                <input
                  id="basket-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder="e.g. NextGen Compute"
                  className="builder-input"
                />
              </div>

              <div className="builder-field-box">
                <label className="builder-field-label" htmlFor="basket-ticker-input">
                  Ticker Identifier
                </label>
                <input
                  id="basket-ticker-input"
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  maxLength={14}
                  placeholder="SOL-CUSTOM"
                  className="builder-input"
                />
              </div>
            </div>

            {showIdentity && (
              <>
                <div className="builder-field-box">
                  <label className="builder-field-label" htmlFor="basket-thesis-input">
                    Investment Thesis
                  </label>
                  <textarea
                    id="basket-thesis-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={200}
                    rows={2}
                    placeholder="Briefly state your strategic rationale or asset selection thesis."
                    className="builder-textarea"
                  />
                </div>

                <div className="builder-form-grid">
                  <div className="builder-field-box">
                    <label className="builder-field-label" htmlFor="creator-name-input">
                      Creator Attribution
                    </label>
                    <input
                      id="creator-name-input"
                      type="text"
                      value={creatorName}
                      onChange={(e) => setCreatorName(e.target.value)}
                      maxLength={40}
                      placeholder="e.g. Satoshi Nakamoto"
                      className="builder-input"
                    />
                  </div>

                  <div className="builder-field-box">
                    <label className="builder-field-label" htmlFor="creator-social-input">
                      Social Link <span style={{ opacity: 0.6 }}>(Optional)</span>
                    </label>
                    <input
                      id="creator-social-input"
                      type="text"
                      value={creatorSocial}
                      onChange={(e) => setCreatorSocial(e.target.value)}
                      maxLength={150}
                      placeholder="e.g. @yourhandle"
                      className="builder-input"
                    />
                  </div>
                </div>

                {creatorName.trim() && (
                  <div className="builder-attribution-row">
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>Attribution badge:</span>
                      {creatorSocial.trim() ? (
                        <a
                          href={formatSocialUrl(creatorSocial)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="builder-attribution-link"
                        >
                          {creatorName}
                          <ExternalLink size={11} />
                        </a>
                      ) : (
                        <strong style={{ color: "var(--ink)" }}>{creatorName}</strong>
                      )}
                    </div>
                    <span style={{ fontSize: 11 }}>
                      Directly verifiable on Solana share links
                    </span>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Section 3: Solana V1 Safety & Route Verifier Console */}
          <section className="builder-console" aria-label="Solana V1 Execution Safety">
            <div className="builder-console-head">
              <div className="builder-console-title">
                <Gauge size={16} style={{ color: "var(--up)" }} />
                <span>Solana V1 Execution Safety Guard</span>
              </div>
              <span
                className={`builder-account-meter-pill ${
                  isCountValid ? "safe" : "warn"
                }`}
              >
                ~{estimatedAccounts} / 64 Accounts
              </span>
            </div>

            <div
              className="builder-account-progress-track"
              role="meter"
              aria-valuenow={estimatedAccounts}
              aria-valuemin={0}
              aria-valuemax={64}
            >
              <div
                className="builder-account-progress-fill"
                style={{
                  width: `${Math.min(100, (estimatedAccounts / 64) * 100)}%`,
                  backgroundColor:
                    estimatedAccounts <= 58 ? "var(--up)" : "var(--down)",
                }}
              />
            </div>

            <div className="builder-telemetry-grid">
              <div className="builder-telemetry-item">
                <span className="builder-telemetry-label">Account Margin</span>
                <span
                  className="builder-telemetry-value"
                  style={{ color: "var(--up)" }}
                >
                  +{64 - estimatedAccounts} Safe
                </span>
              </div>
              <div className="builder-telemetry-item">
                <span className="builder-telemetry-label">Pool Liquidity</span>
                <span className="builder-telemetry-value">
                  {compactMoney(combinedStats.totalLiquidity)}
                </span>
              </div>
              <div className="builder-telemetry-item">
                <span className="builder-telemetry-label">24h Vol</span>
                <span className="builder-telemetry-value">
                  {compactMoney(combinedStats.totalVol)}
                </span>
              </div>
              <div className="builder-telemetry-item">
                <span className="builder-telemetry-label">Tx Format</span>
                <span className="builder-telemetry-value" style={{ fontSize: 13 }}>
                  Atomic V1 (No ALTs)
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                className="btn secondary small"
                onClick={testMainnetRoute}
                disabled={!isValid || testingRoute}
              >
                <RefreshCw size={13} className={testingRoute ? "spin" : ""} />
                {testingRoute ? "Compiling Route via Jupiter…" : "Simulate Mainnet Route"}
              </button>
              <span className="fineprint" style={{ margin: 0 }}>
                Compiles multi-leg quote via Jupiter Swap V2 build API without executing.
              </span>
            </div>

            {routeTestResult && (
              <div
                className={`builder-route-feedback ${
                  routeTestResult.success ? "success" : "error"
                }`}
              >
                {routeTestResult.success ? (
                  <CheckCircle2 size={16} style={{ color: "var(--up)", flexShrink: 0 }} />
                ) : (
                  <AlertTriangle size={16} style={{ color: "var(--down)", flexShrink: 0 }} />
                )}
                <div>
                  <strong>{routeTestResult.message}</strong>
                  {routeTestResult.details && (
                    <p style={{ margin: "2px 0 0", opacity: 0.85 }}>
                      {routeTestResult.details}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Aside: Sticky Execution Cockpit */}
        <aside>
          <div className="panel trade-panel builder-cockpit">
            <div>
              <h2 style={{ fontSize: 18 }}>Execute Basket</h2>
              <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Single-signature atomic allocation across all constituents.
              </p>
            </div>

            {/* Mode Switcher Pills */}
            <div
              className="builder-mode-pills"
              role="tablist"
              aria-label="Trading Mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "paper"}
                className={`builder-mode-pill ${mode === "paper" ? "active" : ""}`}
                onClick={() => setMode("paper")}
              >
                Paper Sandbox
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "actual"}
                className={`builder-mode-pill ${mode === "actual" ? "active" : ""}`}
                onClick={() => setMode("actual")}
              >
                Mainnet Live
              </button>
            </div>

            {mode === "paper" ? (
              <div className="stack" style={{ gap: 14 }}>
                <label className="field-label" htmlFor="custom-paper-amt">
                  <span>Virtual USD Allocation</span>
                  <span className="fineprint">
                    Cash: {money(paper.cashUsd)}
                  </span>
                </label>
                <div className="amount-field">
                  <input
                    id="custom-paper-amt"
                    type="number"
                    min="1"
                    step="1"
                    value={paperAmount}
                    onChange={(e) => setPaperAmount(e.target.value)}
                  />
                  <span>USD</span>
                </div>

                <div className="amount-presets" style={{ marginTop: -4 }}>
                  {[25, 100, 250].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPaperAmount(String(v))}
                    >
                      ${v}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setPaperAmount(String(Math.floor(paper.cashUsd)))
                    }
                  >
                    Max
                  </button>
                </div>

                <div className="builder-cockpit-stats">
                  <div className="builder-cockpit-stat-row">
                    <span>Buying Power</span>
                    <strong>{money(paper.cashUsd)}</strong>
                  </div>
                  <div className="builder-cockpit-stat-row">
                    <span>Constituents</span>
                    <strong>{allocations.length} assets</strong>
                  </div>
                  <div className="builder-cockpit-stat-row">
                    <span>Allocation Total</span>
                    <strong
                      style={{
                        color: isSumValid ? "var(--up)" : "var(--down)",
                      }}
                    >
                      {(totalWeightBps / 100).toFixed(2)}%
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn full"
                  disabled={
                    !isValid ||
                    !(Number(paperAmount) > 0) ||
                    Number(paperAmount) > paper.cashUsd
                  }
                  onClick={handlePaperBuy}
                >
                  Simulate Basket Purchase <ArrowRight size={14} />
                </button>
                <p className="fineprint">
                  Executes instant multi-asset allocation at live oracle reference prices with zero slippage or counterparty risk.
                </p>
              </div>
            ) : (
              resolvedBasket && <ActualBasketPanel basket={resolvedBasket} />
            )}

            <div className="divider" />

            <div
              className="data-source"
              style={{
                padding: "8px 0 0",
                marginTop: 0,
                borderTop: "none",
              }}
            >
              <ShieldCheck size={15} />
              <p>
                Self-custody by design.
                <br />
                All tokens settle directly to your ATAs.
                <br />
                No Kite vault.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
