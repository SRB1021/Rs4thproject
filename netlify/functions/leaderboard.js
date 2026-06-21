exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores: [] }),
    };
  }

  if (event.httpMethod === 'POST') {
    const { name, score } = JSON.parse(event.body || '{}');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, name, score }),
    };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
