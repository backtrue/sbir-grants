const http = require('http');

const body = JSON.stringify({ company_name: "Test Company" });

const req = http.request(
  {
    hostname: 'localhost',
    port: 8787,
    path: '/api/ai/project/1/generate-outline', // Note: Need a valid project ID or bypass it in the handler
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      // We will inject a backdoor in the auth middleware momentarily
    }
  },
  (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
      console.log('No more data in response.');
    });
  }
);

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(body);
req.end();
