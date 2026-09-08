const http = require('http');

http.get('http://localhost:3000/', (res) => {
    let html = '';
    res.on('data', chunk => html += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Contains main-header:', html.includes('main-header'));
        console.log('Length:', html.length);
    });
}).on('error', err => {
    console.error('Error fetching localhost:3000:', err);
});
