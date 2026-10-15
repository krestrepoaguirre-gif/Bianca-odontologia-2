// netlify/functions/send-conversion-event.js
//
// Recibe eventos de conversión desde el navegador (hero, oferta y CTA final
// de la landing de Bianca Odontología) y los reenvía server-side a la API
// de Conversiones de Meta, deduplicados contra el Pixel vía event_id.
//
// El Access Token NUNCA vive en este archivo ni en el repositorio: se lee
// únicamente de la variable de entorno META_CAPI_ACCESS_TOKEN, configurada
// a mano por el dueño del sitio en Netlify (Site settings > Environment
// variables). Si no está presente, la función responde 500 y no envía nada.
const PIXEL_ID = '675376958999264';
const GRAPH_API_VERSION = 'v19.0';
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'META_CAPI_ACCESS_TOKEN no está configurado en las variables de entorno de Netlify.' }),
    };
  }
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido en el body.' }) };
  }
  const { event_name, event_id, event_source_url, fbp, fbc } = payload;
  if (!event_name || !event_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'event_name y event_id son obligatorios.' }) };
  }
  const headers = event.headers || {};
  const clientIp =
    headers['x-nf-client-connection-ip'] ||
    (headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    undefined;
  const userAgent = headers['user-agent'] || undefined;
  const userData = {};
  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  const metaPayload = {
    data: [
      {
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: event_source_url || '',
        action_source: 'website',
        event_id,
        user_data: userData,
      },
      ],
  };
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(accessToken)}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaPayload),
    });
    const body = await response.text();
    return { statusCode: response.status, headers: { 'Content-Type': 'application/json' }, body };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'No se pudo contactar a Meta.', detail: String(err) }),
    };
  }
};
