"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers3,
  Plus,
  Scale,
  Search,
  Trash2,
} from "lucide-react";
import {
  autoBalanceWeights,
  calculateEqualWeights,
  decodeBasketShareCode,
  forkCuratedBasket,
  MAX_CUSTOM_BASKET_LEGS,
  validateProgrammableBasket,
  type BasketAllocation,
  type ProgrammableBasket,
  type PublishedCreatorBasket,
} from "@kite/sdk";
import { useKite } from "./State";
import { AssetAvatar, money } from "./MarketUI";
import { useTradingAuth } from "../trading/TradingAuth";
import { WalletButton } from "../trading/WalletButton";
import styles from "./Creator.module.css";

export function BasketBuilder() {
  return (
    <Suspense
      fallback={
        <p className="notice" role="status">
          Opening the basket studio…
        </p>
      }
    >
      <BasketStudio />
    </Suspense>
  );
}
function BasketStudio() {
  const { snapshot, saveCustomBasket } = useKite();
  const auth = useTradingAuth(),
    router = useRouter(),
    params = useSearchParams();
  const [step, setStep] = useState(0),
    [query, setQuery] = useState(""),
    [allocations, setAllocations] = useState<BasketAllocation[]>([]);
  const [name, setName] = useState(""),
    [ticker, setTicker] = useState(""),
    [description, setDescription] = useState(""),
    [creatorName, setCreatorName] = useState("");
  const [invite, setInvite] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const loaded = useRef(""),
    wallet = useRef(auth.walletAddress),
    draftId = useRef("");
  wallet.current = auth.walletAddress;
  const deferredQuery = useDeferredValue(query);
  const assets = useMemo(
    () =>
      (snapshot?.assets ?? []).filter((a) => a.verified && !a.tradingHalted),
    [snapshot],
  );
  const byMint = useMemo(
    () => new Map(assets.map((a) => [a.mint, a])),
    [assets],
  );
  const matches = useMemo(
    () =>
      assets
        .filter((a) =>
          `${a.name} ${a.symbol} ${a.underlyingSymbol ?? ""}`
            .toLowerCase()
            .includes(deferredQuery.trim().toLowerCase()),
        )
        .slice(0, 50),
    [assets, deferredQuery],
  );
  const total = allocations.reduce((sum, a) => sum + a.weightBps, 0);
  const seed = params.get("fork") ?? params.get("import") ?? "";
  useEffect(() => {
    if (!seed || !snapshot || loaded.current === seed) return;
    const basket = params.get("import")
      ? decodeBasketShareCode(seed)
      : (() => {
          const selected = snapshot.baskets.find((b) => b.id === seed);
          return selected ? forkCuratedBasket(selected) : null;
        })();
    if (!basket) return;
    loaded.current = seed;
    setAllocations(basket.allocations);
    setName(basket.name);
    setTicker(basket.ticker);
    setDescription(basket.description);
    setCreatorName(basket.creatorName ?? "");
    setDirty(true);
  }, [seed, snapshot, params]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function choose(mint: string) {
    const found = byMint.get(mint);
    if (!found) return;
    setError("");
    setDirty(true);
    setAllocations((previous) => {
      const selected = previous.some((a) => a.mint === mint)
        ? previous.filter((a) => a.mint !== mint)
        : previous.length < MAX_CUSTOM_BASKET_LEGS
          ? [
              ...previous,
              {
                mint,
                symbol: found.underlyingSymbol || found.symbol,
                name: found.name,
                weightBps: 0,
              },
            ]
          : previous;
      return selected.length ? calculateEqualWeights(selected) : [];
    });
  }
  function basket(): ProgrammableBasket {
    if (!draftId.current) draftId.current = `custom-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    return validateProgrammableBasket({
      id: draftId.current,
      name,
      ticker,
      description,
      creatorName,
      allocations,
      category: "custom",
      createdAt: now,
      updatedAt: now,
      isCustom: true,
      rebalanceRules: { driftThresholdBps: 500, schedule: "none" },
    });
  }
  function next() {
    setError("");
    if (allocations.length < 2) {
      setError("Choose at least 2 assets to build a basket.");
      return;
    }
    if (
      step === 1 &&
      (total !== 10000 || allocations.some((a) => a.weightBps <= 0))
    ) {
      setError(
        "Give every asset a positive weight and bring the total to 100%.",
      );
      return;
    }
    setStep((value) => Math.min(value + 1, 2));
  }
  function save() {
    try {
      const value = basket();
      saveCustomBasket(value);
      setDirty(false);
      router.push(`/basket/${value.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your draft.");
    }
  }
  async function publish() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const value = basket(),
        owner = auth.walletAddress;
      if (!owner || !auth.canSignMessage)
        throw new Error("Connect a wallet that supports message signing.");
      if (!invite.trim())
        throw new Error(
          "Enter your creator invite code to publish. You can also save a private basket.",
        );
      saveCustomBasket(value);
      const response = await fetch("/api/creators/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: owner, basket: value }),
      });
      const approval = (await response.json()) as {
        token: string;
        message: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(approval.error ?? "Could not prepare publishing.");
      const signature = await auth.signMessage(approval.message);
      if (wallet.current !== owner)
        throw new Error("Your wallet changed. Review the basket again.");
      const published = await fetch("/api/creators/baskets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: approval.token,
          signature,
          inviteCode: invite,
        }),
      });
      const result = (await published.json()) as {
        basket: PublishedCreatorBasket;
        error?: string;
      };
      if (!published.ok)
        throw new Error(result.error ?? "Could not publish your basket.");
      window.dispatchEvent(new Event("kite:creator-published"));
      setInvite("");
      setDirty(false);
      router.push(`/basket/${result.basket.id}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not publish. Your private draft is saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.studio}>
      <div className={styles.heading}>
        <div>
          <Link href="/baskets" className="text-link">
            <ArrowLeft size={15} aria-hidden="true" />
            The collection
          </Link>
          <p className="eyebrow">Creator studio</p>
          <h1>Put your idea together.</h1>
          <p>Choose the companies. Set the balance. Make it your own.</p>
        </div>
        <Link href="/creators" className="btn secondary small">
          Creator activity <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <nav className={styles.steps} aria-label="Basket creation steps">
        {["Choose assets", "Set the weights", "Review & save"].map(
          (label, index) => (
            <button
              key={label}
              type="button"
              aria-current={step === index ? "step" : undefined}
              disabled={index > step || busy}
              onClick={() => {
                setError("");
                setStep(index);
              }}
            >
              <span>
                {index < step ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  `0${index + 1}`
                )}
              </span>
              {label}
            </button>
          ),
        )}
      </nav>
      <div className={styles.layout}>
        <section className={styles.editor} aria-labelledby="studio-step-title">
          <div className={styles.sectionTitle}>
            <h2 id="studio-step-title">
              {
                [
                  "A theme starts with its companies.",
                  "Give each idea its space.",
                  "Ready to make it yours?",
                ][step]
              }
            </h2>
            <p>
              {
                [
                  `Choose 2–${MAX_CUSTOM_BASKET_LEGS} verified assets. You can adjust each allocation next.`,
                  "Weights are exact to two decimal places. Every basket must total 100%.",
                  "Private baskets stay on this device. Publishing creates an immutable public allocation.",
                ][step]
              }
            </p>
          </div>
          {step === 0 ? (
            <>
              <label className={styles.search}>
                <Search size={17} aria-hidden="true" />
                <input
                  name="asset-search"
                  aria-label="Search verified assets"
                  placeholder="Search companies or symbols…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <div className={styles.assetList}>
                {matches.length ? (
                  matches.map((asset) => {
                    const selected = allocations.some(
                      (a) => a.mint === asset.mint,
                    );
                    return (
                      <button
                        type="button"
                        key={asset.mint}
                        className={styles.asset}
                        aria-pressed={selected}
                        disabled={
                          !selected &&
                          allocations.length >= MAX_CUSTOM_BASKET_LEGS
                        }
                        onClick={() => choose(asset.mint)}
                      >
                        <AssetAvatar asset={asset} />
                        <span>
                          <strong>{asset.name.replace(/ xStock$/i, "")}</strong>
                          <small>
                            {asset.underlyingSymbol || asset.symbol} ·{" "}
                            {asset.issuer}
                          </small>
                        </span>
                        <span className={styles.price}>
                          {money(asset.priceUsd)}
                          <small>Token price</small>
                        </span>
                        <span
                          className={selected ? styles.selected : styles.add}
                        >
                          {selected ? (
                            <Check size={15} aria-hidden="true" />
                          ) : (
                            <Plus size={15} aria-hidden="true" />
                          )}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className={styles.empty}>
                    <Search size={24} aria-hidden="true" />
                    <h3>
                      {assets.length
                        ? "No matching companies"
                        : "Waiting for the issuer catalog"}
                    </h3>
                    <p>
                      {assets.length
                        ? "Try a name or a different symbol."
                        : "Verified assets will appear when market data is available."}
                    </p>
                  </div>
                )}
              </div>
              {matches.length === 50 && (
                <p className="fineprint">
                  Showing the first 50 matches. Search to narrow the list.
                </p>
              )}
            </>
          ) : null}
          {step === 1 ? (
            <>
              <div className={styles.weightHeading}>
                <span>{allocations.length} selected assets</span>
                <div className={styles.weightActions}>
                  <button
                    type="button"
                    className={styles.autoBalanceActionBtn}
                    onClick={() => {
                      setAllocations(autoBalanceWeights(allocations));
                      setDirty(true);
                    }}
                    title="Auto balance allocations to exactly 100% using Hare-Niemeyer largest remainder algorithm"
                  >
                    <Scale size={13} aria-hidden="true" />
                    Auto balance
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      setAllocations(calculateEqualWeights(allocations));
                      setDirty(true);
                    }}
                  >
                    Equal weights
                  </button>
                </div>
              </div>
              {allocations.map((allocation) => {
                const asset = byMint.get(allocation.mint);
                const weightPct = allocation.weightBps / 100;
                return (
                  <div className={styles.weightRow} key={allocation.mint}>
                    {asset ? (
                      <AssetAvatar asset={asset} />
                    ) : (
                      <Layers3 aria-hidden="true" />
                    )}
                    <div className={styles.assetMeta}>
                      <strong>{allocation.symbol}</strong>
                      <small>{allocation.name}</small>
                    </div>

                    <div className={styles.weightControls}>
                      <input
                        type="range"
                        min="1"
                        max="99"
                        step="1"
                        value={Math.min(99, Math.max(1, Math.round(weightPct)))}
                        onChange={(e) => {
                          const val = Math.max(
                            1,
                            Math.min(
                              9900,
                              Math.round(Number(e.target.value) * 100),
                            ),
                          );
                          setAllocations((items) =>
                            items.map((item) =>
                              item.mint === allocation.mint
                                ? { ...item, weightBps: val }
                                : item,
                            ),
                          );
                          setDirty(true);
                        }}
                        className={styles.rangeSlider}
                        aria-label={`${allocation.symbol} weight percentage slider`}
                      />

                      <label className={styles.weightInput}>
                        <input
                          name={`weight-${allocation.mint}`}
                          aria-label={`${allocation.symbol} allocation percent`}
                          type="number"
                          min="0.01"
                          max="99.99"
                          step="0.01"
                          inputMode="decimal"
                          value={allocation.weightBps / 100}
                          onChange={(e) => {
                            const raw = parseFloat(e.target.value);
                            const weight = Number.isNaN(raw)
                              ? 0
                              : Math.max(
                                  0,
                                  Math.min(10000, Math.round(raw * 100)),
                                );
                            setAllocations((items) =>
                              items.map((item) =>
                                item.mint === allocation.mint
                                  ? { ...item, weightBps: weight }
                                  : item,
                              ),
                            );
                            setDirty(true);
                          }}
                        />
                        <span>%</span>
                      </label>

                      <span
                        className={styles.bpsBadge}
                        title={`${allocation.weightBps} basis points`}
                      >
                        {allocation.weightBps} bps
                      </span>
                    </div>

                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove ${allocation.symbol}`}
                      onClick={() => choose(allocation.mint)}
                      title={`Remove ${allocation.symbol}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
              <div className={styles.total} data-valid={total === 10000}>
                <div>
                  <span>Total allocation</span>
                  {total !== 10000 && (
                    <small className={styles.totalDiff}>
                      {total < 10000
                        ? `${((10000 - total) / 100).toFixed(2)}% unallocated`
                        : `+${((total - 10000) / 100).toFixed(2)}% overallocated`}
                    </small>
                  )}
                </div>
                <div className={styles.totalActionGroup}>
                  <strong>{(total / 100).toFixed(2)}%</strong>
                  {total !== 10000 && (
                    <button
                      type="button"
                      className={styles.autoBalanceBtn}
                      onClick={() => {
                        setAllocations(autoBalanceWeights(allocations));
                        setDirty(true);
                      }}
                      title="Auto balance allocations to exactly 100% using Hare-Niemeyer algorithm"
                    >
                      Auto balance
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : null}
          {step === 2 ? (
            <div className={styles.form}>
              <label>
                Basket name
                <input
                  name="basket-name"
                  autoComplete="off"
                  value={name}
                  maxLength={50}
                  placeholder="Give your idea a name…"
                  onChange={(e) => {
                    setName(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <div className={styles.formPair}>
                <label>
                  Ticker
                  <input
                    name="basket-ticker"
                    autoComplete="off"
                    value={ticker}
                    maxLength={15}
                    placeholder="MY-BASKET…"
                    onChange={(e) => {
                      setTicker(e.target.value.toUpperCase());
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Creator name <span className="muted">optional</span>
                  <input
                    name="creator-name"
                    autoComplete="nickname"
                    value={creatorName}
                    maxLength={50}
                    placeholder="Your name…"
                    onChange={(e) => {
                      setCreatorName(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
              </div>
              <label>
                What connects these companies?
                <textarea
                  name="basket-description"
                  rows={3}
                  value={description}
                  maxLength={500}
                  placeholder="Explain your theme and the risks to consider…"
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <div className={styles.invite}>
                <div>
                  <h3>Share your point of view.</h3>
                  <p>
                    Invited creators can publish to the collection and share a
                    subscription Blink. Signing approves only this allocation.
                  </p>
                </div>
                <label>
                  Creator invite code
                  <input
                    name="creator-invite"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={256}
                    value={invite}
                    onChange={(e) => setInvite(e.target.value)}
                    placeholder="Enter your invitation…"
                  />
                </label>
                {!auth.walletAddress && <WalletButton />}
              </div>
            </div>
          ) : null}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className={styles.editorFooter}>
            {step > 0 ? (
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                Back
              </button>
            ) : (
              <span className="fineprint">
                {allocations.length} of {MAX_CUSTOM_BASKET_LEGS} assets
              </span>
            )}
            <div>
              {step < 2 ? (
                <button type="button" className="btn" onClick={next}>
                  {step === 0 ? "Set allocations" : "Review basket"}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={save}
                  >
                    Save private basket
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void publish()}
                  >
                    {busy ? "Publishing…" : "Publish with invite"}
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
        <aside className={styles.preview} aria-label="Your basket preview">
          <p className="eyebrow">Your allocation</p>
          <h2>{name.trim() || "An idea, taking shape."}</h2>
          <p>
            {description.trim() || "Your selected companies will appear here."}
          </p>
          <div className={styles.allocationTrack} aria-hidden="true">
            {allocations.map((a, i) => (
              <span
                key={a.mint}
                style={{
                  flex: Math.max(1, a.weightBps),
                  opacity: 1 - (i % 6) * 0.12,
                }}
              />
            ))}
          </div>
          {allocations.length ? (
            allocations.map((a) => (
              <div key={a.mint} className={styles.previewRow}>
                <span>{a.symbol}</span>
                <strong>{(a.weightBps / 100).toFixed(2)}%</strong>
              </div>
            ))
          ) : (
            <div className={styles.empty}>
              <Layers3 size={28} aria-hidden="true" />
              <p>Add your first company to begin.</p>
            </div>
          )}
          {allocations.length > 0 && (
            <div className={styles.previewNote} aria-live="polite">
              <strong>
                {allocations.every(
                  (a) => (byMint.get(a.mint)?.priceUsd ?? 0) > 0,
                )
                  ? "Prices available · route checked at review"
                  : "Some asset prices are unavailable"}
              </strong>
              <p>
                {allocations.length} selected assets ·{" "}
                {(total / 100).toFixed(2)}% allocated. No route or liquidity
                claim is made until a fresh quote is prepared.
              </p>
            </div>
          )}
          <div className={styles.previewNote}>
            <strong>A basket is an allocation.</strong>
            <p>
              Purchases deliver individual tokens to your wallet. The live
              route, account count and transaction size determine whether your
              review uses one transaction or a Jito bundle. A saved allocation
              is not an execution guarantee. Recurring uses devnet test tokens.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
