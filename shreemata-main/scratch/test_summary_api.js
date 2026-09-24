const http = require('http');

http.get('http://localhost:3000/api/admin/commission-fund/summary', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    try {
      const json = JSON.parse(data);
      console.log('SUCCESS:', json.success);
      console.log('SUMMARY:', json.data.summary);
      console.log('LIABILITIES BREAKDOWN:', json.data.liabilitiesBreakdown);
    } catch(e) {
      console.log('RAW BODY:', data.substring(0, 300));
    }
  });
}).on('error', err => console.error('ERROR:', err.message));
