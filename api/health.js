export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://stripe.webcap.media');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    return res.status(200).json({ ok: true });
}
