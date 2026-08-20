const http = require('http');
http.get('http://localhost:3000/', (r) => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    console.log('STATUS:', r.statusCode);
    console.log('Has base ./ :', d.includes('base href="./"'));
    console.log('Has gstatic.com :', d.includes('gstatic.com'));
    console.log('Has canvaskit/ config :', d.includes('canvasKitBaseUrl'));
    console.log('Has useLocalCanvasKit :', d.includes('useLocalCanvasKit'));
    console.log('---FULL HTML---');
    console.log(d);
  });
});
