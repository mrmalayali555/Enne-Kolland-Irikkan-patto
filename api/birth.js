import 'dotenv/config';
import { raceBirth, raceManualBirth } from '../server.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, manualName } = req.body || {};

  if (!image && !manualName) {
    return res.status(400).json({ error: 'No image or object name provided' });
  }

  try {
    let dna;
    if (image) {
      dna = await raceBirth(image);
    } else {
      dna = await raceManualBirth(manualName);
    }
    return res.json({ success: true, dna });
  } catch (err) {
    console.error('[API/BIRTH ERROR]', err.message);
    return res.status(500).json({ error: 'AI birth failed', details: err.message });
  }
}
