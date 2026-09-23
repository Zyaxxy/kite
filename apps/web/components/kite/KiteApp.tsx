"use client";
import { Shell } from "./Shell";
import { Baskets, Discover, Markets, Watchlist } from "./Discover";
import { Activity, Plans, Portfolio, Settings } from "./Account";
import { BasketDetail, StockDetail } from "./Details";
import { BasketBuilder } from "./BasketBuilder";
import { Landing } from "./Landing";
export type KitePage =
  | "discover"
  | "markets"
  | "baskets"
  | "portfolio"
  | "plans"
  | "watchlist"
  | "activity"
  | "settings"
  | "stock"
  | "basket"
  | "basket-builder"
  | "landing";
const titles: Record<KitePage, string> = {
  discover: "Discover",
  markets: "Discover",
  baskets: "Baskets",
  portfolio: "Portfolio",
  plans: "Recurring",
  watchlist: "Watchlist",
  activity: "Activity",
  settings: "Settings",
  stock: "Asset details",
  basket: "Basket details",
  "basket-builder": "Build Custom Basket",
  landing: "Kite",
};
export function KiteApp({
  page = "discover",
  symbol = "",
  basketId = "",
}: {
  page?: KitePage;
  symbol?: string;
  basketId?: string;
}) {
  let content: React.ReactNode;
  switch (page) {
    case "markets":
      content = <Markets />;
      break;
    case "baskets":
      content = <Baskets />;
      break;
    case "portfolio":
      content = <Portfolio />;
      break;
    case "plans":
      content = <Plans />;
      break;
    case "watchlist":
      content = <Watchlist />;
      break;
    case "activity":
      content = <Activity />;
      break;
    case "settings":
      content = <Settings />;
      break;
    case "stock":
      content = <StockDetail symbol={symbol} />;
      break;
    case "basket":
      content = <BasketDetail id={basketId} />;
      break;
    case "basket-builder":
      content = <BasketBuilder />;
      break;
    default:
      content = <Discover />;
  }
  return page === "landing" ? (
    <Landing />
  ) : (
    <Shell title={titles[page]}>{content}</Shell>
  );
}
