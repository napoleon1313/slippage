import { NextResponse } from "next/server";
import { TOKEN_CONFIGS } from "@/lib/tokenomics";
import type { LiveTokenData } from "@/lib/tokenomics";

export const revalidate = 300; // 5-minute server-side cache

async function fetchCoinGecko(coinGeckoId: string): Promise<{
  price: number | null;
  circulatingSupply: number | null;
  marketCap: number | null;
  fdv: number | null;
  error?: string;
}> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinGeckoId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) {
      return { price: null, circulatingSupply: null, marketCap: null, fdv: null, error: `CoinGecko ${res.status}` };
    }
    const data = await res.json();
    const md = data.market_data;
    return {
      price: md?.current_price?.usd ?? null,
      circulatingSupply: md?.circulating_supply ?? null,
      marketCap: md?.market_cap?.usd ?? null,
      fdv: md?.fully_diluted_valuation?.usd ?? null,
    };
  } catch (e) {
    return { price: null, circulatingSupply: null, marketCap: null, fdv: null, error: String(e) };
  }
}

async function fetchDefiLlama(slug: string): Promise<{
  fees30d: number | null;
  revenue30d: number | null;
  error?: string;
}> {
  try {
    const [feesRes, revenueRes] = await Promise.all([
      fetch(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`, { next: { revalidate: 300 } }),
      fetch(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyRevenue`, { next: { revalidate: 300 } }),
    ]);

    const sumLast30 = (data: unknown): number | null => {
      const d = data as Record<string, unknown>;
      const chart = d?.totalDataChart as [number, number][] | undefined;
      if (!Array.isArray(chart) || chart.length === 0) return null;
      const last30 = chart.slice(-30);
      return last30.reduce((sum, [, v]) => sum + (v || 0), 0);
    };

    let fees30d: number | null = null;
    let revenue30d: number | null = null;
    const errors: string[] = [];

    if (feesRes.ok) {
      fees30d = sumLast30(await feesRes.json());
    } else {
      errors.push(`DefiLlama fees ${feesRes.status}`);
    }

    if (revenueRes.ok) {
      revenue30d = sumLast30(await revenueRes.json());
    } else {
      errors.push(`DefiLlama revenue ${revenueRes.status}`);
    }

    return { fees30d, revenue30d, error: errors.length ? errors.join("; ") : undefined };
  } catch (e) {
    return { fees30d: null, revenue30d: null, error: String(e) };
  }
}

export async function GET() {
  const results = await Promise.all(
    TOKEN_CONFIGS.map(async (cfg): Promise<LiveTokenData> => {
      const [cg, dl] = await Promise.all([
        fetchCoinGecko(cfg.coinGeckoId),
        fetchDefiLlama(cfg.defiLlamaSlug),
      ]);

      const errors: string[] = [];
      if (cg.error) errors.push(cg.error);
      if (dl.error) errors.push(dl.error);

      return {
        tokenId: cfg.id,
        price: cg.price,
        circulatingSupply: cg.circulatingSupply,
        marketCap: cg.marketCap,
        fdv: cg.fdv,
        fees30d: dl.fees30d,
        revenue30d: dl.revenue30d,
        fetchedAt: Date.now(),
        errors,
      };
    })
  );

  return NextResponse.json({ data: results, fetchedAt: Date.now() });
}
