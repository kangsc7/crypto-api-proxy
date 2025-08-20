module.exports = async (req, res) => {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 메모리 캐시
  const cache = global.cryptoCache || { data: null, timestamp: 0 };
  const CACHE_DURATION = 60000; // 1분
  const now = Date.now();

  // 캐시 확인
  if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
    console.log('Serving from cache');
    return res.status(200).json({
      ...cache.data,
      cached: true,
      cacheAge: now - cache.timestamp
    });
  }

  try {
    console.log('Fetching fresh data from CoinGecko');
    
    // CoinGecko API 호출
    const [globalResponse, pricesResponse, chartResponse] = await Promise.all([
      // 글로벌 데이터
      fetch('https://api.coingecko.com/api/v3/global'),
      
      // 가격 데이터 (파이 네트워크 포함)
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,pi-network-defi,ripple,solana,stellar&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true'),
      
      // 비트코인 차트
      fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1&interval=hourly')
    ]);

    const globalData = await globalResponse.json();
    const pricesData = await pricesResponse.json();
    const chartData = await chartResponse.json();

    // Pi Network 데이터 처리 (pi-network-defi를 pi-network로 매핑)
    if (pricesData['pi-network-defi']) {
      pricesData['pi-network'] = pricesData['pi-network-defi'];
      delete pricesData['pi-network-defi'];
    }

    // 응답 데이터 구성
    const responseData = {
      global: globalData.data,
      prices: pricesData,
      bitcoinChart: chartData,
      timestamp: now,
      cached: false
    };

    // 캐시 업데이트
    global.cryptoCache = {
      data: responseData,
      timestamp: now
    };

    res.status(200).json(responseData);

  } catch (error) {
    console.error('API Error:', error.message);
    
    // 에러 시 캐시된 데이터 반환
    if (cache.data) {
      return res.status(200).json({
        ...cache.data,
        cached: true,
        error: 'Using stale cache due to API error'
      });
    }

    // 모의 데이터 반환
    res.status(200).json({
      global: {
        total_market_cap: { usd: 3880000000000 },
        total_volume: { usd: 163740000000 },
        active_cryptocurrencies: 18227,
        market_cap_change_percentage_24h_usd: -3.12
      },
      prices: {
        bitcoin: { usd: 65432, usd_24h_change: 2.5 },
        ethereum: { usd: 3456, usd_24h_change: -1.2 },
        'pi-network': { usd: 31.45, usd_24h_change: 4.2 },
        ripple: { usd: 0.62, usd_24h_change: 3.8 },
        solana: { usd: 125, usd_24h_change: 5.2 },
        stellar: { usd: 0.25, usd_24h_change: -0.8 }
      },
      bitcoinChart: {
        prices: Array.from({ length: 24 }, (_, i) => [
          Date.now() - (24 - i) * 3600000,
          65000 + Math.sin(i / 4) * 2000 + Math.random() * 1000
        ])
      },
      timestamp: now,
      cached: false,
      mock: true
    });
  }
};
