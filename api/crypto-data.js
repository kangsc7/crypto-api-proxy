const axios = require('axios');

// 메모리 캐시 (Vercel 서버리스 환경용)
let cache = {
  data: null,
  timestamp: 0
};

const CACHE_DURATION = 60000; // 1분 캐시
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

module.exports = async (req, res) => {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  
  // 캐시 확인
  const now = Date.now();
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
    
    // 병렬로 모든 데이터 가져오기
    const [globalData, pricesData, bitcoinChart] = await Promise.all([
      // 글로벌 시장 데이터
      axios.get(`${COINGECKO_API}/global`),
      
      // 주요 코인 가격 (한 번의 요청으로)
      axios.get(`${COINGECKO_API}/simple/price`, {
        params: {
          ids: 'bitcoin,ethereum,ripple,solana,stellar',
          vs_currencies: 'usd',
          include_24hr_change: true,
          include_24hr_vol: true,
          include_market_cap: true
        }
      }),
      
      // 비트코인 차트 (1일)
      axios.get(`${COINGECKO_API}/coins/bitcoin/market_chart`, {
        params: {
          vs_currency: 'usd',
          days: 1,
          interval: 'hourly'
        }
      })
    ]);
    
    // 응답 데이터 구성
    const responseData = {
      global: globalData.data.data,
      prices: pricesData.data,
      bitcoinChart: bitcoinChart.data,
      timestamp: now,
      cached: false
    };
    
    // 캐시 업데이트
    cache = {
      data: responseData,
      timestamp: now
    };
    
    // 클라이언트에 전송
    res.status(200).json(responseData);
    
  } catch (error) {
    console.error('API Error:', error.message);
    
    // 에러 시 캐시된 데이터라도 반환
    if (cache.data) {
      return res.status(200).json({
        ...cache.data,
        cached: true,
        error: 'Using stale cache due to API error'
      });
    }
    
    // 캐시도 없으면 에러 반환
    res.status(500).json({
      error: 'Failed to fetch data',
      message: error.message
    });
  }
};
